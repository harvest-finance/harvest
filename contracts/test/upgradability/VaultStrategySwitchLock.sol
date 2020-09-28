pragma solidity 0.5.16;

import "../../Vault.sol";

contract VaultStrategySwitchLock is Vault {

  function setStrategy(address _strategy) public onlyControllerOrGovernance {
    revert("Strategy change not allowed");
  }
}
