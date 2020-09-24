pragma solidity 0.5.16;

import "../Storage.sol";
import "./VendoredOZ.sol";

// based on
// https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/TransparentUpgradeableProxy.sol
contract GovernableProxy is UpgradeableProxy {

  bytes32 private constant _STORAGE_SLOT = 0x98a014adb3d21d2b11e570ae3fc91fc10180b682ca5ae9f0d7e5f36837d852cd;

  event StorageChanged(address previousAdmin, address newAdmin);

  constructor(address _logic, bytes memory _data, address _storage)
  UpgradeableProxy(_logic, _data)
  public
  {
    assert(_STORAGE_SLOT == bytes32(uint256(keccak256("eip1967.proxy.Bread for the People")) - 1));
    _setStorage(_storage);
  }

  function _isAdmin(address _someone) internal view returns (bool) {
    return _storage.isGovernance(_someone);
  }

  modifier ifAdmin() {
    if (_isAdmin(msg.sender)) {
      _;
    } else {
      _fallback();
    }
  }

  function changeStorage(address newStorage) external ifAdmin {
    require(newStorage != address(0), "TransparentUpgradeableProxy: new admin is the zero address");
    emit StorageChanged(_storage(), newStorage);
    _setStorage(newStorage);
  }

  function _storage() internal view returns (Storage sto) {
    bytes32 slot = _STORAGE_SLOT;
    // solhint-disable-next-line no-inline-assembly
    assembly {
      sto := sload(slot)
    }
  }

  function _governance() internal view returns (address) {
    return _storage.governance();
  }

  function _beforeFallback() internal {
    super._beforeFallback();
  }

  function _setStorage(address newStorage) private {
    bytes32 slot = _STORAGE_SLOT;

    // solhint-disable-next-line no-inline-assembly
    assembly {
      sstore(slot, newStorage)
    }
  }

}
