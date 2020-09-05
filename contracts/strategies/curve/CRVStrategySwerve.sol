pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "./interfaces/Gauge.sol";
import "./interfaces/ISwerveFi.sol";
import "./interfaces/yVault.sol";
import "./interfaces/IPriceConvertor.sol";
import "../ProfitNotifier.sol";
import "../../hardworkInterface/IVault.sol";
import "../../hardworkInterface/IController.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../Controllable.sol";
import "../../uniswap/interfaces/IUniswapV2Router02.sol";

// This is an exact clone of the WBTC strategy
// Naming was not adjusted for easy diff
contract CRVStrategySwerve is IStrategy, ProfitNotifier {

  enum TokenIndex {DAI, USDC, USDT, TUSD}

  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  // wbtc token address (or ren if we want both)
  address public wbtc;

  // the matching enum record used to determine the index
  TokenIndex tokenIndex;

  // our vault holding the wbtc asset
  address public vault;

  // our vault for depositing the mixToken tokens
  address public mixVault;

  // the address of mixToken token
  address public mixToken;

  // the address of the Curve protocol's pool for REN + WBTC
  address public curve;

  // these tokens cannot be claimed by the governance
  mapping(address => bool) public unsalvagableTokens;

  // the wbtc gauge in Curve
  address public gauge;

  // the reward minter
  address public mintr;

  // the address for the CRV token
  address public crv;

  // uniswap router address
  address public uni;

  // price checkpoint preventing attacks
  uint256 public wbtcPriceCheckpoint;

  // a unit for the price checkpoint
  uint256 public mixTokenUnit;

  // settable arbitrage tolerance
  uint256 public arbTolerance = 3;

  // liquidation path to be used
  address[] public uniswap_CRV2WBTC;

  // a flag for disabling selling for simplified emergency exit
  bool public sell = true;

  // minimum CRV amount to be liquidation
  uint256 public sellFloor = 30e18;

  event Liquidating(uint256 amount);
  event ProfitsNotCollected();


  modifier restricted() {
    require(msg.sender == vault || msg.sender == controller()
      || msg.sender == governance(),
      "The sender has to be the controller, governance, or vault");
    _;
  }

  constructor(
    address _storage,
    address _wbtc,
    address _vault,
    uint256 _tokenIndex,
    address _mixToken,
    address _curvePool,
    address _crv,
    address _weth,
    address _gauge,
    address _mintr,
    address _uniswap
  )
  ProfitNotifier(_storage, _wbtc) public {
    vault = _vault;
    wbtc = _wbtc;
    tokenIndex = TokenIndex(_tokenIndex);
    mixToken = _mixToken;
    curve = _curvePool;
    gauge = _gauge;
    crv = _crv;
    uni = _uniswap;
    mintr = _mintr;

    uniswap_CRV2WBTC = [_crv, _weth, _wbtc];

    // set these tokens to be not salvageable
    unsalvagableTokens[wbtc] = true;
    unsalvagableTokens[mixToken] = true;
    unsalvagableTokens[crv] = true;

    mixTokenUnit = 10 ** 18;
    
    // starting with a stable price, the mainnet will override this value
    wbtcPriceCheckpoint = mixTokenUnit;
  }

  function depositArbCheck() public view returns(bool) {
    uint256 currentPrice = wbtcValueFromMixToken(mixTokenUnit);
    if (currentPrice > wbtcPriceCheckpoint) {
      return currentPrice.mul(100).div(wbtcPriceCheckpoint) > 100 - arbTolerance;
    } else {
      return wbtcPriceCheckpoint.mul(100).div(currentPrice) > 100 - arbTolerance;
    }
  }

  function setArbTolerance(uint256 tolerance) external onlyGovernance {
    require(tolerance <= 100, "at most 100");
    arbTolerance = tolerance;
  }

  /**
  * Uses the Curve protocol to convert the wbtc asset into to mixed renwbtc token.
  */
  function mixFromWBTC() internal {
    uint256 wbtcBalance = IERC20(wbtc).balanceOf(address(this));
    if (wbtcBalance > 0) {
      IERC20(wbtc).safeApprove(curve, 0);
      IERC20(wbtc).safeApprove(curve, wbtcBalance);
      // we can accept 0 as minimum because this is called only by a trusted role
      uint256 minimum = 0;
      uint256[4] memory coinAmounts = wrapCoinAmount(wbtcBalance);
      ISwerveFi(curve).add_liquidity(
        coinAmounts, minimum
      );
    }
    // now we have the mixed token
  }

  /**
  * Uses the Curve protocol to convert the mixed token back into the wbtc asset. If it cannot
  * acquire the limit amount, it will acquire the maximum it can.
  */
  function mixToWBTC(uint256 wbtcLimit) internal {
    uint256 mixTokenBalance = IERC20(mixToken).balanceOf(address(this));

    // this is the maximum number of wbtc we can get for our mixed token
    uint256 wbtcMaximumAmount = wbtcValueFromMixToken(mixTokenBalance);
    if (wbtcMaximumAmount == 0) {
      return;
    }

    if (wbtcLimit < wbtcMaximumAmount) {
      // we want less than what we can get, we ask for the exact amount
      // now we can remove the liquidity
      uint256[4] memory tokenAmounts = wrapCoinAmount(wbtcLimit);
      IERC20(mixToken).safeApprove(curve, 0);
      IERC20(mixToken).safeApprove(curve, mixTokenBalance);
      ISwerveFi(curve).remove_liquidity_imbalance(
        tokenAmounts, mixTokenBalance
      );
    } else {
      // we want more than we can get, so we withdraw everything
      IERC20(mixToken).safeApprove(curve, 0);
      IERC20(mixToken).safeApprove(curve, mixTokenBalance);
      ISwerveFi(curve).remove_liquidity_one_coin(mixTokenBalance, int128(tokenIndex), 0);
    }
    // now we have wbtc asset
  }

  /**
  * Withdraws an wbtc asset from the strategy to the vault in the specified amount by asking
  * by removing imbalanced liquidity from the Curve protocol. The rest is deposited back to the
  * Curve protocol pool. If the amount requested cannot be obtained, the method will get as much
  * as we have.
  */
  function withdrawToVault(uint256 amountWbtc) external restricted {
    // withdraw all from gauge
    Gauge(gauge).withdraw(Gauge(gauge).balanceOf(address(this)));
    // convert the mix to WBTC, but get at most amountWbtc
    mixToWBTC(amountWbtc);
    // we can transfer the asset to the vault
    uint256 actualBalance = IERC20(wbtc).balanceOf(address(this));
    if (actualBalance > 0) {
      IERC20(wbtc).safeTransfer(vault, Math.min(amountWbtc, actualBalance));
    }

    // invest back the rest
    investAllUnderlying();
  }

  /**
  * Withdraws all assets from the vault.
  */
  function withdrawAllToVault() external restricted {
    // withdraw all from gauge
    Gauge(gauge).withdraw(Gauge(gauge).balanceOf(address(this)));
    // convert the mix to WBTC, we want the entire balance
    mixToWBTC(uint256(~0));
    // we can transfer the asset to the vault
    uint256 actualBalance = IERC20(wbtc).balanceOf(address(this));
    if (actualBalance > 0) {
      IERC20(wbtc).safeTransfer(vault, actualBalance);
    }
  }

  /**
  * Invests all wbtc assets into our mixToken vault.
  */
  function investAllUnderlying() internal {
    // convert the entire balance not yet invested into mixToken first
    mixFromWBTC();

    // then deposit into the mixToken vault
    uint256 mixTokenBalance = IERC20(mixToken).balanceOf(address(this));
    if (mixTokenBalance > 0) {
      IERC20(mixToken).safeApprove(gauge, 0);
      IERC20(mixToken).safeApprove(gauge, mixTokenBalance);
      Gauge(gauge).deposit(mixTokenBalance);
    }
  }

  /**
  * The hard work only invests all wbtc assets, and then tells the controller to call hard
  * work on the mixToken vault.
  */
  function doHardWork() public restricted {
    claimAndLiquidateCrv();
    investAllUnderlying();
    wbtcPriceCheckpoint = wbtcValueFromMixToken(mixTokenUnit);
  }

  /**
  * Salvages a token. We cannot salvage mixToken tokens, CRV, or wbtc assets.
  */
  function salvage(address recipient, address token, uint256 amount) public onlyGovernance {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvageable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  /**
  * Returns the wbtc invested balance. The is the wbtc amount in this stragey, plus the gauge
  * amount of the mixed token converted back to wbtc.
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    uint256 gaugeBalance = Gauge(gauge).balanceOf(address(this));
    uint256 wbtcBalance = IERC20(wbtc).balanceOf(address(this));
    if (gaugeBalance == 0) {
      // !!! if we have 0 balance in gauge, the conversion to wbtc reverts in Curve
      // !!! this if-statement is necessary to avoid transaction reverts
      return wbtcBalance;
    }
    uint256 investedBalance = wbtcValueFromMixToken(gaugeBalance);
    return investedBalance.add(wbtcBalance);
  }

  function wbtcValueFromMixToken(uint256 mixTokenBalance) public view returns (uint256) {
    return ISwerveFi(curve).calc_withdraw_one_coin(mixTokenBalance,
      int128(tokenIndex));
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
  * Claims the CRV crop, converts it to WBTC/renWBTC on Uniswap
  */
  function claimAndLiquidateCrv() internal {
    if (!sell) {
      // Profits can be disabled for possible simplified and rapid exit
      emit ProfitsNotCollected();
      return;
    }
    Mintr(mintr).mint(gauge);
    // claiming rewards and liquidating them
    uint256 crvBalance = IERC20(crv).balanceOf(address(this));
    emit Liquidating(crvBalance);
    if (crvBalance > sellFloor) {
      uint256 wbtcBalanceBefore = IERC20(wbtc).balanceOf(address(this));
      IERC20(crv).safeApprove(uni, 0);
      IERC20(crv).safeApprove(uni, crvBalance);
      // we can accept 1 as the minimum because this will be called only by a trusted worker
      IUniswapV2Router02(uni).swapExactTokensForTokens(
        crvBalance, 1, uniswap_CRV2WBTC, address(this), block.timestamp
      );

      // now we have WBTC
      notifyProfit(wbtcBalanceBefore, IERC20(wbtc).balanceOf(address(this)));
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
