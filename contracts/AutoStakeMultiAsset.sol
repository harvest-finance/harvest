pragma solidity 0.5.16;

import "./AutoStake.sol";
import "./Controllable.sol";

contract AutoStakeMultiAsset is Controllable {

  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  NoMintRewardPool public rewardPool;
  AutoStake public farmAutoStake;

  IERC20 public lpToken;
  IERC20 public farm;
  uint256 public constant UNIT_FARM = 1e18;

  mapping(address => uint256) public balance;
  uint256 public totalBalanceLp = 0;
  uint256 public totalBalanceFarm = 0;
  uint256 public farmPerToken = UNIT_FARM;

  // 18 decimals as FARM
  mapping(address => uint256) public debtShare;
  // debt in FARM per debt share, 18 decimals precision
  uint256 public debtPerDebtShare;
  uint256 public totalDebtShares;

  address public greylistEscrow;
  mapping(address => bool) smartContractStakers;

  event Staked(address indexed user, uint256 amount, uint256 balanceOfLp, uint256 balanceOfFarm);
  event StakingDenied(address indexed user, uint256 amount);
  event Withdrawn(address indexed user, uint256 lp, uint256 farm);
  event SmartContractDenied(address indexed greylistedAddress);
  event ForceGreylistExited(address indexed grelisted, uint256 amount);

  event SmartContractRecorded(address indexed smartContractAddress, address indexed smartContractInitiator);
  event DecreaseInFarm();


  constructor(address _storage, address _pool, address _lpToken, address _greylistEscrow, address _autostake, address _farm) public
  Controllable(_storage)
  {
    rewardPool = NoMintRewardPool(_pool);
    farmAutoStake = AutoStake(_autostake);
    farm = IERC20(_farm);
    lpToken = IERC20(_lpToken);
    greylistEscrow = _greylistEscrow;
    debtPerDebtShare = UNIT_FARM;
    updateValuePerShare();
  }

  function setGreylistEscrow(address _greylistEscrow) external onlyGovernance {
    require(_greylistEscrow != address(0), "escrow cannot be empty address");
    greylistEscrow = _greylistEscrow;
  }

  function refreshAutoStake() external {
    exitRewardPool();
    updateValuePerShare();
    restakeIntoRewardPool();
  }

  function stake(uint256 amount) public {
    exitRewardPool();
    updateValuePerShare();

    if (tx.origin != msg.sender) {
      smartContractStakers[msg.sender] = true;
      emit SmartContractRecorded(msg.sender, tx.origin);
    }

    if (isGreylisted(msg.sender)) {
      emit StakingDenied(msg.sender, amount);
    } else {
      // record the balance
      uint256 totalBalanceLpOld = totalBalanceLp;
      lpToken.safeTransferFrom(msg.sender, address(this), amount);
      totalBalanceLp = totalBalanceLp.add(amount);
      balance[msg.sender] = balance[msg.sender].add(amount);

      // Record the debt in farm. The user should have matched their LP tokens with this
      // amount of FARM, but they did not. This amount will be subtracted upon their exit.
      if (totalBalanceLpOld > 0) {
        uint256 roundUp = debtPerDebtShare.div(2);
        uint256 debtSharesToIssue = (farmPerToken.mul(amount).add(roundUp)).div(debtPerDebtShare);
        debtShare[msg.sender] = debtShare[msg.sender].add(debtSharesToIssue);
        totalDebtShares = totalDebtShares.add(debtSharesToIssue);
      }

      // Rate needs to be updated here, otherwise the values would be incorrect.
      updateValuePerShare();

      (uint256 lpBalance, uint256 farmBalance) = balanceOfJoint(msg.sender);
      emit Staked(msg.sender, amount, lpBalance, farmBalance);
    }

    restakeIntoRewardPool();
  }

  function exit() public {
    exitRewardPool();
    updateValuePerShare();

    // If it is a normal user and not smart contract,
    // then the requirement will always pass
    // If it is a smart contract, then
    // make sure that it is not on our greyList.
    if (isGreylisted(msg.sender)) {
      // only Smart contracts can be denied
      emit SmartContractDenied(msg.sender);
    } else {
      // now we can transfer funds and burn shares
      settleAccount(msg.sender);
      // Rate needs to be updated here, otherwise the total values would be incorrect.
      updateValuePerShare();
    }

    restakeIntoRewardPool();
  }

  function forceGreyListedExit(address greyListed) external onlyGovernance {
    require(isGreylisted(greyListed), "can only force exit a greylisted.");
    exitRewardPool();
    updateValuePerShare();
    settleAccount(greyListed);
    updateValuePerShare();
    restakeIntoRewardPool();
  }

  function balanceOf(address who) public view returns (uint256) {
    return balance[who];
  }

  function balanceOfJoint(address who) public view returns (uint256, uint256) {
    uint256 farmBalance = farmPerToken.mul(balance[who]).div(UNIT_FARM);
    uint256 debt = debtPerDebtShare.mul(debtShare[who]).div(UNIT_FARM);
    if (farmBalance > debt) {
      farmBalance = farmBalance.sub(debt);
    } else {
      farmBalance = 0;
    }
    return (balanceOf(who), farmBalance);
  }

  /**
  * Assumes that all tokens are in the contract, and updates the value per share for both the LP
  * token and FARM.
  */
  function updateValuePerShare() internal {
    // LP token values
    if (totalBalanceLp == 0) {
      totalBalanceFarm = 0;
      farmPerToken = UNIT_FARM;
      debtPerDebtShare = UNIT_FARM;
    } else {
      totalBalanceFarm = farm.balanceOf(address(this));
      farmPerToken = (totalBalanceFarm
      .add(totalDebtShares.mul(debtPerDebtShare).div(UNIT_FARM)))
      .mul(UNIT_FARM)
      .div(totalBalanceLp);
      // debtPerDebtShare is updated with a pool exit, not here
    }
  }

  /**
  * Exits the reward pool of the vault.
  */
  function exitRewardPool() internal {
    if (farmAutoStake.balanceOf(address(this)) != 0) {
      // exit and do accounting first
      farmAutoStake.exit();
      // now we know how much FARM we made since last time
      uint256 newFarmBalance = farm.balanceOf(address(this));
      if (totalBalanceFarm == 0 || totalBalanceFarm == newFarmBalance) {
        // the contract never accrued farm, no increase in debt share is needed
        // or the newFarmBalance is exactly what we had before
      } else if (totalBalanceFarm > newFarmBalance) {
        // we LOST farm and the value of shares in FARM will decrease on update, no computation is needed
        // this should never happen, staking should not lose FARM
        emit DecreaseInFarm();
      } else {
        // the factor is some number >= 1
        uint256 factor = newFarmBalance.mul(UNIT_FARM).div(totalBalanceFarm);
        debtPerDebtShare = debtPerDebtShare.mul(factor).div(UNIT_FARM);
      }
    }

    // !!! IMPORTANT !!!
    // THE REWARD POOL MUST BE EXITED AFTER THE FARM POOL, BECAUSE IT SENDS FARM
    // ALONG. THE CALCULATION OF THE DEBT SHARE INCREASE WOULD FAIL IF IT DOES NOT
    // HAPPEN FIRST.
    if (rewardPool.balanceOf(address(this)) != 0) {
      // exit to do accounting first
      rewardPool.exit();
    }
  }

  /**
  * Restakes all the assets into the vault's rewards pool
  */
  function restakeIntoRewardPool() internal {
    if (lpToken.balanceOf(address(this)) != 0) {
      // stake back to the pool
      lpToken.safeApprove(address(rewardPool), 0);
      lpToken.safeApprove(address(rewardPool), lpToken.balanceOf(address(this)));
      rewardPool.stake(lpToken.balanceOf(address(this)));
    }
    if (farm.balanceOf(address(this)) != 0) {
      // stake back to the pool
      farm.safeApprove(address(farmAutoStake), 0);
      farm.safeApprove(address(farmAutoStake), farm.balanceOf(address(this)));
      farmAutoStake.stake(farm.balanceOf(address(this)));
    }
  }

  function settleAccount(address who) internal {
    (uint256 toTransferLp, uint256 toTransferFarm) = balanceOfJoint(who);
    totalBalanceLp = totalBalanceLp.sub(balance[who]);
    balance[who] = 0;
    totalDebtShares = totalDebtShares.sub(debtShare[who]);
    debtShare[who] = 0;
    lpToken.safeTransfer(who, toTransferLp);
    farm.safeTransfer(who, toTransferFarm);
    emit Withdrawn(msg.sender, toTransferLp, toTransferFarm);
  }

  function isGreylisted(address _target) internal view returns (bool) {
    return (smartContractStakers[_target] && IController(controller()).greyList(_target));
  }
}
