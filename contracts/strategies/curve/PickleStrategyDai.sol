pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./interfaces/Gauge.sol";
import "./interfaces/ICurve3Pool.sol";
import "./interfaces/yVault.sol";
import "../../uniswap/interfaces/IUniswapV2Router02.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../hardworkInterface/IVault.sol";
import "../../Controllable.sol";
import "../ProfitNotifier.sol";
import "../../sushiswap/interfaces/IMasterChef.sol";

interface Pickle {
  function withdrawAll() external;
  function depositAll() external;
  function getRatio() external view returns (uint256);
  function withdraw(uint256) external;
}

/**
* Based on https://etherscan.io/address/0x1BB74b5DdC1f4fC91D6f9E7906cf68bc93538e33#code
*/
contract PickleStrategyDai is IStrategy, ProfitNotifier {

  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  event Liquidating(uint256 amount);
  event NotLiquidating();

  // the 3pool token
  address public underlying;
  // the pickle jar
  address public pickleJar;
  // the pickle token address
  address public pickleToken;
  // the master chef contract
  address public masterChef;
  // id of the pool in master chef
  uint256 public poolId;
  // is liquidation allowed
  bool public liquidationAllowed;
  // pickle -> DAI liquidation path
  address[] public path;
  // the address of DAI, used for liquidation
  address public dai;
  // the address of uniswap
  address public uni;

  // these tokens cannot be claimed by the governance
  mapping(address => bool) public unsalvagableTokens;

  // our vault holding the underlying token (DAI)
  address public vault;

  modifier restricted() {
    require(msg.sender == vault || msg.sender == controller()
      || msg.sender == governance(),
      "The sender has to be the controller, governance, or vault");
    _;
  }

  constructor(
    address _storage,
    address _vault,
    address _dai,
    address _pickleJar,
    address _pickleToken,
    address _masterChef,
    uint256 _poolId,
    address _weth,
    address _uniswap
  )
  ProfitNotifier(_storage, _pickleToken) public {
    require(IVault(_vault).underlying() == _dai, "vault does not support the underlying token");
    vault = _vault;
    underlying = _dai;
    pickleJar = _pickleJar;
    pickleToken = _pickleToken;
    masterChef = _masterChef;
    poolId = _poolId;
    uni = _uniswap;
    dai = _dai;
    // set these tokens to be not salvageable
    unsalvagableTokens[underlying] = true;
    unsalvagableTokens[pickleToken] = true;
    path = [pickleToken, _weth, _dai];
  }

  function depositArbCheck() public view returns(bool) {
    return true;
  }

  /**
  * Salvages a token. We should not be able to salvage Pickle and DAI (underlying).
  */
  function salvage(address recipient, address token, uint256 amount) public onlyGovernance {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvageable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  /**
  * Withdraws DAI from the investment pool that mints crops.
  */
  function withdrawFromPickle(uint256 amountUnderlying) internal {
    exitMasterChef();
    // we need to calculate the pickle shares
    uint256 underlyingPerPickleShare = Pickle(pickleJar).getRatio();
    uint256 sharesToWithdraw = amountUnderlying.mul(1e18).div(underlyingPerPickleShare);
    IERC20(pickleJar).safeApprove(pickleJar, 0);
    IERC20(pickleJar).safeApprove(pickleJar, sharesToWithdraw);
    Pickle(pickleJar).withdraw(sharesToWithdraw);
    investAllUnderlying();
  }

  /**
  * Withdraws the DAI tokens to the pool in the specified amount.
  */
  function withdrawToVault(uint256 amountUnderlying) external restricted {
    uint256 balanceBefore = IERC20(underlying).balanceOf(address(this));
    if(amountUnderlying <= balanceBefore) {
      IERC20(underlying).safeTransfer(vault, amountUnderlying);
      return;
    }

    withdrawFromPickle(amountUnderlying);
    uint256 balanceAfter = IERC20(underlying).balanceOf(address(this));
    require(balanceAfter > balanceBefore, "Cannot withdraw 0");
    IERC20(underlying).safeTransfer(vault, balanceAfter.sub(balanceBefore));
  }

  /**
  * Withdraws all the DAI tokens to the pool.
  */
  function withdrawAllToVault() external restricted {
    exitMasterChef();
    liquidate();
    IERC20(pickleJar).safeApprove(pickleJar, 0);
    IERC20(pickleJar).safeApprove(pickleJar, IERC20(pickleJar).balanceOf(address(this)));
    Pickle(pickleJar).withdrawAll();
    IERC20(underlying).safeTransfer(vault, IERC20(underlying).balanceOf(address(this)));
  }

  /**
  * Invests all the underlying DAI into the pool that mints crops (Pickle).
  */
  function investAllUnderlying() public {
    uint256 underlyingBalance = IERC20(underlying).balanceOf(address(this));
    if (underlyingBalance > 0) {
      IERC20(underlying).safeApprove(pickleJar, 0);
      IERC20(underlying).safeApprove(pickleJar, underlyingBalance);
      Pickle(pickleJar).depositAll();
    }

    uint256 pickleJarBalance = IERC20(pickleJar).balanceOf(address(this));
    if (pickleJarBalance > 0) {
      IERC20(pickleJar).safeApprove(masterChef, 0);
      IERC20(pickleJar).safeApprove(masterChef, pickleJarBalance);
      IMasterChef(masterChef).deposit(poolId, pickleJarBalance);
    }
  }

  function getMasterChefBalance() internal view returns (uint256) {
    uint256 bal;
    (bal,) = IMasterChef(masterChef).userInfo(poolId, address(this));
    return bal;
  }

  function exitMasterChef() internal {
    uint256 bal = getMasterChefBalance();
    if (bal > 0) {
      IMasterChef(masterChef).withdraw(poolId, bal);
    }
  }

  function liquidate() internal {
    if (!liquidationAllowed) {
      emit NotLiquidating();
      return;
    }
    notifyProfit(0, IERC20(pickleToken).balanceOf(address(this)));
    uint256 pickleBalance = IERC20(pickleToken).balanceOf(address(this));
    if (pickleBalance > 0) {
      IERC20(pickleToken).safeApprove(uni, 0);
      IERC20(pickleToken).safeApprove(uni, pickleBalance);
      // we can accept 1 as the minimum because this will be called only by a trusted worker
      IUniswapV2Router02(uni).swapExactTokensForTokens(
        pickleBalance, 1, path, address(this), block.timestamp
      );
      // now we have DAI
    }
  }

  /**
  * Claims and liquidates
  */
  function doHardWork() public restricted {
    exitMasterChef(); // pickles are automatically claimed here
    liquidate();
    investAllUnderlying();
  }

  /**
  * Investing all underlying.
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    uint256 pickleRatio = Pickle(pickleJar).getRatio();
    uint256 pickleShares = getMasterChefBalance();

    // note that there is 0.5% fee from Pickle is not accounted for
    // because that would artificially reduce the withdrawal amount for users
    // since investedUnderlyingBalance() takes part in share calculation
    return pickleRatio.mul(pickleShares).div(1e18);
  }

  /**
  * Allows liquidation through an external liquidator.
  */
  function setLiquidationAllowed(
    bool allowed
  ) external restricted {
    liquidationAllowed = allowed;
  }
}
