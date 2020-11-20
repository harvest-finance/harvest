pragma solidity 0.5.16;

import "./VaultV2.sol";

contract VaultUpgradableSooner is VaultV2 {

  constructor() VaultV2() public {}

  function overrideNextImplementationDelay(uint256 _nextImplementationDelay) public {
    _setNextImplementationDelay(_nextImplementationDelay);
  }
}
