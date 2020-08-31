pragma solidity 0.5.16;

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../Controllable.sol";
import "../../uniswap/interfaces/IUniswapV2Router02.sol";
import "../../hardworkInterface/IStrategy.sol";
import "../../hardworkInterface/IVault.sol";
import "./SNXRewardInterface.sol";
import "../ProfitNotifier.sol";

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

contract SNXRewardStrategy is IStrategy, Controllable, ProfitNotifier {

  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  ERC20Detailed public underlying;
  address public vault;
  bool pausedInvesting = false; // When this flag is true, the strategy will not be able to invest. But users should be able to withdraw.

  SNXRewardInterface public rewardPool;
  address public rewardToken; // unfortunately, the interface is not unified for rewardToken for all the variants

  // UniswapV2Router02
  // https://uniswap.org/docs/v2/smart-contracts/router02/
  // https://etherscan.io/address/0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
  address public constant uniswapRouterV2 = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

  mapping (address => address[]) public uniswapRoutes;

  // These tokens cannot be claimed by the controller
  mapping (address => bool) public unsalvagableTokens;

  modifier restricted() {
    require(msg.sender == vault || msg.sender == controller()
      || msg.sender == governance(),
      "The sender has to be the controller, governance, or vault");
    _;
  }

  // This is only used in `investAllUnderlying()`
  // The user can still freely withdraw from the strategy
  modifier onlyNotPausedInvesting() {
    require(!pausedInvesting, "Action blocked as the strategy is in emergency state");
    _;
  }

  constructor(
    address _storage,
    address _underlying,
    address _vault
  )
  ProfitNotifier(_storage, _underlying)
  public {
    underlying = ERC20Detailed(_underlying);
    vault = _vault;
    unsalvagableTokens[_underlying] = true;
  }

  function depositArbCheck() public view returns(bool) {
    return true;
  }

  /*
  *   In case there are some issues discovered about the pool or underlying asset
  *   Governance can exit the pool properly
  *   The function is only used for emergency to exit the pool
  */
  function emergencyExit() public onlyGovernance {
    rewardPool.exit();
    pausedInvesting = true;
  }

  /*
  *   Resumes the ability to invest into the underlying reward pools
  */

  function continueInvesting() public onlyGovernance {
    pausedInvesting = false;
  }

  /*
  *   Governance can switch the source of rewards of the strategy with this method. In the beginning the reward pool might be empty,
  *   In this case we directly set to the new reward source. Under other circumstances, we exit the current pool, liquidate the reward,
  *   then do the switch.
  *
  *   The interface for the reward token is not unified for different variations of Synthetix reward contracts
  *   thus the correctness of rewardToken is not enforced.
  *
  *   It is possible that the uniswapRoute was not correct as this cannot be enforced by the smart contract
  *   However, there is no risk to the funds being managed. If the route itself was not valid, it should revert on Uniswap's side.
  *   This can be unblocked by having the governance update the reward source information
  */
  function switchRewardSource(address _rewardPool) public onlyGovernance {

    if (address(rewardPool) != address(0)) {
      rewardPool.exit();
      _liquidateReward();
    }

    // This strategy is not active, so we could directly update to new reward token & pool
    rewardPool = SNXRewardInterface(_rewardPool);
    rewardToken = uniswapRoutes[_rewardPool][0];

    // now invest
    investAllUnderlying();
  }

  /*
  * It is important for the Governance and users to validate the following before adding a reward source:
  *   (1) the _rewardToken is indeed the rewardToken that we would obtain from the rewardPool.
  *   (2) there is no "Lock" implemented in the withdraw pool that prevents individual users from withdrawing
  *   (3) there is no flag that could enable any kind of locks.
  * We recommend to use mainnet fork test and run a simulation first to make sure that this would not happen.
  *
  * RewardSource should only be set on a strategy when it is not active.
  */
  function setRewardSource(address _rewardPool,
    address _rewardToken,
    address[] memory _uniswapRoute) public onlyGovernance {
    // the route can be empty if it a route is still unknown
    unsalvagableTokens[_rewardToken] = true;
    uniswapRoutes[_rewardPool] = _uniswapRoute;
    require(_rewardToken == _uniswapRoute[0],
      "The first token of the Uniswap route must be the reward token");
    if (_uniswapRoute.length > 1) {
      require(address(underlying) == _uniswapRoute[(_uniswapRoute.length).sub(1)],
        "The last token of the Uniswap route must be the underlying token");
    }
  }

  /**
  * Sets the route for liquidating the reward token to the underlying token
  */
  function setLiquidationRoute(address _rewardPool,
    address _rewardToken,
    address[] memory _uniswapRoute) public onlyGovernance {
    require(_rewardToken == _uniswapRoute[0],
      "The first token of the Uniswap route must be the reward token");
    require(address(underlying) == _uniswapRoute[(_uniswapRoute.length).sub(1)],
      "The last token of the Uniswap route must be the underlying token");
    uniswapRoutes[_rewardPool] = _uniswapRoute;
  }

  // We assume that all the tradings can be done on Uniswap
  function _liquidateReward() internal {
    uint256 oldBalance = underlying.balanceOf(address(this));
    uint256 rewardAmount = IERC20(rewardToken).balanceOf(address(this));

    if (rewardAmount > 0 // we have tokens to swap
      && uniswapRoutes[address(rewardPool)].length > 1 // and we have a route to do the swap
    ) {
      // we can accept 1 as minimum because this is called only by a trusted role
      uint256 amountOutMin = 1;

      IERC20(rewardToken).safeApprove(uniswapRouterV2, 0);
      IERC20(rewardToken).safeApprove(uniswapRouterV2, rewardAmount);

      IUniswapV2Router02(uniswapRouterV2).swapExactTokensForTokens(
        rewardAmount,
        amountOutMin,
        uniswapRoutes[address(rewardPool)],
        address(this),
        block.timestamp
      );
      // give a profit share to fee forwarder, which re-distributes this to
      // the profit sharing pools
      notifyProfit(oldBalance, underlying.balanceOf(address(this)));
    }
  }

  /*
  *   Stakes everything the strategy holds into the reward pool
  */
  function investAllUnderlying() internal onlyNotPausedInvesting {
    // this check is needed, because most of the SNX reward pools will revert if
    // you try to stake(0).
    if(underlying.balanceOf(address(this)) > 0) {
      underlying.approve(address(rewardPool), underlying.balanceOf(address(this)));
      rewardPool.stake(underlying.balanceOf(address(this)));
    }
  }

  /*
  *   Withdraws all the asset to the vault
  */
  function withdrawAllToVault() public restricted {
    if (address(rewardPool) != address(0)) {
      rewardPool.exit();
    }
    _liquidateReward();
    IERC20(underlying).safeTransfer(vault, underlying.balanceOf(address(this)));
  }

  /*
  *   Withdraws all the asset to the vault
  */
  function withdrawToVault(uint256 amount) public restricted {
    // Typically there wouldn't be any amount here
    // however, it is possible because of the emergencyExit
    if(amount > underlying.balanceOf(address(this))){
      // While we have the check above, we still using SafeMath below
      // for the peace of mind (in case something gets changed in between)
      uint256 needToWithdraw = amount.sub(underlying.balanceOf(address(this)));
      rewardPool.withdraw(Math.min(rewardPool.balanceOf(address(this)), needToWithdraw));
    }

    IERC20(underlying).safeTransfer(vault, amount);
  }

  /*
  *   Note that we currently do not have a mechanism here to include the
  *   amount of reward that is accrued.
  */
  function investedUnderlyingBalance() external view returns (uint256) {
    if (address(rewardPool) == address(0)) {
      return underlying.balanceOf(address(this));
    }
    // Adding the amount locked in the reward pool and the amount that is somehow in this contract
    // both are in the units of "underlying"
    // The second part is needed because there is the emergency exit mechanism
    // which would break the assumption that all the funds are always inside of the reward pool
    return rewardPool.balanceOf(address(this)).add(underlying.balanceOf(address(this)));
  }

  /*
  *   Governance or Controller can claim coins that are somehow transferred into the contract
  *   Note that they cannot come in take away coins that are used and defined in the strategy itself
  *   Those are protected by the "unsalvagableTokens". To check, see where those are being flagged.
  */
  function salvage(address recipient, address token, uint256 amount) external onlyControllerOrGovernance {
     // To make sure that governance cannot come in and take away the coins
    require(!unsalvagableTokens[token], "token is defined as not salvagable");
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
    rewardPool.getReward();
    _liquidateReward();
    investAllUnderlying();
  }

}
