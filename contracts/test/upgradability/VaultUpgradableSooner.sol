pragma solidity 0.5.16;

import "../../Vault.sol";

contract VaultUpgradableSooner is Vault {

  constructor() Vault() public {}

  function overrideNextImplementationDelay(uint256 _nextImplementationDelay) public {
    _setNextImplementationDelay(_nextImplementationDelay);
  }
}
