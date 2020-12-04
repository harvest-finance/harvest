pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./interfaces/Gauge.sol";
import "./interfaces/ICurveHUSDDeposit.sol";
import "../../uniswap/interfaces/IUniswapV2Router02.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../hardworkInterface/IVault.sol";
import "../../Controllable.sol";
import "../RewardTokenProfitNotifier.sol";


/**
* This strategy is for the husdCRV vault, i.e., the underlying token is husdCRV. It is not to accept
* stable coins. It will farm the CRV crop. For liquidation, it swaps CRV into DAI and uses DAI
* to produce husdCRV.
*/
contract CRVStrategyHUSD is IStrategy, RewardTokenProfitNotifier {

  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  event Liquidating(uint256 amount);
  event ProfitsNotCollected();

  // husdCRV
  address public underlying;
  address public pool;
  address public mintr;
  address public crv;

  address public weth;
  address public dai;
  address public curveDepositHUSD;

  address public uni = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

  // these tokens cannot be claimed by the governance
  mapping(address => bool) public unsalvagableTokens;

  // our vault holding the underlying token (husdCRV)
  address public vault;

  uint256 maxUint = uint256(~0);
  address[] public uniswap_CRV2DAI;

  // a flag for disabling selling for simplified emergency exit
  bool public sell = true;
  // minimum CRV amount to be liquidation
  uint256 public sellFloor = 1e18;

  modifier restricted() {
    require(msg.sender == vault || msg.sender == controller()
      || msg.sender == governance(),
      "The sender has to be the controller, governance, or vault");
    _;
  }

  constructor(
    address _storage,
    address _vault,
    address _underlying,
    address _gauge,
    address _mintr,
    address _crv,
    address _weth,
    address _dai,
    address _curveDepositHUSD,
    address _uniswap
  )
  RewardTokenProfitNotifier(_storage, _crv) public {
    require(IVault(_vault).underlying() == _underlying, "vault does not support husdCRV");
    vault = _vault;
    underlying = _underlying;
    pool = _gauge;
    mintr = _mintr;
    crv = _crv;
    weth = _weth;
    dai = _dai;
    curveDepositHUSD = _curveDepositHUSD;
    uni = _uniswap;
    uniswap_CRV2DAI = [crv, weth, dai];
    // set these tokens to be not salvageable
    unsalvagableTokens[underlying] = true;
    unsalvagableTokens[crv] = true;
  }

  function depositArbCheck() public view returns(bool) {
    return true;
  }

  /**
  * Salvages a token. We should not be able to salvage CRV and husdCRV (underlying).
  */
  function salvage(address recipient, address token, uint256 amount) public onlyGovernance {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvageable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  /**
  * Withdraws husdCRV from the investment pool that mints crops.
  */
  function withdrawHUSDCRVFromPool(uint256 amount) internal {
    Gauge(pool).withdraw(
      Math.min(Gauge(pool).balanceOf(address(this)), amount)
    );
  }

  /**
  * Withdraws the husdCRV tokens to the pool in the specified amount.
  */
  function withdrawToVault(uint256 amountUnderlying) external restricted {
    withdrawHUSDCRVFromPool(amountUnderlying);
    if (IERC20(underlying).balanceOf(address(this)) < amountUnderlying) {
      claimAndLiquidateCrv();
    }
    uint256 toTransfer = Math.min(IERC20(underlying).balanceOf(address(this)), amountUnderlying);
    IERC20(underlying).safeTransfer(vault, toTransfer);
  }

  /**
  * Withdraws all the husdCRV tokens to the pool.
  */
  function withdrawAllToVault() external restricted {
    claimAndLiquidateCrv();
    withdrawHUSDCRVFromPool(maxUint);
    uint256 balance = IERC20(underlying).balanceOf(address(this));
    IERC20(underlying).safeTransfer(vault, balance);
  }

  /**
  * Invests all the underlying husdCRV into the pool that mints crops (CRV_.
  */
  function investAllUnderlying() public restricted {
    uint256 underlyingBalance = IERC20(underlying).balanceOf(address(this));
    if (underlyingBalance > 0) {
      IERC20(underlying).safeApprove(pool, 0);
      IERC20(underlying).safeApprove(pool, underlyingBalance);
      Gauge(pool).deposit(underlyingBalance);
    }
  }

  /**
  * Claims the CRV crop, converts it to DAI on Uniswap, and then uses DAI to mint husdCRV using the
  * Curve protocol.
  */
  function claimAndLiquidateCrv() internal {
    if (!sell) {
      // Profits can be disabled for possible simplified and rapid exit
      emit ProfitsNotCollected();
      return;
    }
    Mintr(mintr).mint(pool);

    uint256 rewardBalance = IERC20(crv).balanceOf(address(this));
    if (rewardBalance < sellFloor) {
      // Profits can be disabled for possible simplified and rapid exit
      emit ProfitsNotCollected();
      return;
    }

    notifyProfitInRewardToken(rewardBalance);
    uint256 crvBalance = IERC20(crv).balanceOf(address(this));

    if (crvBalance > 0) {
      emit Liquidating(crvBalance);
      IERC20(crv).safeApprove(uni, 0);
      IERC20(crv).safeApprove(uni, crvBalance);
      // we can accept 1 as the minimum because this will be called only by a trusted worker
      IUniswapV2Router02(uni).swapExactTokensForTokens(
        crvBalance, 1, uniswap_CRV2DAI, address(this), block.timestamp
      );

      if(IERC20(dai).balanceOf(address(this)) > 0) {
        husdCRVFromDai();
      }
    }
  }

  /**
  * Claims and liquidates CRV into husdCRV, and then invests all underlying.
  */
  function doHardWork() public restricted {
    claimAndLiquidateCrv();
    investAllUnderlying();
  }

  /**
  * Investing all underlying.
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    return Gauge(pool).balanceOf(address(this)).add(
      IERC20(underlying).balanceOf(address(this))
    );
  }

  /**
  * Converts all DAI to husdCRV using the CRV protocol.
  */
  function husdCRVFromDai() internal {
    uint256 daiBalance = IERC20(dai).balanceOf(address(this));
    if (daiBalance > 0) {
      IERC20(dai).safeApprove(curveDepositHUSD, 0);
      IERC20(dai).safeApprove(curveDepositHUSD, daiBalance);

      // we can accept 0 as minimum, this will be called only by trusted roles
      uint256 minimum = 0;
      ICurveHUSDDeposit(curveDepositHUSD).add_liquidity([0, daiBalance, 0, 0], minimum);
      // now we have husdCRV
    }
  }

  /**
  * Can completely disable claiming CRV rewards and selling. Good for emergency withdraw in the
  * simplest possible way.
  */
  function setSell(bool s) public onlyGovernance {
    sell = s;
  }

  /**
  * Sets the minimum amount of CRV needed to trigger a sale.
  */
  function setSellFloor(uint256 floor) public onlyGovernance {
    sellFloor = floor;
  }
}
