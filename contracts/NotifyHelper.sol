pragma solidity 0.5.16;

import "./Controllable.sol";
import "./RewardPool.sol";

contract NotifyHelper is Controllable {

  constructor(address _storage)
  Controllable(_storage) public {}

  /**
  * Notifies all the pools, safe guarding the notification amount.
  */
  function notifyPools(uint256[] memory amounts, address[] memory pools) public onlyGovernance {
    require(amounts.length == pools.length, "Amounts and pools lengths mismatch");
    for (uint i = 0; i < pools.length; i++) {
      require(amounts[i] > 0, "Notify zero");
      NoMintRewardPool pool = NoMintRewardPool(pools[i]);
      IERC20 token = IERC20(pool.rewardToken());
      uint256 limit = token.balanceOf(pools[i]);
      require(amounts[i] <= limit, "Notify limit hit");
      NoMintRewardPool(pools[i]).notifyRewardAmount(amounts[i]);
    }
  }
}
