pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./CompoundInteractor.sol";
import "./CompleteCToken.sol";
import "../LiquidityRecipient.sol";
import "../../Controllable.sol";
import "../RewardTokenProfitNotifier.sol";
import "../../compound/ComptrollerInterface.sol";
import "../../compound/CTokenInterfaces.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../uniswap/interfaces/IUniswapV2Router02.sol";
import "../../hardworkInterface/IVault.sol";

contract CompoundNoFoldStrategy is IStrategy, RewardTokenProfitNotifier, CompoundInteractor {

  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  event ProfitNotClaimed();
  event TooLowBalance();

  ERC20Detailed public underlying;
  CompleteCToken public ctoken;
  ComptrollerInterface public comptroller;

  address public vault;
  ERC20Detailed public comp; // this will be Cream or Comp

  address public uniswapRouterV2;
  uint256 public suppliedInUnderlying;
  bool public liquidationAllowed = true;
  uint256 public sellFloor = 0;
  bool public allowEmergencyLiquidityShortage = false;

  // These tokens cannot be claimed by the controller
  mapping(address => bool) public unsalvagableTokens;

  modifier restricted() {
    require(msg.sender == vault || msg.sender == address(controller()) || msg.sender == address(governance()),
      "The sender has to be the controller or vault");
    _;
  }

  constructor(
    address _storage,
    address _underlying,
    address _ctoken,
    address _vault,
    address _comptroller,
    address _comp,
    address _uniswap
  )
  RewardTokenProfitNotifier(_storage, _comp)
  CompoundInteractor(_underlying, _ctoken, _comptroller) public {
    require(IVault(_vault).underlying() == _underlying, "vault does not support underlying");
    comptroller = ComptrollerInterface(_comptroller);
    comp = ERC20Detailed(_comp);
    underlying = ERC20Detailed(_underlying);
    ctoken = CompleteCToken(_ctoken);
    vault = _vault;
    uniswapRouterV2 = _uniswap;

    // set these tokens to be not salvagable
    unsalvagableTokens[_underlying] = true;
    unsalvagableTokens[_ctoken] = true;
    unsalvagableTokens[_comp] = true;
  }

  modifier updateSupplyInTheEnd() {
    _;
    suppliedInUnderlying = ctoken.balanceOfUnderlying(address(this));
  }

  function depositArbCheck() public view returns (bool) {
    // there's no arb here.
    return true;
  }

  /**
  * The strategy invests by supplying the underlying as a collateral.
  */
  function investAllUnderlying() public restricted updateSupplyInTheEnd {
    uint256 balance = underlying.balanceOf(address(this));
    _supply(balance);
  }

  /**
  * Exits Compound and transfers everything to the vault.
  */
  function withdrawAllToVault() external restricted updateSupplyInTheEnd {
    if (allowEmergencyLiquidityShortage) {
      withdrawMaximum();
    } else {
      withdrawAllWeInvested();
    }
    IERC20(address(underlying)).safeTransfer(vault, underlying.balanceOf(address(this)));
  }

  function emergencyExit() external onlyGovernance updateSupplyInTheEnd {
    withdrawMaximum();
  }

  function withdrawMaximum() internal updateSupplyInTheEnd {
    if (liquidationAllowed) {
      claimComp();
      liquidateComp();
    } else {
      emit ProfitNotClaimed();
    }
    redeemMaximum();
  }

  function withdrawAllWeInvested() internal updateSupplyInTheEnd {
    if (liquidationAllowed) {
      claimComp();
      liquidateComp();
    } else {
      emit ProfitNotClaimed();
    }
    uint256 currentBalance = ctoken.balanceOfUnderlying(address(this));
    mustRedeemPartial(currentBalance);
  }

  function withdrawToVault(uint256 amountUnderlying) external restricted updateSupplyInTheEnd {
    if (amountUnderlying <= underlying.balanceOf(address(this))) {
      IERC20(address(underlying)).safeTransfer(vault, amountUnderlying);
      return;
    }

    // get some of the underlying
    mustRedeemPartial(amountUnderlying);

    // transfer the amount requested (or the amount we have) back to vault
    IERC20(address(underlying)).safeTransfer(vault, amountUnderlying);

    // invest back to cream
    investAllUnderlying();
  }

  /**
  * Withdraws all assets, liquidates COMP/CREAM, and invests again in the required ratio.
  */
  function doHardWork() public restricted {
    if (liquidationAllowed) {
      claimComp();
      liquidateComp();
    } else {
      emit ProfitNotClaimed();
    }
    investAllUnderlying();
  }

  /**
  * Redeems maximum that can be redeemed from Compound.
  * Redeem the minimum of the underlying we own, and the underlying that the cToken can
  * immediately retrieve. Ensures that `redeemMaximum` doesn't fail silently.
  *
  * DOES NOT ensure that the strategy cUnderlying balance becomes 0.
  */
  function redeemMaximum() internal {
    redeemMaximumToken();
  }

  /**
  * Redeems `amountUnderlying` or fails.
  */
  function mustRedeemPartial(uint256 amountUnderlying) internal {
    require(
      ctoken.getCash() >= amountUnderlying,
      "market cash cannot cover liquidity"
    );
    _redeemUnderlying(amountUnderlying);
  }

  /**
  * Salvages a token.
  */
  function salvage(address recipient, address token, uint256 amount) public onlyGovernance {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvagable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  function liquidateComp() internal {
    uint256 balance = comp.balanceOf(address(this));
    if (balance < sellFloor) {
      emit TooLowBalance();
      return;
    }

    // give a profit share to fee forwarder, which re-distributes this to
    // the profit sharing pools
    notifyProfitInRewardToken(balance);

    balance = comp.balanceOf(address(this));
    // we can accept 1 as minimum as this will be called by trusted roles only
    uint256 amountOutMin = 1;
    IERC20(address(comp)).safeApprove(address(uniswapRouterV2), 0);
    IERC20(address(comp)).safeApprove(address(uniswapRouterV2), balance);
    address[] memory path = new address[](3);
    path[0] = address(comp);
    path[1] = IUniswapV2Router02(uniswapRouterV2).WETH();
    path[2] = address(underlying);
    IUniswapV2Router02(uniswapRouterV2).swapExactTokensForTokens(
      balance,
      amountOutMin,
      path,
      address(this),
      block.timestamp
    );
  }

  /**
  * Returns the current balance. Ignores COMP/CREAM that was not liquidated and invested.
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    // underlying in this strategy + underlying redeemable from Compound/Cream
    return underlying.balanceOf(address(this)).add(suppliedInUnderlying);
  }

  /**
  * Allows liquidation
  */
  function setLiquidationAllowed(
    bool allowed
  ) external restricted {
    liquidationAllowed = allowed;
  }

  function setAllowLiquidityShortage(
    bool allowed
  ) external restricted {
    allowEmergencyLiquidityShortage = allowed;
  }

  function setSellFloor(uint256 value) external restricted {
    sellFloor = value;
  }
}
