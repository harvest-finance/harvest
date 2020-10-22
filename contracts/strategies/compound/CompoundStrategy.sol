pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./CompoundInteractor.sol";
import "./CompleteCToken.sol";
import "../../Controllable.sol";
import "../ProfitNotifier.sol";
import "../../compound/ComptrollerInterface.sol";
import "../../compound/CTokenInterfaces.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../uniswap/interfaces/IUniswapV2Router02.sol";

contract CompoundStrategy is IStrategy, ProfitNotifier, CompoundInteractor {

  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  ERC20Detailed public underlying;
  CompleteCToken public ctoken;
  ComptrollerInterface public comptroller;

  uint256 constant mantissaScale = 10 ** 18;
  uint256 constant mantissaHalfScale = 10 ** 9;
  address public vault;
  ERC20Detailed public comp;

  address public uniswapRouterV2;
  uint256 public ratioNumerator;
  uint256 public ratioDenominator;
  uint256 public toleranceNumerator;
  uint256 public profitComp;
  uint256 public supplied;
  uint256 public borrowed;

  // These tokens cannot be claimed by the controller
  mapping (address => bool) public unsalvagableTokens;

  modifier restricted() {
    require(msg.sender == vault || msg.sender == address(controller()),
      "The sender has to be the controller or vault");
    _;
  }

  modifier protectCollateral() {
    _;
    supplied = ctoken.balanceOfUnderlying(address(this));
    borrowed = ctoken.borrowBalanceCurrent(address(this));
    (, uint256 collateralFactorMantissa) = comptroller.markets(address(ctoken));
    uint256 canBorrow = supplied
      .mul(collateralFactorMantissa.div(mantissaHalfScale))
      .div(mantissaHalfScale);

    require(borrowed < canBorrow || borrowed == 0, "We would get liquidated!");
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
  ProfitNotifier(_storage, _underlying)
  CompoundInteractor(_underlying, _ctoken, _comptroller) public {
    comptroller = ComptrollerInterface(_comptroller);
    // COMP: 0xc00e94Cb662C3520282E6f5717214004A7f26888
    comp = ERC20Detailed(_comp);
    underlying = ERC20Detailed(_underlying);
    ctoken = CompleteCToken(_ctoken);
    vault = _vault;
    ratioNumerator = 0;
    ratioDenominator = 100;
    toleranceNumerator = 0;
    uniswapRouterV2 = _uniswap;

    // set these tokens to be not salvagable
    unsalvagableTokens[_underlying] = true;
    unsalvagableTokens[_ctoken] = true;
    unsalvagableTokens[_comp] = true;
  }

  function depositArbCheck() public view returns(bool) {
    return true;
  }

  /**
  * The strategy invests by supplying the underlying as a collateral and taking
  * a loan in the required ratio. The borrowed money is then re-supplied.
  */
  function investAllUnderlying() public protectCollateral {

    (uint256 amountIn, uint256 amountOut) = investExact();

    uint256 balance = underlying.balanceOf(address(this));

    // get more cash from vault
    uint256 vaultLoan = 0;
    if (balance < amountIn) {
      vaultLoan = underlying.balanceOf(vault);
      if (vaultLoan > 0) {
        IERC20(address(underlying)).safeTransferFrom(vault, address(this), vaultLoan);
      }
    }

    // we are out of options, now we need to roll
    uint256 suppliedRoll = 0;
    uint256 borrowedRoll = 0;
    while(suppliedRoll < amountIn) {
      uint256 nowSupplied = _supply(amountIn.sub(suppliedRoll));
      suppliedRoll = suppliedRoll.add(nowSupplied);

      uint256 nowBorrowed = borrow(amountOut.sub(borrowedRoll));
      borrowedRoll = borrowedRoll.add(nowBorrowed);
    }

    // state of supply/loan will be updated by the modifier

    // return loans
    if (vaultLoan > 0) {
      IERC20(address(underlying)).safeTransfer(vault, vaultLoan);
    }
  }

  /**
  * Exits Compound and transfers everything to the vault.
  */
  function withdrawAllToVault() external restricted protectCollateral {
    withdrawAll();
    IERC20(address(underlying)).safeTransfer(vault, underlying.balanceOf(address(this)));
  }

  function withdrawAll() internal {
    claimComp();
    liquidateComp();
    // now we have all balance we possibly could; the rest must be covered by a flash loan

    // borrow more cash from vault to speed up repaying the loan
    uint256 vaultLoan = underlying.balanceOf(vault);
    IERC20(address(underlying)).safeTransferFrom(vault, address(this), vaultLoan);

    // we always supplied more than necessary due to the set investment ratio
    // we can redeem everything
    supplied = ctoken.balanceOfUnderlying(address(this));
    borrowed = ctoken.borrowBalanceCurrent(address(this));
    uint256 dust = (10 ** uint256(underlying.decimals())).div(10);
    while(supplied > dust) {
      repayMaximum();
      redeemMaximum();
      supplied = ctoken.balanceOfUnderlying(address(this));
      borrowed = ctoken.borrowBalanceCurrent(address(this));
    }

    // return loans
    IERC20(address(underlying)).safeTransfer(vault, vaultLoan);
  }

  function withdrawToVault(uint256 amountUnderlying) external restricted protectCollateral {
    if (amountUnderlying <= underlying.balanceOf(address(this))) {
      IERC20(address(underlying)).safeTransfer(vault, amountUnderlying);
      return;
    }

    // we are expected to have nothing sitting around, so we should borrow
    // get more cash from vault
    uint256 vaultLoan = underlying.balanceOf(vault);
    IERC20(address(underlying)).safeTransferFrom(vault, address(this), vaultLoan);

    // we assume that right now, we are invested in a proper collateralization ratio
    // if the current balance (after the vault loan) is enough to repay and redeem the required
    // amount, we just do it

    repayMaximum();
    redeemMaximum();

    // by repaying and redeeming maximum, we have strictly more than we had before, and we can
    // repay the vault loan
    IERC20(address(underlying)).safeTransfer(vault, vaultLoan);

    // if we now have enough, we can transfer the funds, otherwise the user is taking out large
    // volume of money that could destroy our collateralization ratio
    // if that is the case, we just withdraw all
    if (underlying.balanceOf(address(this)) < amountUnderlying) {
      withdrawAll();
      IERC20(address(underlying)).safeTransfer(
        vault, Math.min(underlying.balanceOf(address(this)), amountUnderlying)
      );
      investAllUnderlying();
    } else {
      IERC20(address(underlying)).safeTransfer(vault, amountUnderlying);
    }

    // if we broke the invested ratio too much, we will have to do hard work
    if (outsideTolerance()) {
      doHardWork();
    }

    // state of supply/loan will be updated by the modifier
  }

  function outsideTolerance() public returns(bool) {
    borrowed = ctoken.borrowBalanceCurrent(address(this));
    supplied = ctoken.balanceOfUnderlying(address(this));

    uint256 allowedLoan = supplied.mul(ratioNumerator).div(ratioDenominator);
    uint256 tolerance = supplied.mul(toleranceNumerator).div(ratioDenominator);
    return borrowed > allowedLoan.add(tolerance) || borrowed.add(tolerance) < allowedLoan;
  }


  /**
  * Withdraws all assets, liquidates COMP, and invests again in the required ratio.
  */
  function doHardWork() public protectCollateral restricted {
    if (outsideTolerance()) {
      // there is a difference between how we are invested and how we want to be invested
      // we should withdraw all and rebalance
      withdrawAll();
    }

    claimComp();
    liquidateComp();
    investAllUnderlying();

    // state of supply/loan will be updated by the modifier
  }

  /**
  * Redeems maximum that can be redeemed from Compound.
  */
  function redeemMaximum() internal returns (uint256) {
    // redeem as much as we can
    (, uint256 collateralFactorMantissa) = comptroller.markets(address(ctoken));

    uint256 loan = ctoken.borrowBalanceCurrent(address(this));
    uint256 supply = ctoken.balanceOfUnderlying(address(this));
    uint256 needToKeep = loan
      .mul(mantissaHalfScale)
      .div(collateralFactorMantissa.div(mantissaHalfScale));
    uint256 canRedeem = supply > needToKeep ? supply.sub(needToKeep) : 0;
    uint256 dust = (10 ** uint256(underlying.decimals())).div(10);
    if (canRedeem > dust) {
      _redeemUnderlying(canRedeem);
      return canRedeem;
    } else {
      return 0;
    }
  }

  /**
  * Borrows the amount if possible, otherwise borrows as much as we can. Returns the real amount
  * borrowed.
  */
  function borrow(uint256 amountUnderlying) internal returns(uint256) {
    // borrow as much as we can
    (, uint256 collateralFactorMantissa) = comptroller.markets(address(ctoken));
    collateralFactorMantissa = collateralFactorMantissa.div(10 ** 12);

    uint256 loan = ctoken.borrowBalanceCurrent(address(this));
    uint256 supply = ctoken.balanceOfUnderlying(address(this));
    uint256 max = supply.mul(collateralFactorMantissa).div(10 ** 6);
    uint256 canBorrow = loan >= max ? 0 : max.sub(loan);

    if (canBorrow == 0) {
      return 0;
    }

    if (amountUnderlying <= canBorrow) {
      _borrow(amountUnderlying);
      return amountUnderlying;
    } else {
      _borrow(canBorrow);
      return canBorrow;
    }
  }


  /**
  * Repay as much as we can, but at most what is needed.
  */
  function repayMaximum() internal returns (uint256) {
    uint256 balance = underlying.balanceOf(address(this));
    if (balance == 0) {
      // there is nothing to work with
      return 0;
    }
    uint256 loan = ctoken.borrowBalanceCurrent(address(this));
    uint256 repayAmount = Math.min(balance, loan);
    if (repayAmount > 0) {
      _repay(repayAmount);
    }
    return repayAmount;
  }

  /**
  * Salvages a token.
  */
  function salvage(address recipient, address token, uint256 amount) public onlyGovernance {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvagable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  function setRatio(uint256 numerator,
    uint256 denominator,
    uint256 tolerance) public onlyControllerOrGovernance {
    require(numerator < denominator, "numerator must be smaller than denominator");
    require(tolerance < numerator, "tolerance must be smaller than numerator");
    ratioNumerator = numerator;
    ratioDenominator = denominator;
    toleranceNumerator = tolerance;
  }

  function liquidateComp() internal {
    uint256 oldBalance = underlying.balanceOf(address(this));
    uint256 balance = comp.balanceOf(address(this));
    if (balance > 0) {
      // we can accept 1 as minimum as this will be called by trusted roles only
      uint256 amountOutMin = 1;
      comp.approve(address(uniswapRouterV2), balance);
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
    // give a profit share to fee forwarder, which re-distributes this to
    // the profit sharing pools
    notifyProfit(
      oldBalance, underlying.balanceOf(address(this))
      // no fail on 0x0 address or 0 amount, hard work was done!
    );
  }

  /**
  * Based on the current balance and the collateralization ratio that is desired, the function
  * returns a tuple indicating how much funds should be invested in, and how much funds should
  * be borrowed back. The difference between the current balance and how much should be invested
  * needs to be obtained either by executing the roll several times, or by getting a flash loan.
  */
  function investExact() public view returns (uint256, uint256) {
    require(ratioNumerator < ratioDenominator, "we could borrow infinitely");
    if (ratioNumerator == 0) {
      return (0,0);
    }

    uint256 balance = underlying.balanceOf(address(this));
    uint256 totalIn = balance.mul(ratioDenominator).div(ratioDenominator.sub(ratioNumerator));
    uint256 totalOut = totalIn.sub(balance);
    return (totalIn, totalOut);
  }

  /**
  * Returns the current balance. Ignores COMP that was not liquidated and invested.
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    uint256 assets = underlying.balanceOf(address(this)).add(supplied);
    return borrowed > assets ? 0 : assets.sub(borrowed);
  }
}
