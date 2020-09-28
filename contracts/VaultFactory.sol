pragma solidity 0.5.16;

import "./VaultProxy.sol";
import "./Vault.sol";

contract VaultFactory {

  event NewVault(address vault);

  constructor() public {}

  function createVault(
    address _implementation,
    address _storage,
    address _underlying,
    uint256 _toInvestNumerator,
    uint256 _toInvestDenominator
  ) public returns(address) {
    VaultProxy proxy = new VaultProxy(_implementation);
    Vault(address(proxy)).initializeVault(_storage,
      _underlying,
      _toInvestNumerator,
      _toInvestDenominator
    );
    emit NewVault(address(proxy));
    return address(proxy);
  }
}
