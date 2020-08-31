pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "./interfaces/Gauge.sol";
import "./interfaces/ICurveFi.sol";
import "./interfaces/yVault.sol";
import "./interfaces/IPriceConvertor.sol";
import "../../hardworkInterface/IVault.sol";
import "../../hardworkInterface/IController.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../Controllable.sol";

/**
* The goal of this strategy is to take a stable asset (DAI, USDC, USDT), turn it into ycrv using
* the curve mechanisms, and supply ycrv into the ycrv vault. The ycrv vault will likely not have
* a reward token distribution pool to avoid double dipping. All the calls to functions from this
* strategy will be routed to the controller which should then call the respective methods on the
* ycrv vault. This strategy will not be liquidating any yield crops (CRV), because the strategy
* of the ycrv vault will do that for us.
*/
contract CRVStrategyStable is IStrategy, Controllable {

  enum TokenIndex {DAI, USDC, USDT}

  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  // underlying asset
  address public underlying;

  // the matching enum record used to determine the index
  TokenIndex tokenIndex;

  // our vault holding the underlying asset
  address public vault;

  // the y-vault (yield tokens from Curve) corresponding to our asset
  address public yVault;

  // our vault for depositing the yCRV tokens
  address public ycrvVault;

  // the address of yCRV token
  address public ycrv;

  // the address of the Curve protocol
  address public curve;

  // the address of the IPriceConvertor
  address public convertor;

  // these tokens cannot be claimed by the governance
  mapping(address => bool) public unsalvagableTokens;

  uint256 public curvePriceCheckpoint;
  uint256 public ycrvUnit;
  uint256 public arbTolerance = 3;

  modifier restricted() {
    require(msg.sender == vault || msg.sender == controller()
      || msg.sender == governance(),
      "The sender has to be the controller, governance, or vault");
    _;
  }

  constructor(
    address _storage,
    address _underlying,
    address _vault,
    address _ycrvVault,
    address _yVault,
    uint256 _tokenIndex,
    address _ycrv,
    address _curveProtocol,
    address _convertor
  )
  Controllable(_storage) public {
    vault = _vault;
    ycrvVault = _ycrvVault;
    underlying = _underlying;
    tokenIndex = TokenIndex(_tokenIndex);
    yVault = _yVault;
    ycrv = _ycrv;
    curve = _curveProtocol;
    convertor = _convertor;

    // set these tokens to be not salvageable
    unsalvagableTokens[underlying] = true;
    unsalvagableTokens[yVault] = true;
    unsalvagableTokens[ycrv] = true;
    unsalvagableTokens[ycrvVault] = true;

    ycrvUnit = 10 ** 18;
    // starting with a stable price, the mainnet will override this value
    curvePriceCheckpoint = ycrvUnit;
  }

  function depositArbCheck() public view returns(bool) {
    uint256 currentPrice = underlyingValueFromYCrv(ycrvUnit);
    if (currentPrice > curvePriceCheckpoint) {
      return currentPrice.mul(100).div(curvePriceCheckpoint) > 100 - arbTolerance;
    } else {
      return curvePriceCheckpoint.mul(100).div(currentPrice) > 100 - arbTolerance;
    }
  }

  function setArbTolerance(uint256 tolerance) external onlyGovernance {
    require(tolerance <= 100, "at most 100");
    arbTolerance = tolerance;
  }

  /**
  * Uses the Curve protocol to convert the underlying asset into yAsset and then to yCRV.
  */
  function yCurveFromUnderlying() internal {
    // convert underlying asset to yAsset
    uint256 underlyingBalance = IERC20(underlying).balanceOf(address(this));
    if (underlyingBalance > 0) {
      IERC20(underlying).safeApprove(yVault, 0);
      IERC20(underlying).safeApprove(yVault, underlyingBalance);
      yERC20(yVault).deposit(underlyingBalance);
    }
    // convert yAsset to yCRV
    uint256 yBalance = IERC20(yVault).balanceOf(address(this));
    if (yBalance > 0) {
      IERC20(yVault).safeApprove(curve, 0);
      IERC20(yVault).safeApprove(curve, yBalance);
      // we can accept 0 as minimum because this is called only by a trusted role
      uint256 minimum = 0;
      uint256[4] memory coinAmounts = wrapCoinAmount(yBalance);
      ICurveFi(curve).add_liquidity(
        coinAmounts, minimum
      );
    }
    // now we have yCRV
  }

  /**
  * Uses the Curve protocol to convert the yCRV back into the underlying asset. If it cannot acquire
  * the limit amount, it will acquire the maximum it can.
  */
  function yCurveToUnderlying(uint256 underlyingLimit) internal {
    uint256 ycrvBalance = IERC20(ycrv).balanceOf(address(this));

    // this is the maximum number of y-tokens we can get for our yCRV
    uint256 yTokenMaximumAmount = yTokenValueFromYCrv(ycrvBalance);
    if (yTokenMaximumAmount == 0) {
      return;
    }

    // ensure that we will not overflow in the conversion
    uint256 yTokenDesiredAmount = underlyingLimit == uint256(~0) ?
      yTokenMaximumAmount : yTokenValueFromUnderlying(underlyingLimit);

    uint256[4] memory yTokenAmounts = wrapCoinAmount(
      Math.min(yTokenMaximumAmount, yTokenDesiredAmount));
    uint256 yUnderlyingBalanceBefore = IERC20(yVault).balanceOf(address(this));
    IERC20(ycrv).safeApprove(curve, 0);
    IERC20(ycrv).safeApprove(curve, ycrvBalance);
    ICurveFi(curve).remove_liquidity_imbalance(
      yTokenAmounts, ycrvBalance
    );
    // now we have yUnderlying asset
    uint256 yUnderlyingBalanceAfter = IERC20(yVault).balanceOf(address(this));
    if (yUnderlyingBalanceAfter > yUnderlyingBalanceBefore) {
      // we received new yUnderlying tokens for yCRV
      yERC20(yVault).withdraw(yUnderlyingBalanceAfter.sub(yUnderlyingBalanceBefore));
    }
  }

  /**
  * Withdraws an underlying asset from the strategy to the vault in the specified amount by asking
  * the yCRV vault for yCRV (currently all of it), and then removing imbalanced liquidity from
  * the Curve protocol. The rest is deposited back to the yCRV vault. If the amount requested cannot
  * be obtained, the method will get as much as we have.
  */
  function withdrawToVault(uint256 amountUnderlying) external restricted {
    // If we want to be more accurate, we need to calculate how much yCRV we will need here
    uint256 shares = IERC20(ycrvVault).balanceOf(address(this));
    IVault(ycrvVault).withdraw(shares);
    yCurveToUnderlying(amountUnderlying);
    // we can transfer the asset to the vault
    uint256 actualBalance = IERC20(underlying).balanceOf(address(this));
    if (actualBalance > 0) {
      IERC20(underlying).safeTransfer(vault, Math.min(amountUnderlying, actualBalance));
    }

    // invest back the rest
    investAllUnderlying();
  }

  /**
  * Withdraws all assets from the vault. We ask the yCRV vault to give us our entire yCRV balance
  * and then convert it to the underlying asset using the Curve protocol.
  */
  function withdrawAllToVault() external restricted {
    uint256 shares = IERC20(ycrvVault).balanceOf(address(this));
    IVault(ycrvVault).withdraw(shares);
    // withdraw everything until there is only dust left
    yCurveToUnderlying(uint256(~0));
    uint256 actualBalance = IERC20(underlying).balanceOf(address(this));
    if (actualBalance > 0) {
      IERC20(underlying).safeTransfer(vault, actualBalance);
    }
  }

  /**
  * Invests all underlying assets into our yCRV vault.
  */
  function investAllUnderlying() internal {
    // convert the entire balance not yet invested into yCRV first
    yCurveFromUnderlying();

    // then deposit into the yCRV vault
    uint256 ycrvBalance = IERC20(ycrv).balanceOf(address(this));
    if (ycrvBalance > 0) {
      IERC20(ycrv).safeApprove(ycrvVault, 0);
      IERC20(ycrv).safeApprove(ycrvVault, ycrvBalance);
      // deposits the entire balance and also asks the vault to invest it (public function)
      IVault(ycrvVault).deposit(ycrvBalance);
    }
  }

  /**
  * The hard work only invests all underlying assets, and then tells the controller to call hard
  * work on the yCRV vault.
  */
  function doHardWork() public restricted {
    investAllUnderlying();
    curvePriceCheckpoint = underlyingValueFromYCrv(ycrvUnit);
  }

  /**
  * Salvages a token. We cannot salvage the shares in the yCRV pool, yCRV tokens, or underlying
  * assets.
  */
  function salvage(address recipient, address token, uint256 amount) public onlyGovernance {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvageable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  /**
  * Returns the underlying invested balance. This is the amount of yCRV that we are entitled to
  * from the yCRV vault (based on the number of shares we currently have), converted to the
  * underlying assets by the Curve protocol, plus the current balance of the underlying assets.
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    uint256 shares = IERC20(ycrvVault).balanceOf(address(this));
    uint256 price = IVault(ycrvVault).getPricePerFullShare();
    // the price is in yCRV units, because this is a yCRV vault
    // the multiplication doubles the number of decimals for shares, so we need to divide
    // the precision is always 10 ** 18 as the yCRV vault has 18 decimals
    uint256 precision = 10 ** 18;
    uint256 ycrvBalance = shares.mul(price).div(precision);
    // now we can convert the balance to the token amount
    uint256 ycrvValue = underlyingValueFromYCrv(ycrvBalance);
    return ycrvValue.add(IERC20(underlying).balanceOf(address(this)));
  }

  /**
  * Returns the value of yCRV in underlying token accounting for slippage and fees.
  */
  function yTokenValueFromYCrv(uint256 ycrvBalance) public view returns (uint256) {
    return underlyingValueFromYCrv(ycrvBalance) // this is in DAI, we will convert to yDAI
    .mul(10 ** 18)
    .div(yERC20(yVault).getPricePerFullShare()); // function getPricePerFullShare() has 18 decimals for all tokens
  }

  /**
  * Returns the value of yCRV in y-token (e.g., yCRV -> yDai) accounting for slippage and fees.
  */
  function underlyingValueFromYCrv(uint256 ycrvBalance) public view returns (uint256) {
    return IPriceConvertor(convertor).yCrvToUnderlying(ycrvBalance, uint256(tokenIndex));
  }

  /**
  * Returns the value of the underlying token in yToken
  */
  function yTokenValueFromUnderlying(uint256 amountUnderlying) public view returns (uint256) {
    // 1 yToken = this much underlying, 10 ** 18 precision for all tokens
    return amountUnderlying
      .mul(10 ** 18)
      .div(yERC20(yVault).getPricePerFullShare());
  }

  /**
  * Wraps the coin amount in the array for interacting with the Curve protocol
  */
  function wrapCoinAmount(uint256 amount) internal view returns (uint256[4] memory) {
    uint256[4] memory amounts = [uint256(0), uint256(0), uint256(0), uint256(0)];
    amounts[uint56(tokenIndex)] = amount;
    return amounts;
  }

  /**
  * Replaces the price convertor
  */
  function setConvertor(address _convertor) public onlyGovernance {
    // different price conversion from yCurve to yToken can help in emergency recovery situation
    // or if there is a bug discovered in the price computation
    convertor = _convertor;
  }
}
