pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./interfaces/Gauge.sol";
import "./interfaces/ICurveFi.sol";
import "./interfaces/yVault.sol";
import "../../uniswap/interfaces/IUniswapV2Router02.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../hardworkInterface/IVault.sol";
import "../../Controllable.sol";
import "../ProfitNotifier.sol";


/**
* This strategy is for the yCRV vault, i.e., the underlying token is yCRV. It is not to accept
* stable coins. It will farm the CRV crop. For liquidation, it swaps CRV into DAI and uses DAI
* to produce yCRV.
*/
contract CRVStrategyYCRV is IStrategy, ProfitNotifier {

  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  event Liquidating(uint256 amount);

  // yDAIyUSDCyUSDTyTUSD (yCRV)
  address public underlying;
  address public pool;
  address public mintr;
  address public crv;

  address public curve;
  address public weth;
  address public dai;
  address public yDai;

  address public uni = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

  // these tokens cannot be claimed by the governance
  mapping(address => bool) public unsalvagableTokens;

  // our vault holding the underlying token (yCRV)
  address public vault;

  uint256 maxUint = uint256(~0);
  address[] public uniswap_CRV2DAI;

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
    address _dai,
    address _yDai,
    address _uniswap
  )
  ProfitNotifier(_storage, _dai) public {
    require(IVault(_vault).underlying() == _underlying, "vault does not support yCRV");
    vault = _vault;
    // set these tokens to be not salvageable
    unsalvagableTokens[underlying] = true;
    unsalvagableTokens[crv] = true;
    underlying = _underlying;
    pool = _gauge;
    mintr = _mintr;
    crv = _crv;
    curve = _curve;
    weth = _weth;
    dai = _dai;
    yDai = _yDai;
    uni = _uniswap;
    uniswap_CRV2DAI = [crv, weth, dai];
  }

  function depositArbCheck() public view returns(bool) {
    return true;
  }

  /**
  * Salvages a token. We should not be able to salvage CRV and yCRV (underlying).
  */
  function salvage(address recipient, address token, uint256 amount) public onlyGovernance {
    // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvageable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  /**
  * Withdraws yCRV from the investment pool that mints crops.
  */
  function withdrawYCrvFromPool(uint256 amount) internal {
    Gauge(pool).withdraw(
      Math.min(Gauge(pool).balanceOf(address(this)), amount)
    );
  }

  /**
  * Withdraws the yCRV tokens to the pool in the specified amount.
  */
  function withdrawToVault(uint256 amountUnderlying) external restricted {
    withdrawYCrvFromPool(amountUnderlying);
    if (IERC20(underlying).balanceOf(address(this)) < amountUnderlying) {
      claimAndLiquidateCrv();
    }
    uint256 toTransfer = Math.min(IERC20(underlying).balanceOf(address(this)), amountUnderlying);
    IERC20(underlying).safeTransfer(vault, toTransfer);
  }

  /**
  * Withdraws all the yCRV tokens to the pool.
  */
  function withdrawAllToVault() external restricted {
    claimAndLiquidateCrv();
    withdrawYCrvFromPool(maxUint);
    uint256 balance = IERC20(underlying).balanceOf(address(this));
    IERC20(underlying).safeTransfer(vault, balance);
  }

  /**
  * Invests all the underlying yCRV into the pool that mints crops (CRV_.
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
  * Claims the CRV crop, converts it to DAI on Uniswap, and then uses DAI to mint yCRV using the
  * Curve protocol.
  */
  function claimAndLiquidateCrv() internal {
    Mintr(mintr).mint(pool);
    // claiming rewards and sending them to the master strategy
    uint256 crvBalance = IERC20(crv).balanceOf(address(this));
    emit Liquidating(crvBalance);
    if (crvBalance > 0) {
      uint256 daiBalanceBefore = IERC20(dai).balanceOf(address(this));
      IERC20(crv).safeApprove(uni, 0);
      IERC20(crv).safeApprove(uni, crvBalance);
      // we can accept 1 as the minimum because this will be called only by a trusted worker
      IUniswapV2Router02(uni).swapExactTokensForTokens(
        crvBalance, 1, uniswap_CRV2DAI, address(this), block.timestamp
      );
      // now we have DAI
      // pay fee before making yCRV
      notifyProfit(daiBalanceBefore, IERC20(dai).balanceOf(address(this)));

      // liquidate if there is any DAI left
      if(IERC20(dai).balanceOf(address(this)) > 0) {
        yCurveFromDai();
      }
      // now we have yCRV
    }
  }

  /**
  * Claims and liquidates CRV into yCRV, and then invests all underlying.
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
  * Converts all DAI to yCRV using the CRV protocol.
  */
  function yCurveFromDai() internal {
    uint256 daiBalance = IERC20(dai).balanceOf(address(this));
    if (daiBalance > 0) {
      IERC20(dai).safeApprove(yDai, 0);
      IERC20(dai).safeApprove(yDai, daiBalance);
      yERC20(yDai).deposit(daiBalance);
    }
    uint256 yDaiBalance = IERC20(yDai).balanceOf(address(this));
    if (yDaiBalance > 0) {
      IERC20(yDai).safeApprove(curve, 0);
      IERC20(yDai).safeApprove(curve, yDaiBalance);
      // we can accept 0 as minimum, this will be called only by trusted roles
      uint256 minimum = 0;
      ICurveFi(curve).add_liquidity([yDaiBalance, 0, 0, 0], minimum);
    }
    // now we have yCRV
  }
}
