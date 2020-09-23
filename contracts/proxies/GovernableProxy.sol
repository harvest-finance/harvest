pragma solidity 0.5.16;


import "./VendoredOZ.sol";

// based on
// https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/proxy/TransparentUpgradeableProxy.sol
contract GovernableProxy is UpgradeableProxy {

    bytes32 private constant _ADMIN_SLOT = 0x98a014adb3d21d2b11e570ae3fc91fc10180b682ca5ae9f0d7e5f36837d852cd;
    bytes32 private constant _GOVERNANCE_SLOT = 0xe490bd502202d301ec2f5c6cf31aba1dccecc9bf9ff4d9dc3adf79ecd28da2f7;

    event AdminChanged(address previousAdmin, address newAdmin);

    constructor(address _logic, bytes memory _data, address _admin, address _governance)
    UpgradeableProxy(_logic, _data)
    public
    {
        assert(_ADMIN_SLOT == bytes32(uint256(keccak256("eip1967.proxy.Bread for the People")) - 1));
        assert(_GOVERNANCE_SLOT == bytes32(uint256(keccak256("eip1967.proxy.Panem et Circenses")) - 1));
        _setAdmin(_admin);
        _setGovernance(_governance);
    }

    function _isAdmin(address _someone) internal view returns (bool) {
        return _someone == _admin() || _someone == _governance();
    }

    modifier ifAdmin() {
        if (_isAdmin(msg.sender)) {
            _;
        } else {
            _fallback();
        }
    }

    function changeAdmin(address newAdmin) external ifAdmin {
        require(newAdmin != address(0), "TransparentUpgradeableProxy: new admin is the zero address");
        emit AdminChanged(_admin(), newAdmin);
        _setAdmin(newAdmin);
    }

    function controllers() external view returns (address, address) {
        return (_admin(), _governance());
    }

    function _admin() internal view returns (address adm) {
        bytes32 slot = _ADMIN_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            adm := sload(slot)
        }
    }

    function _governance() internal view returns (address gov) {
        bytes32 slot = _GOVERNANCE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            gov := sload(slot)
        }
    }

    function _beforeFallback() internal {
        require(!_isAdmin(msg.sender), "Admins can't play farming games");
        super._beforeFallback();
    }

    function _setAdmin(address newAdmin) private {
        bytes32 slot = _ADMIN_SLOT;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, newAdmin)
        }
    }

    function _setGovernance(address newGovernance) private {
        bytes32 slot = _GOVERNANCE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            sstore(slot, newGovernance)
        }
    }
}
