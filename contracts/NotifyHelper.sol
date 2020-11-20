pragma solidity 0.5.16;

import "./Controllable.sol";
import "./RewardPool.sol";

interface IFeeRewardForwarder {
  function poolNotifyFixedTarget(address _token, uint256 _amount) external;
}

contract NotifyHelper is Controllable {

  using SafeMath for uint256;

  address public feeRewardForwarder;
  address public farm;
  uint256 public profitShareIncentiveDaily;
  uint256 public lastProfitShareTimestamp;
  mapping (address => bool) public alreadyNotified;

  constructor(address _storage, address _feeRewardForwarder, address _farm)
  Controllable(_storage) public {
    feeRewardForwarder = _feeRewardForwarder;
    farm = _farm;
  }

  /**
  * Notifies all the pools, safe guarding the notification amount.
  */
  function notifyPools(uint256[] memory amounts,
    address[] memory pools,
    uint256 sum
  ) public onlyGovernance {
    require(amounts.length == pools.length, "Amounts and pools lengths mismatch");
    for (uint i = 0; i < pools.length; i++) {
      alreadyNotified[pools[i]] = false;
    }

    uint256 check = 0;
    for (uint i = 0; i < pools.length; i++) {
      require(amounts[i] > 0, "Notify zero");
      require(!alreadyNotified[pools[i]], "Duplicate pool");
      NoMintRewardPool pool = NoMintRewardPool(pools[i]);
      IERC20 token = IERC20(pool.rewardToken());
      token.transferFrom(msg.sender, pools[i], amounts[i]);
      NoMintRewardPool(pools[i]).notifyRewardAmount(amounts[i]);
      check = check.add(amounts[i]);
      alreadyNotified[pools[i]] = true;
    }
    require(sum == check, "Wrong check sum");
  }

  /**
  * Notifies all the pools, safe guarding the notification amount.
  */
  function notifyPoolsIncludingProfitShare(uint256[] memory amounts,
    address[] memory pools,
    uint256 profitShareIncentiveForWeek,
    uint256 firstProfitShareTimestamp,
    uint256 sum
  ) public onlyGovernance {
    require(amounts.length == pools.length, "Amounts and pools lengths mismatch");

    profitShareIncentiveDaily = profitShareIncentiveForWeek.div(7);
    IERC20(farm).transferFrom(msg.sender, address(this), profitShareIncentiveForWeek);
    lastProfitShareTimestamp = 0;
    notifyProfitSharing();
    lastProfitShareTimestamp = firstProfitShareTimestamp;

    notifyPools(amounts, pools, sum.sub(profitShareIncentiveForWeek));
  }

  function notifyProfitSharing() public {
    require(IERC20(farm).balanceOf(address(this)) >= profitShareIncentiveDaily, "Balance too low");
    require(!(lastProfitShareTimestamp.add(24 hours) > block.timestamp), "Called too early");
    lastProfitShareTimestamp = lastProfitShareTimestamp.add(24 hours);
    IERC20(farm).approve(feeRewardForwarder, profitShareIncentiveDaily);
    IFeeRewardForwarder(feeRewardForwarder).poolNotifyFixedTarget(farm, profitShareIncentiveDaily);
  }

  function setFeeRewardForwarder(address newForwarder) public onlyGovernance {
    feeRewardForwarder = newForwarder;
  }
}
