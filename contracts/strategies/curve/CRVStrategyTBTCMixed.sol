pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./interfaces/Gauge.sol";
import "./interfaces/ICurveTBTC.sol";
import "../../uniswap/interfaces/IUniswapV2Router02.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../hardworkInterface/IVault.sol";
import "../../Controllable.sol";
import "../ProfitNotifier.sol";

interface IKeepRewardsClaimable {
  function claim_rewards() external;
}

contract CRVStrategyTBTCMixed is IStrategy, ProfitNotifier {

  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  event Liquidating(address rewardToken, uint256 amount);
  event ProfitsNotCollected(address rewardToken);

  // the mixed token
  address public underlying;
  address public pool;
  address public mintr;
  address public crv;

  address public curve;
  address public weth;
  address public wbtc;
  address public keep;
  address public keepRewards;

  address public uni;

  // these tokens cannot be claimed by the governance
  mapping(address => bool) public unsalvagableTokens;

  address public vault;

  uint256 maxUint = uint256(~0);
  address[] public uniswap_CRV2WBTC;
  address[] public uniswap_KEEP2WBTC;

  // a flag for disabling selling for simplified emergency exit
  bool public sellCrv = true;
  bool public sellKeep = true;

  // minimum CRV, KEEP, or WBTC amounts to be liquidated
  uint256 public sellFloorCrv = 1e18;
  uint256 public sellFloorKeep = 1e15;
  uint256 public sellFloorWbtc = 10;

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
    address _curve,
    address _weth,
    address _wbtc,
    address _uniswap,
    address _keep,
    address _keepRewards
  )
  ProfitNotifier(_storage, _wbtc) public {
    require(IVault(_vault).underlying() == _underlying, "vault does not support TBTC-mixed");
    vault = _vault;
    underlying = _underlying;
    pool = _gauge;
    mintr = _mintr;
    crv = _crv;
    curve = _curve;
    weth = _weth;
    wbtc = _wbtc;
    uni = _uniswap;
    keep = _keep;
    keepRewards = _keepRewards;
    uniswap_CRV2WBTC = [crv, weth, wbtc];
    uniswap_KEEP2WBTC = [keep, weth, wbtc];
    // set these tokens to be not salvageable
    unsalvagableTokens[underlying] = true;
    unsalvagableTokens[crv] = true;
    unsalvagableTokens[keep] = true;
  }

  function depositArbCheck() public view returns(bool) {
    return true;
  }

  /**
  * Salvages a token. We should not be able to salvage CRV, KEEP, and the mixed token (underlying).
  */
  function salvage(address recipient, address token, uint256 amount) public onlyGovernance {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvageable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  /**
  * Withdraws the mixed token from the investment pool that mints crops.
  */
  function withdrawMixedFromPool(uint256 amount) internal {
    Gauge(pool).withdraw(
      Math.min(Gauge(pool).balanceOf(address(this)), amount)
    );
  }

  /**
  * Withdraws the the mixed token tokens to the pool in the specified amount.
  */
  function withdrawToVault(uint256 amountUnderlying) external restricted {
    withdrawMixedFromPool(amountUnderlying);
    if (IERC20(underlying).balanceOf(address(this)) < amountUnderlying) {
      claimAndLiquidateCrvAndKeep();
    }
    uint256 toTransfer = Math.min(IERC20(underlying).balanceOf(address(this)), amountUnderlying);
    IERC20(underlying).safeTransfer(vault, toTransfer);
  }

  /**
  * Withdraws all the the mixed token tokens to the pool.
  */
  function withdrawAllToVault() external restricted {
    claimAndLiquidateCrvAndKeep();
    withdrawMixedFromPool(maxUint);
    uint256 balance = IERC20(underlying).balanceOf(address(this));
    IERC20(underlying).safeTransfer(vault, balance);
  }

  /**
  * Invests all the underlying the mixed token into the pool that mints crops.
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
  * Claims the CRV and KEEP crops, converts them into WBTC on Uniswap, and then uses WBTC to mint the mixed token using the
  * Curve protocol.
  */
  function claimAndLiquidateCrvAndKeep() internal {
    uint256 wbtcBalanceBefore = IERC20(wbtc).balanceOf(address(this));

    if (!sellCrv) {
      emit ProfitsNotCollected(crv);
    } else {
      Mintr(mintr).mint(pool); // this also sends KEEP to keepRewards contract
      uint256 crvBalance = IERC20(crv).balanceOf(address(this));
      if (crvBalance < sellFloorCrv) {
        emit ProfitsNotCollected(crv);
      } else {
        emit Liquidating(crv, crvBalance);
        IERC20(crv).safeApprove(uni, 0);
        IERC20(crv).safeApprove(uni, crvBalance);
        // we can accept 1 as the minimum because this will be called only by a trusted worker
        IUniswapV2Router02(uni).swapExactTokensForTokens(
          crvBalance, 1, uniswap_CRV2WBTC, address(this), block.timestamp
        );
      }
    }

    if (!sellKeep) {
      emit ProfitsNotCollected(keep);
    } else {
      IKeepRewardsClaimable(keepRewards).claim_rewards();
      uint256 keepBalance = IERC20(keep).balanceOf(address(this));
      if (keepBalance < sellFloorKeep) {
        emit ProfitsNotCollected(keep);
      } else {
        emit Liquidating(keep, keepBalance);
        IERC20(keep).safeApprove(uni, 0);
        IERC20(keep).safeApprove(uni, keepBalance);
        // we can accept 1 as the minimum because this will be called only by a trusted worker
        IUniswapV2Router02(uni).swapExactTokensForTokens(
          keepBalance, 1, uniswap_KEEP2WBTC, address(this), block.timestamp
        );
      }
    }

    uint256 wbtcBalanceAfter = IERC20(wbtc).balanceOf(address(this));
    if (wbtcBalanceAfter < sellFloorWbtc) {
      emit ProfitsNotCollected(wbtc);
    } else {
      notifyProfit(wbtcBalanceBefore, wbtcBalanceAfter);
      curveMixedFromWBTC();
    }
  }

  /**
  * Claims and liquidates CRV into the mixed token, and then invests all underlying.
  */
  function doHardWork() public restricted {
    claimAndLiquidateCrvAndKeep();
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
  * Uses the Curve protocol to convert the underlying asset into the mixed token.
  */
  function curveMixedFromWBTC() internal {
    uint256 wbtcBalance = IERC20(wbtc).balanceOf(address(this));
    if (wbtcBalance > 0) {
      IERC20(wbtc).safeApprove(curve, 0);
      IERC20(wbtc).safeApprove(curve, wbtcBalance);
      uint256 minimum = 0;
      ICurveTBTC(curve).add_liquidity([0, 0, wbtcBalance, 0], minimum);
    }
  }

  /**
  * Can completely disable claiming CRV rewards and selling. Good for emergency withdraw in the
  * simplest possible way.
  */
  function setSellCrv(bool s) public onlyGovernance {
    sellCrv = s;
  }

  /**
  * Can completely disable claiming KEEP rewards and selling. Good for emergency withdraw in the
  * simplest possible way.
  */
  function setSellKeep(bool s) public onlyGovernance {
    sellKeep = s;
  }

  /**
  * Sets the minimum amount of CRV needed to trigger a sale.
  */
  function setSellFloorCrv(uint256 floor) public onlyGovernance {
    sellFloorCrv = floor;
  }

  /**
  * Sets the minimum amount of WBTC needed to trigger a sale.
  */
  function setSellFloorWbtc(uint256 floor) public onlyGovernance {
    sellFloorWbtc = floor;
  }

  /**
  * Sets the minimum amount of KEEP needed to trigger a sale.
  */
  function setSellFloorKeep(uint256 floor) public onlyGovernance {
    sellFloorKeep = floor;
  }

  function setLiquidationPaths(address[] memory _crvPath, address[] memory _keepPath) public onlyGovernance {
    uniswap_CRV2WBTC = _crvPath;
    uniswap_KEEP2WBTC = _keepPath;
  }
}
