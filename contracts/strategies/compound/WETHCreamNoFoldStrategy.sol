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

// (1) Cream is a fork of Compound, we will be using the CompoundInteractor as well.
// (2) WETH has its own special strategy because its liquidation path would not
//     use WETH as intermediate asset for obvious reason.

contract WETHCreamNoFoldStrategy is IStrategy, RewardTokenProfitNotifier, CompoundInteractor {

  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  event ProfitNotClaimed();
  event TooLowBalance();

  ERC20Detailed public underlying;
  CompleteCToken public ctoken;
  ComptrollerInterface public comptroller;

  address public vault;
  ERC20Detailed public comp; // this will be Cream

  address public uniswapRouterV2;
  uint256 public suppliedInWETH;

  // The strategy supplying liquidity to Uniswap
  address public liquidityRecipient;
  // The current loan
  uint256 public liquidityLoanCurrent;
  // The target loan
  uint256 public liquidityLoanTarget;

  bool public liquidationAllowed = true;
  uint256 public sellFloor = 0;
  bool public allowEmergencyLiquidityShortage = false;


  uint256 public constant tenWeth = 10 * 1e18;

  // These tokens cannot be claimed by the controller
  mapping (address => bool) public unsalvagableTokens;

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
    require(_underlying == address(_weth), "Weth strategy needs to have WETH as underlying");
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
    suppliedInWETH = ctoken.balanceOfUnderlying(address(this));
  }

  function depositArbCheck() public view returns(bool) {
    // there's no arb here.
    return true;
  }

  /**
  * The strategy invests by supplying the underlying as a collateral and taking
  * a loan in the required ratio. The borrowed money is then re-supplied.
  */
  function investAllUnderlying() public restricted updateSupplyInTheEnd {
    uint256 balance = underlying.balanceOf(address(this));
    _supplyEtherInWETH(balance);
  }

  /**
  * Exits Compound and transfers everything to the vault.
  */
  function withdrawAllToVault() external restricted updateSupplyInTheEnd {
    // This function allows for withdrawing tokens without the loan being settled for the sake
    // of being able to switch strategies whenever needed. Only last shareholder can suffer from
    // this as withdrawToVault is used in other cases.
    _withdrawAll();
    IERC20(address(underlying)).safeTransfer(vault, underlying.balanceOf(address(this)));
  }

  function emergencyExit() external onlyGovernance updateSupplyInTheEnd {
    withdrawMaximum();
  }

  function withdrawAll() public onlyGovernance {
    _withdrawAll();
  }

  function _withdrawAll() internal {
    claimComp();
    liquidateComp();
    redeemMaximum();
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

    // If there is some liquidity loan and we do not have enough funds to send back, 
    // fail the transaction. If this happens, the user should first withdraw the rest of the funds 
    // that are available, then they can settle the loan in a separate transaction, and continue
    // withdrawing the rest. The withdrawal for the rest of the funds does not need to bring
    // balance to exactly 0 (that may be hard due to rounding errors); anything less than 10 WETH
    // will suffice.
    if (underlying.balanceOf(address(this)) < amountUnderlying && liquidityLoanCurrent > 0) {
      require(liquidityLoanCurrent == 0, "The loan has to be settled first");
    }

    // transfer the amount requested (or the amount we have) back to vault
    IERC20(address(underlying)).safeTransfer(vault, amountUnderlying);

    // invest back to cream
    investAllUnderlying();
  }

  /**
  * Withdraws all assets, liquidates COMP, and invests again in the required ratio.
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
  * Redeem the minimum of the WETH we own, and the WETH that the cToken can
  * immediately retrieve. Ensures that `redeemMaximum` doesn't fail silently.
  *
  * DOES NOT ensure that the strategy crWETH balance becomes 0.
  */
  function redeemMaximum() internal {
    redeemMaximumWeth();
  }

  /**
  * Redeems `amountUnderlying` or fails.
  */
  function mustRedeemPartial(uint256 amountUnderlying) internal {
    require(
      ctoken.getCash() >= amountUnderlying,
      "market cash cannot cover liquidity"
    );
    redeemUnderlyingInWeth(amountUnderlying);
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

    if (balance > 0) {
      notifyProfitInRewardToken(balance);

      balance = comp.balanceOf(address(this));
      // we can accept 1 as minimum as this will be called by trusted roles only
      uint256 amountOutMin = 1;
      IERC20(address(comp)).safeApprove(address(uniswapRouterV2), 0);
      IERC20(address(comp)).safeApprove(address(uniswapRouterV2), balance);
      address[] memory path = new address[](2);
      path[0] = address(comp);
      path[1] = IUniswapV2Router02(uniswapRouterV2).WETH();
      IUniswapV2Router02(uniswapRouterV2).swapExactTokensForTokens(
        balance,
        amountOutMin,
        path,
        address(this),
        block.timestamp
      );
    }
  }

  /**
  * Returns the current balance. Ignores COMP that was not liquidated and invested.
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    // underlying in this strategy + underlying redeemable from Compound/Cream
    uint256 assets = underlying.balanceOf(address(this)).add(suppliedInWETH);
    // adding the liquidity that is loaned
    return assets.add(liquidityLoanCurrent);
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
  function provideLoan() public onlyGovernance {

    if (liquidityLoanCurrent < liquidityLoanTarget
      && IERC20(underlying).balanceOf(address(this)) > 0
      && liquidityRecipient != address(0)) {
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

  }

  /**
  * Settles a loan amount by forcing withdrawal inside the liquidity strategy, and then transferring
  * the funds back to this strategy. This way, the loan can be settled partially, or completely.
  * The method can be invoked only by EOAs to avoid market manipulation, and only by the governance
  * unless there is not more than 10 WETH left in this strategy.
  */
  function settleLoan(uint256 amount) public {
    require(
      // the only funds in are in the loan, other than 10 WETH
      investedUnderlyingBalance() <= liquidityLoanCurrent.add(tenWeth)
      // or the governance wants this to happen
      || msg.sender == governance(), 
      "Buffer exists and the caller is not governance"
    );
    // market manipulation prevention
    require(tx.origin == msg.sender, "no smart contracts");

    if(liquidityLoanCurrent == 0)
      return ;

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

  function setLiquidityLoanTarget(uint256 target) public onlyGovernance {
    liquidityLoanTarget = target;
  }
}
