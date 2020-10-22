pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";
import "../interfaces/Gauge.sol";
import "../interfaces/ICurveFiWbtc.sol";
import "../../../uniswap/interfaces/IUniswapV2Router02.sol";


contract CRVStrategyWBTCPure is Ownable {

  enum TokenIndex {REN_BTC, WBTC}

  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  // wbtc asset
  address public wbtc;

  // the matching enum record used to determine the index
  TokenIndex tokenIndex;

  // our vault holding the wbtc asset
  address public vault;

  // our vault for depositing the mixToken tokens
  address public mixVault;

  // the address of mixToken token
  address public mixToken;

  // the address of the Curve protocol
  address public curve;

  // these tokens cannot be claimed by the governance
  mapping(address => bool) public unsalvagableTokens;

  // the wbtc gauge in Curve
  address public pool;

  address public mintr;

  address public crv;
  address public uni;

  uint256 public wbtcPriceCheckpoint;
  uint256 public mixTokenUnit;
  uint256 public arbTolerance = 3;
  address[] public uniswap_CRV2WBTC;
  event D(string x, uint256 v);
  address public underlying;

  constructor(
    address _storage,
    address _wbtc,
    address _vault,
    uint256 _tokenIndex,
    address _mixToken,
    address _curveProtocol,
    address _crv,
    address _weth,
    address _pool,
    address _mintr,
    address _uniswap
  ) public {
    vault = _vault;
    wbtc = _wbtc;
    underlying = _wbtc;
    tokenIndex = TokenIndex(_tokenIndex);
    mixToken = _mixToken;
    curve = _curveProtocol;
    pool = _pool;
    crv = _crv;
    uni = _uniswap;
    mintr = _mintr;

    uniswap_CRV2WBTC = [_crv, _weth, _wbtc];

    // set these tokens to be not salvageable
    unsalvagableTokens[wbtc] = true;
    unsalvagableTokens[mixToken] = true;
    unsalvagableTokens[_crv] = true;

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

  function setArbTolerance(uint256 tolerance) external onlyOwner {
    require(tolerance <= 100, "at most 100");
    arbTolerance = tolerance;
  }

  /**
  * Uses the Curve protocol to convert the wbtc asset into yAsset and then to mixToken.
  */
  function mixFromWBTC() internal {
    uint256 wbtcBalance = IERC20(wbtc).balanceOf(address(this));
    emit D("mixFromWBTC wbtcBalance to make mix", wbtcBalance);
    if (wbtcBalance > 0) {
      IERC20(wbtc).safeApprove(curve, 0);
      IERC20(wbtc).safeApprove(curve, wbtcBalance);
      // we can accept 0 as minimum because this is called only by a trusted role
      uint256 minimum = 0;
      uint256[2] memory coinAmounts = wrapCoinAmount(wbtcBalance);
      emit D("adding liquidity", coinAmounts[1]);
      ICurveFiWbtc(curve).add_liquidity(
        coinAmounts, minimum
      );
    }
    // now we have the mixToken
  }

  /**
  * Uses the Curve protocol to convert the mixToken back into the wbtc asset. If it cannot acquire
  * the limit amount, it will acquire the maximum it can.
  */
  function mixToWBTC(uint256 wbtcLimit) internal {
    emit D("mixToWBTC", wbtcLimit);
    uint256 mixTokenBalance = IERC20(mixToken).balanceOf(address(this));
    emit D("we got back in mix", mixTokenBalance);

    // todo: we need to figure out this method
    // this is the maximum number of wbtc we can get for our mixToken
    uint256 wbtcMaximumAmount = wbtcValueFromMixToken(mixTokenBalance);
    if (wbtcMaximumAmount == 0) {
      return;
    }

    if (wbtcLimit < wbtcMaximumAmount) {
      // we want less than what we can get, we ask for the exact amount
      emit D("trying to withdraw", wbtcLimit);
      // now we can remove the liquidity
      uint256[2] memory tokenAmounts = wrapCoinAmount(wbtcLimit);
      IERC20(mixToken).safeApprove(curve, 0);
      IERC20(mixToken).safeApprove(curve, mixTokenBalance);
      ICurveFiWbtc(curve).remove_liquidity_imbalance(
        tokenAmounts, mixTokenBalance
      );
      emit D("we got back in wbtc", IERC20(wbtc).balanceOf(address(this)));
    } else {
      emit D("trying to withdraw maximum", uint256(-1));
      // we want more than we can get, so we withdraw everything
      IERC20(mixToken).safeApprove(curve, 0);
      IERC20(mixToken).safeApprove(curve, mixTokenBalance);
      ICurveFiWbtc(curve).remove_liquidity_one_coin(mixTokenBalance, int128(tokenIndex), 0);
      emit D("we got back in wbtc", IERC20(wbtc).balanceOf(address(this)));
    }
    // now we have wbtc asset
  }

  /**
  * Withdraws an wbtc asset from the strategy to the vault in the specified amount by asking
  * the mixToken vault for mixToken (currently all of it), and then removing imbalanced liquidity from
  * the Curve protocol. The rest is deposited back to the mixToken vault. If the amount requested cannot
  * be obtained, the method will get as much as we have.
  */
  function withdrawToVault(uint256 amountWbtc) external onlyOwner {
    emit D("withdrawToVault", amountWbtc);
    // withdraw all from gauge
    Gauge(pool).withdraw(Gauge(pool).balanceOf(address(this)));
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
  * Withdraws all assets from the vault. We ask the mixToken vault to give us our entire mixToken balance
  * and then convert it to the wbtc asset using the Curve protocol.
  */
  function withdrawAllToVault() external onlyOwner {
    emit D("withdrawAllToVault", 0);
    // withdraw all from gauge
    Gauge(pool).withdraw(Gauge(pool).balanceOf(address(this)));
    // convert the mix to WBTC, we want the entire balance
    mixToWBTC(uint256(~0));
    // we can transfer the asset to the vault
    uint256 actualBalance = IERC20(wbtc).balanceOf(address(this));
    emit D("withdrawAllToVault actualBalance", actualBalance);
    if (actualBalance > 0) {
      IERC20(wbtc).safeTransfer(vault, actualBalance);
    }
  }

  /**
  * Invests all wbtc assets into our mixToken vault.
  */
  function investAllUnderlying() internal {
    emit D("investAllUnderlying", 0);
    uint256 actualBalance = IERC20(wbtc).balanceOf(address(this));
    emit D("withdrawAllToVault actualBalance", actualBalance);
    // convert the entire balance not yet invested into mixToken first
    mixFromWBTC();

    // then deposit into the mixToken vault
    uint256 mixTokenBalance = IERC20(mixToken).balanceOf(address(this));
    if (mixTokenBalance > 0) {
      IERC20(mixToken).safeApprove(pool, 0);
      IERC20(mixToken).safeApprove(pool, mixTokenBalance);
      emit D("mix token balance", mixTokenBalance);
      Gauge(pool).deposit(mixTokenBalance);
    }
  }

  /**
  * The hard work only invests all wbtc assets, and then tells the controller to call hard
  * work on the mixToken vault.
  */
  function doHardWork() public onlyOwner {
    // todo: enable liquidation
    claimAndLiquidateCrv();
    investAllUnderlying();
    wbtcPriceCheckpoint = wbtcValueFromMixToken(mixTokenUnit);
  }

  /**
  * Salvages a token. We cannot salvage the shares in the mixToken pool, mixToken tokens, or wbtc
  * assets.
  */
  function salvage(address recipient, address token, uint256 amount) public onlyOwner {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvageable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  /**
  * Returns the wbtc invested balance. This is the amount of mixToken that we are entitled to
  * from the mixToken vault (based on the number of shares we currently have), converted to the
  * wbtc assets by the Curve protocol, plus the current balance of the wbtc assets.
  */
  function investedUnderlyingBalance() public view returns (uint256) {
    uint256 gaugeBalance = Gauge(pool).balanceOf(address(this));
    uint256 investedBalance = wbtcValueFromMixToken(gaugeBalance);
    return investedBalance.add(IERC20(wbtc).balanceOf(address(this)));
  }

  function wbtcValueFromMixToken(uint256 mixTokenBalance) public view returns (uint256) {
    // todo: this naively expects -5%, and cuts 10 decimals first
    return ICurveFiWbtc(curve).calc_withdraw_one_coin(mixTokenBalance,
      int128(tokenIndex));
  }

  /**
  * Wraps the coin amount in the array for interacting with the Curve protocol
  */
  function wrapCoinAmount(uint256 amount) internal view returns (uint256[2] memory) {
    uint256[2] memory amounts = [uint256(0), uint256(0)];
    amounts[uint56(tokenIndex)] = amount;
    return amounts;
  }

  event Liquidating(uint256 amount);
  event A(address a);

  /**
  * Claims the CRV crop, converts it to DAI on Uniswap, and then uses DAI to mint yCRV using the
  * Curve protocol.
  */
  function claimAndLiquidateCrv() internal {
    emit D("Claim and liquidate" , 0);
    if (!sell) {
      emit D("Selling not allowed" , 0);
      return;
    }
    emit A(mintr);
    emit A(pool);
    Mintr(mintr).mint(pool);
    // claiming rewards and liquidating them
    uint256 crvBalance = IERC20(crv).balanceOf(address(this));
    emit Liquidating(crvBalance);
    // todo: setting some bound to not get 0 output, not sure if this is needed
    if (crvBalance > 1e18) {
      uint256 wbtcBalanceBefore = IERC20(wbtc).balanceOf(address(this));
      emit D("Claim and liquidate wbtcBalanceBefore" , wbtcBalanceBefore);
      emit D("Claim and liquidate crvBalance" , crvBalance);
      IERC20(crv).safeApprove(uni, 0);
      IERC20(crv).safeApprove(uni, crvBalance);
      // we can accept 1 as the minimum because this will be called only by a trusted worker
      // todo: check if this can be 0
      IUniswapV2Router02(uni).swapExactTokensForTokens(
        crvBalance, 1, uniswap_CRV2WBTC, address(this), block.timestamp
      );

      // now we have WBTC
      // notifyProfit(wbtcBalanceBefore, IERC20(wbtc).balanceOf(address(this)));
    }
  }

  bool public sell;
  function setSell(bool s) public onlyOwner {
    sell = s;
  }
}
