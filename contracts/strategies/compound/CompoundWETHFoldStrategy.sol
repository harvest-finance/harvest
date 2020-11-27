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

contract CompoundWETHFoldStrategy is IStrategy, RewardTokenProfitNotifier, CompoundInteractor {

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
  uint256 public borrowedInUnderlying;
  bool public liquidationAllowed = true;
  uint256 public sellFloor = 0;
  bool public allowEmergencyLiquidityShortage = false;
  uint256 public collateralFactorNumerator = 100;
  uint256 public collateralFactorDenominator = 1000;
  uint256 public folds = 0;

  // The strategy supplying liquidity to Uniswap
  address public liquidityRecipient;
  // The current loan
  uint256 public liquidityLoanCurrent;
  // The target loan
  uint256 public liquidityLoanTarget;

  uint256 public constant tenWeth = 10 * 1e18;

  uint256 public borrowMinThreshold = 0;

  // These tokens cannot be claimed by the controller
  mapping(address => bool) public unsalvagableTokens;

  modifier restricted() {
    require(msg.sender == vault || msg.sender == address(controller()) || msg.sender == address(governance()),
      "The sender has to be the controller or vault");
    _;
  }

  event Liquidated(
    uint256 amount
  );

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
    borrowedInUnderlying = ctoken.borrowBalanceCurrent(address(this));
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
    _supplyEtherInWETH(balance);
    for (uint256 i = 0; i < folds; i++) {
      uint256 borrowAmount = balance.mul(collateralFactorNumerator).div(collateralFactorDenominator);
      _borrowInWETH(borrowAmount);
      balance = underlying.balanceOf(address(this));
      _supplyEtherInWETH(balance);
    }
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
    if (underlying.balanceOf(address(this)) > 0) {
      IERC20(address(underlying)).safeTransfer(vault, underlying.balanceOf(address(this)));
    }
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
    require(liquidityLoanCurrent == 0, "Liquidity loan must be settled first");
    if (liquidationAllowed) {
      claimComp();
      liquidateComp();
    } else {
      emit ProfitNotClaimed();
    }
    uint256 _currentSuppliedBalance = ctoken.balanceOfUnderlying(address(this));
    uint256 _currentBorrowedBalance = ctoken.borrowBalanceCurrent(address(this));

    mustRedeemPartial(_currentSuppliedBalance.sub(_currentBorrowedBalance));
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

    // invest back to compound
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
    redeemMaximumWethWithLoan(
      collateralFactorNumerator,
      collateralFactorDenominator,
      borrowMinThreshold
    );
  }

  /**
  * Redeems `amountUnderlying` or fails.
  */
  function mustRedeemPartial(uint256 amountUnderlying) internal {
    require(
      ctoken.getCash() >= amountUnderlying,
      "market cash cannot cover liquidity"
    );
    redeemMaximum();
    require(underlying.balanceOf(address(this)) >= amountUnderlying, "Unable to withdraw the entire amountUnderlying");
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
    if (balance < sellFloor || balance == 0) {
      emit TooLowBalance();
      return;
    }

    // give a profit share to fee forwarder, which re-distributes this to
    // the profit sharing pools
    notifyProfitInRewardToken(balance);

    balance = comp.balanceOf(address(this));

    emit Liquidated(balance);
    // we can accept 1 as minimum as this will be called by trusted roles only
    uint256 amountOutMin = 1;
    IERC20(address(comp)).safeApprove(address(uniswapRouterV2), 0);
    IERC20(address(comp)).safeApprove(address(uniswapRouterV2), balance);
    address[] memory path = new address[](2);
    path[0] = address(comp);
    path[1] = address(underlying);

    uint256 wethBefore = underlying.balanceOf(address(this));
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
    // underlying in this strategy + underlying redeemable from Compound/Cream + loan
    return underlying.balanceOf(address(this))
      .add(suppliedInUnderlying)
      .sub(borrowedInUnderlying)
      .add(liquidityLoanCurrent);
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

  /**
  * Provides a loan to the liquidity strategy. Sends in funds to fill out the loan target amount,
  * if they are available.
  */
  function provideLoan() public onlyGovernance updateSupplyInTheEnd {
    withdrawMaximum();
    if (liquidityLoanCurrent < liquidityLoanTarget
      && IERC20(underlying).balanceOf(address(this)) > 0
      && liquidityRecipient != address(0)
    ) {
      uint256 diff = Math.min(
        liquidityLoanTarget.sub(liquidityLoanCurrent),
        IERC20(underlying).balanceOf(address(this))
      );
      IERC20(underlying).safeApprove(liquidityRecipient, 0);
      IERC20(underlying).safeApprove(liquidityRecipient, diff);
      // use the pull pattern so that this fails if the contract is not set properly
      LiquidityRecipient(liquidityRecipient).takeLoan(diff);
      liquidityLoanCurrent = liquidityLoanCurrent.add(diff);
    }
    investAllUnderlying();
  }


  /**
  * Settles a loan amount by forcing withdrawal inside the liquidity strategy, and then transferring
  * the funds back to this strategy. This way, the loan can be settled partially, or completely.
  * The method can be invoked only by EOAs to avoid market manipulation, and only by the governance
  * unless there is not more than 10 WETH left in this strategy.
  */
  function settleLoan(uint256 amount) public updateSupplyInTheEnd {
    require(
      // the only funds in are in the loan, other than 10 WETH
      investedUnderlyingBalance() <= liquidityLoanCurrent.add(tenWeth)
      // or the governance wants this to happen
      || msg.sender == governance(),
      "Buffer exists and the caller is not governance"
    );
    // market manipulation prevention
    require(tx.origin == msg.sender, "no smart contracts");

    if (liquidityLoanCurrent == 0) {
      return;
    }

    LiquidityRecipient(liquidityRecipient).settleLoan();
    IERC20(underlying).safeTransferFrom(liquidityRecipient, address(this), amount);
    liquidityLoanCurrent = liquidityLoanCurrent.sub(amount);
    if (liquidityLoanCurrent == 0) {
      LiquidityRecipient(liquidityRecipient).wethOverdraft();
    }
  }

  function setLiquidityRecipient(address recipient) public onlyGovernance {
    require(liquidityRecipient == address(0) || liquidityLoanCurrent == 0,
      "Liquidity recipient was already set, and has a loan");
    liquidityRecipient = recipient;
  }

  function setBorrowMinThreshold(uint256 threshold) public onlyGovernance {
    borrowMinThreshold = threshold;
  }

  // updating collateral factor
  // note 1: one should settle the loan first before calling this
  // note 2: collateralFactorDenominator is 1000, therefore, for 20%, you need 200
  function setCollateralFactorNumerator(uint256 numerator) public onlyGovernance {
    require(numerator <= 740, "Collateral factor cannot be this high");
    collateralFactorNumerator = numerator;
  }

  function setLiquidityLoanTarget(uint256 target) public onlyGovernance {
    liquidityLoanTarget = target;
  }

  function setFolds(uint256 _folds) public onlyGovernance {
    folds = _folds;
  }
}
