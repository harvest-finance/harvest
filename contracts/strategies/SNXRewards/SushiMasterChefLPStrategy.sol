pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../uniswap/interfaces/IUniswapV2Router02.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../hardworkInterface/IVault.sol";
import "../upgradability/BaseUpgradeableStrategy.sol";
import "../../sushiswap/interfaces/IMasterChef.sol";
import "../../uniswap/interfaces/IUniswapV2Pair.sol";

/*
*   This is a general strategy for yields that are based on the synthetix reward contract
*   for example, yam, spaghetti, ham, shrimp.
*
*   One strategy is deployed for one underlying asset, but the design of the contract
*   should allow it to switch between different reward contracts.
*
*   It is important to note that not all SNX reward contracts that are accessible via the same interface are
*   suitable for this Strategy. One concrete example is CREAM.finance, as it implements a "Lock" feature and
*   would not allow the user to withdraw within some timeframe after the user have deposited.
*   This would be problematic to user as our "invest" function in the vault could be invoked by anyone anytime
*   and thus locking/reverting on subsequent withdrawals. Another variation is the YFI Governance: it can
*   activate a vote lock to stop withdrawal.
*
*   Ref:
*   1. CREAM https://etherscan.io/address/0xc29e89845fa794aa0a0b8823de23b760c3d766f5#code
*   2. YAM https://etherscan.io/address/0x8538E5910c6F80419CD3170c26073Ff238048c9E#code
*   3. SHRIMP https://etherscan.io/address/0x9f83883FD3cadB7d2A83a1De51F9Bf483438122e#code
*   4. BASED https://etherscan.io/address/0x5BB622ba7b2F09BF23F1a9b509cd210A818c53d7#code
*   5. YFII https://etherscan.io/address/0xb81D3cB2708530ea990a287142b82D058725C092#code
*   6. YFIGovernance https://etherscan.io/address/0xBa37B002AbaFDd8E89a1995dA52740bbC013D992#code
*
*
*
*   Respecting the current system design of choosing the best strategy under the vault, and also rewarding/funding
*   the public key that invokes the switch of strategies, this smart contract should be deployed twice and linked
*   to the same vault. When the governance want to rotate the crop, they would set the reward source on the strategy
*   that is not active, then set that apy higher and this one lower.
*
*   Consequently, in the smart contract we restrict that we can only set a new reward source when it is not active.
*
*/

contract SushiMasterChefLPStrategy is IStrategy, BaseUpgradeableStrategy {

  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  address public constant uniswapRouterV2 = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
  address public constant sushiswapRouterV2 = address(0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F);

  // additional storage slots (on top of BaseUpgradeableStrategy ones) are defined here
  bytes32 internal constant _POOLID_SLOT = 0x3fd729bfa2e28b7806b03a6e014729f59477b530f995be4d51defc9dad94810b;
  bytes32 internal constant _USE_UNI_SLOT = 0x1132c1de5e5b6f1c4c7726265ddcf1f4ae2a9ecf258a0002de174248ecbf2c7a;

  // this would be reset on each upgrade
  mapping (address => address[]) public uniswapRoutes;
  mapping (address => address[]) public sushiswapRoutes;

  constructor() public BaseUpgradeableStrategy() {
    assert(_POOLID_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.poolId")) - 1));
    assert(_USE_UNI_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.useUni")) - 1));
  }

  function initializeStrategy(
    address _storage,
    address _underlying,
    address _vault,
    address _rewardPool,
    address _rewardToken,
    uint256 _poolID
  ) public initializer {

    BaseUpgradeableStrategy.initialize(
      _storage,
      _underlying,
      _vault,
      _rewardPool,
      _rewardToken,
      300, // profit sharing numerator
      1000, // profit sharing denominator
      true, // sell
      1e18, // sell floor
      12 hours // implementation change delay
    );

    address _lpt;
    (_lpt,,,) = IMasterChef(rewardPool()).poolInfo(_poolID);
    require(_lpt == underlying(), "Pool Info does not match underlying");
    _setPoolId(_poolID);

    address uniLPComponentToken0 = IUniswapV2Pair(underlying()).token0();
    address uniLPComponentToken1 = IUniswapV2Pair(underlying()).token1();

    // these would be required to be initialized separately by governance
    uniswapRoutes[uniLPComponentToken0] = new address[](0);
    uniswapRoutes[uniLPComponentToken1] = new address[](0);
    sushiswapRoutes[uniLPComponentToken0] = new address[](0);
    sushiswapRoutes[uniLPComponentToken1] = new address[](0);

    setBoolean(_USE_UNI_SLOT, true);
  }

  function depositArbCheck() public view returns(bool) {
    return true;
  }

  function rewardPoolBalance() internal view returns (uint256 bal) {
      (bal,) = IMasterChef(rewardPool()).userInfo(poolId(), address(this));
  }

  function exitRewardPool() internal {
      uint256 bal = rewardPoolBalance();
      if (bal != 0) {
          IMasterChef(rewardPool()).withdraw(poolId(), bal);
      }
  }

  function unsalvagableTokens(address token) public view returns (bool) {
    return (token == rewardToken() || token == underlying());
  }

  function enterRewardPool() internal {
    uint256 entireBalance = IERC20(underlying()).balanceOf(address(this));
    IERC20(underlying()).safeApprove(rewardPool(), 0);
    IERC20(underlying()).safeApprove(rewardPool(), entireBalance);
    IMasterChef(rewardPool()).deposit(poolId(), entireBalance);
  }

  /*
  *   In case there are some issues discovered about the pool or underlying asset
  *   Governance can exit the pool properly
  *   The function is only used for emergency to exit the pool
  */
  function emergencyExit() public onlyGovernance {
    exitRewardPool();
    _setPausedInvesting(true);
  }

  /*
  *   Resumes the ability to invest into the underlying reward pools
  */

  function continueInvesting() public onlyGovernance {
    _setPausedInvesting(false);
  }

  function setLiquidationPathsOnUni(address [] memory _uniswapRouteToToken0, address [] memory _uniswapRouteToToken1) public onlyGovernance {
    address uniLPComponentToken0 = IUniswapV2Pair(underlying()).token0();
    address uniLPComponentToken1 = IUniswapV2Pair(underlying()).token1();
    uniswapRoutes[uniLPComponentToken0] = _uniswapRouteToToken0;
    uniswapRoutes[uniLPComponentToken1] = _uniswapRouteToToken1;
  }

  function setLiquidationPathsOnSushi(address [] memory _uniswapRouteToToken0, address [] memory _uniswapRouteToToken1) public onlyGovernance {
    address uniLPComponentToken0 = IUniswapV2Pair(underlying()).token0();
    address uniLPComponentToken1 = IUniswapV2Pair(underlying()).token1();
    sushiswapRoutes[uniLPComponentToken0] = _uniswapRouteToToken0;
    sushiswapRoutes[uniLPComponentToken1] = _uniswapRouteToToken1;
  }

  // We assume that all the tradings can be done on Uniswap
  function _liquidateReward() internal {
    uint256 rewardBalance = IERC20(rewardToken()).balanceOf(address(this));
    if (!sell() || rewardBalance < sellFloor()) {
      // Profits can be disabled for possible simplified and rapid exit
      emit ProfitsNotCollected(sell(), rewardBalance < sellFloor());
      return;
    }

    notifyProfitInRewardToken(rewardBalance);
    uint256 remainingRewardBalance = IERC20(rewardToken()).balanceOf(address(this));

    address uniLPComponentToken0 = IUniswapV2Pair(underlying()).token0();
    address uniLPComponentToken1 = IUniswapV2Pair(underlying()).token1();

    address[] memory routesToken0;
    address[] memory routesToken1;
    address routerV2;

    if(useUni()) {
      routerV2 = uniswapRouterV2;
      routesToken0 = uniswapRoutes[address(uniLPComponentToken0)];
      routesToken1 = uniswapRoutes[address(uniLPComponentToken1)];
    } else {
      routerV2 = sushiswapRouterV2;
      routesToken0 = sushiswapRoutes[address(uniLPComponentToken0)];
      routesToken1 = sushiswapRoutes[address(uniLPComponentToken1)];
    }


    if (remainingRewardBalance > 0 // we have tokens to swap
      && routesToken0.length > 1 // and we have a route to do the swap
      && routesToken1.length > 1 // and we have a route to do the swap
    ) {

      // allow Uniswap to sell our reward
      uint256 amountOutMin = 1;

      IERC20(rewardToken()).safeApprove(routerV2, 0);
      IERC20(rewardToken()).safeApprove(routerV2, remainingRewardBalance);

      uint256 toToken0 = remainingRewardBalance / 2;
      uint256 toToken1 = remainingRewardBalance.sub(toToken0);

      // we sell to uni

      // sell Uni to token1
      // we can accept 1 as minimum because this is called only by a trusted role
      IUniswapV2Router02(routerV2).swapExactTokensForTokens(
        toToken0,
        amountOutMin,
        routesToken0,
        address(this),
        block.timestamp
      );
      uint256 token0Amount = IERC20(uniLPComponentToken0).balanceOf(address(this));

      // sell Uni to token2
      // we can accept 1 as minimum because this is called only by a trusted role
      IUniswapV2Router02(routerV2).swapExactTokensForTokens(
        toToken1,
        amountOutMin,
        routesToken1,
        address(this),
        block.timestamp
      );
      uint256 token1Amount = IERC20(uniLPComponentToken1).balanceOf(address(this));

      // provide token1 and token2 to SUSHI
      IERC20(uniLPComponentToken0).safeApprove(sushiswapRouterV2, 0);
      IERC20(uniLPComponentToken0).safeApprove(sushiswapRouterV2, token0Amount);

      IERC20(uniLPComponentToken1).safeApprove(sushiswapRouterV2, 0);
      IERC20(uniLPComponentToken1).safeApprove(sushiswapRouterV2, token1Amount);

      // we provide liquidity to sushi
      uint256 liquidity;
      (,,liquidity) = IUniswapV2Router02(sushiswapRouterV2).addLiquidity(
        uniLPComponentToken0,
        uniLPComponentToken1,
        token0Amount,
        token1Amount,
        1,  // we are willing to take whatever the pair gives us
        1,  // we are willing to take whatever the pair gives us
        address(this),
        block.timestamp
      );
    }
  }

  /*
  *   Stakes everything the strategy holds into the reward pool
  */
  function investAllUnderlying() internal onlyNotPausedInvesting {
    // this check is needed, because most of the SNX reward pools will revert if
    // you try to stake(0).
    if(IERC20(underlying()).balanceOf(address(this)) > 0) {
      enterRewardPool();
    }
  }

  /*
  *   Withdraws all the asset to the vault
  */
  function withdrawAllToVault() public restricted {
    if (address(rewardPool()) != address(0)) {
      exitRewardPool();
    }
    _liquidateReward();
    IERC20(underlying()).safeTransfer(vault(), IERC20(underlying()).balanceOf(address(this)));
  }

  /*
  *   Withdraws all the asset to the vault
  */
  function withdrawToVault(uint256 amount) public restricted {
    // Typically there wouldn't be any amount here
    // however, it is possible because of the emergencyExit
    uint256 entireBalance = IERC20(underlying()).balanceOf(address(this));

    if(amount > entireBalance){
      // While we have the check above, we still using SafeMath below
      // for the peace of mind (in case something gets changed in between)
      uint256 needToWithdraw = amount.sub(entireBalance);
      uint256 toWithdraw = Math.min(rewardPoolBalance(), needToWithdraw);
      IMasterChef(rewardPool()).withdraw(poolId(), toWithdraw);
    }

    IERC20(underlying()).safeTransfer(vault(), amount);
  }

  /*
  *   Note that we currently do not have a mechanism here to include the
  *   amount of reward that is accrued.
  */
  function investedUnderlyingBalance() external view returns (uint256) {
    if (rewardPool() == address(0)) {
      return IERC20(underlying()).balanceOf(address(this));
    }
    // Adding the amount locked in the reward pool and the amount that is somehow in this contract
    // both are in the units of "underlying"
    // The second part is needed because there is the emergency exit mechanism
    // which would break the assumption that all the funds are always inside of the reward pool
    return rewardPoolBalance().add(IERC20(underlying()).balanceOf(address(this)));
  }

  /*
  *   Governance or Controller can claim coins that are somehow transferred into the contract
  *   Note that they cannot come in take away coins that are used and defined in the strategy itself
  */
  function salvage(address recipient, address token, uint256 amount) external onlyControllerOrGovernance {
     // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens(token), "token is defined as not salvagable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  /*
  *   Get the reward, sell it in exchange for underlying, invest what you got.
  *   It's not much, but it's honest work.
  *
  *   Note that although `onlyNotPausedInvesting` is not added here,
  *   calling `investAllUnderlying()` affectively blocks the usage of `doHardWork`
  *   when the investing is being paused by governance.
  */
  function doHardWork() external onlyNotPausedInvesting restricted {
    exitRewardPool();
    _liquidateReward();
    investAllUnderlying();
  }

  /**
  * Can completely disable claiming UNI rewards and selling. Good for emergency withdraw in the
  * simplest possible way.
  */
  function setSell(bool s) public onlyGovernance {
    _setSell(s);
  }

  /**
  * Sets the minimum amount of CRV needed to trigger a sale.
  */
  function setSellFloor(uint256 floor) public onlyGovernance {
    _setSellFloor(floor);
  }

  // masterchef rewards pool ID
  function _setPoolId(uint256 _value) internal {
    setUint256(_POOLID_SLOT, _value);
  }

  function poolId() public view returns (uint256) {
    return getUint256(_POOLID_SLOT);
  }

  function setUseUni(bool _value) public onlyGovernance {
    setBoolean(_USE_UNI_SLOT, _value);
  }

  function useUni() public view returns (bool) {
    return getBoolean(_USE_UNI_SLOT);
  }

  function finalizeUpgrade() external onlyGovernance {
    _finalizeUpgrade();
    // reset the liquidation paths
    // they need to be re-set manually
    address uniLPComponentToken0 = IUniswapV2Pair(underlying()).token0();
    address uniLPComponentToken1 = IUniswapV2Pair(underlying()).token1();

    // these would be required to be initialized separately by governance
    uniswapRoutes[uniLPComponentToken0] = new address[](0);
    uniswapRoutes[uniLPComponentToken1] = new address[](0);
    sushiswapRoutes[uniLPComponentToken0] = new address[](0);
    sushiswapRoutes[uniLPComponentToken1] = new address[](0);
  }
}
