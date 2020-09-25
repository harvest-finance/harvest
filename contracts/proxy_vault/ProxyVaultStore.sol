pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * Controls access to ProxyVault's permanent (non-target-specific) storage.
 * Should be inherited by all `ProxyVaultTarget`s
 */

contract ProxyVaultStore {
  // ethers.utils.keccak256(Buffer.from('eip1967.proxy.name', 'utf8'))
  bytes32 internal constant _DECIMALS_SLOT = 0x4cd9b827ca535ceb0880425d70eff88561ecdf04dc32fcf7ff3b15c587f8a870;
  // ethers.utils.keccak256(Buffer.from('eip1967.proxy.decimals', 'utf8'))
  bytes32 internal constant _NAME_SLOT = 0x88b4d63b782204ccf3dd7bcc4a4de452aaf586955a8e0ad81b8b206bf832d289;
  // ethers.utils.keccak256(Buffer.from('eip1967.proxy.symbol', 'utf8'))
  bytes32 internal constant _SYMBOL_SLOT = 0x92467240a432dece8e7e71b8d315fc7762dc6a2d4ea5d477fbc7c8e89b385268;
  // ethers.utils.keccak256(Buffer.from('eip1967.proxy.underyling', 'utf8')) - 1
  bytes32 internal constant _UNDERLYING_SLOT = 0x6c01d774b62caafa2e056c68ebf9527bab4c723de84a856d419539d28f4af3ff;
  // ethers.utils.keccak256(Buffer.from('eip1967.proxy.numerator', 'utf8')) - 1
  bytes32 internal constant _NUMERATOR_SLOT = 0xd3705b91ebb21062c84bfbc3a236f931256c243e0a55f64286340bfb7c33e818;
  // ethers.utils.keccak256(Buffer.from('eip1967.proxy.denominator', 'utf8')) - 1
  bytes32 internal constant _DENOMINATOR_SLOT = 0xffe142493dd2ee5ec2f87e468ff69a84b98e49ffa771f9f75ff5f2c954e71e32;
  // ethers.utils.keccak256(Buffer.from('eip1967.proxy.underlying_unit', 'utf8')) - 1
  bytes32 internal constant _UNIT_SLOT = 0x15e6a6e0b13576af242d96655d17c1b022d9be440bf8f6982f0ea84acf0ca365;

  function _underlying() internal view returns (IERC20 ret) {
      bytes32 slot = _UNDERLYING_SLOT;
      // solhint-disable-next-line no-inline-assembly
      assembly {
          ret := sload(slot)
      }
  }
  function _vaultFractionToInvestNumerator() internal view returns (uint256 ret) {
      bytes32 slot = _NUMERATOR_SLOT;
      // solhint-disable-next-line no-inline-assembly
      assembly {
          ret := sload(slot)
      }
  }
  function _vaultFractionToInvestDenominator() internal view returns (uint256 ret) {
      bytes32 slot = _DENOMINATOR_SLOT;
      // solhint-disable-next-line no-inline-assembly
      assembly {
          ret := sload(slot)
      }
  }

  function _underlyingUnit() internal view returns (uint256 ret) {
      bytes32 slot = _UNIT_SLOT;
      // solhint-disable-next-line no-inline-assembly
      assembly {
          ret := sload(slot)
      }
  }

  function _decimals() internal view returns (uint8 ret) {
      bytes32 slot = _DECIMALS_SLOT;
      // solhint-disable-next-line no-inline-assembly
      assembly {
          ret := sload(slot)
      }
  }

  function _name() internal view returns (string memory ret) {
      bytes32 slot = _NAME_SLOT;
      // solhint-disable-next-line no-inline-assembly
      assembly {
          ret := mload(0x40)
          mstore(0x40, 0x20)  // 1 word only
          let word := sload(slot)
          let len := and(word, 0xff)
          mstore(ret, len)
          mstore(add(ret, 0x20), and(word, not(0xff)))
      }
  }

  function _symbol() internal view returns (string memory ret) {
      bytes32 slot = _UNIT_SLOT;
      // solhint-disable-next-line no-inline-assembly
      assembly {
          ret := mload(0x40)
          mstore(0x40, 0x20)  // 1 word only
          let word := sload(slot)
          let len := and(word, 0xff)  // get length
          mstore(ret, len)  // store length in memory
          mstore(add(ret, 0x20), and(word, not(0xff)))
      }
  }


  function _setName(bytes memory name) internal {
      bytes32 slot = _NAME_SLOT;
      uint256 len = name.length;
      // solhint-disable-next-line no-inline-assembly
      assembly {
          // last byte is length
          let name_body := mload(add(name, 0x20))
          name_body := or(len, and(name_body, not(0xff)))
          sstore(slot, name_body)
      }
  }

  function _setSymbol(bytes memory name) internal {
      bytes32 slot = _NAME_SLOT;
      uint256 len = name.length;
      // solhint-disable-next-line no-inline-assembly
      assembly {
          // last byte is length
          let name_body := mload(add(name, 0x20))
          name_body := or(len, and(name_body, not(0xff)))
          sstore(slot, name_body)
      }
  }

  function _setVaultFractionToInvestNumerator(uint256 num) internal {
      bytes32 _numslot = _NUMERATOR_SLOT;
      assembly {
        sstore(_numslot, num)
      }
  }

  function _setVaultFractionToInvestDenominator(uint256 denom) internal {
      bytes32 _denomslot = _DENOMINATOR_SLOT;
      assembly {
        sstore(_denomslot, denom)
      }
  }
}
