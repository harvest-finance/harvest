pragma solidity 0.5.16;

import "@openzeppelin/upgrades/contracts/Initializable.sol";

contract SplitterStorage is Initializable {

  bytes32 internal constant _UNDERLYING_SLOT = 0xa1709211eeccf8f4ad5b6700d52a1a9525b5f5ae1e9e5f9e5a0c2fc23c86e530;
  bytes32 internal constant _VAULT_SLOT = 0xefd7c7d9ef1040fc87e7ad11fe15f86e1d11e1df03c6d7c87f7e1f4041f08d41;

  bytes32 internal constant _FUTURE_STRATEGY_SLOT = 0xa992f9c5a58d888df3e7c199182032693913b52c0253580a6fbb9042148151ec;
  bytes32 internal constant _STRATEGY_WHITELIST_TIME_SLOT = 0xd53191f7d7b8481b9bfb8d5b9c3466c189e6acdd3591dbe60a3c18dca67c45bd;

  bytes32 internal constant _STRATEGY_WHITELIST_SLOT = 0xbac68261d0d521bb0267713c762e75eedccd1b29b465ed1eaf7e87743dcbd523;
  bytes32 internal constant _SPLITTER_CONFIG_SLOT = 0x35e95938653b4fc2abecd28b1d2b613364938e2fc654cceb3e454762dfe69c95;

  bytes32 internal constant _NEXT_IMPLEMENTATION_SLOT = 0x29f7fcd4fe2517c1963807a1ec27b0e45e67c60a874d5eeac7a0b1ab1bb84447;
  bytes32 internal constant _NEXT_IMPLEMENTATION_TIMESTAMP_SLOT = 0x414c5263b05428f1be1bfa98e25407cc78dd031d0d3cd2a2e3d63b488804f22e;
  bytes32 internal constant _NEXT_IMPLEMENTATION_DELAY_SLOT = 0x82b330ca72bcd6db11a26f10ce47ebcfe574a9c646bccbc6f1cd4478eae16b31;

  constructor() public {
    assert(_UNDERLYING_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.underlying")) - 1));
    assert(_VAULT_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.vault")) - 1));

    assert(_FUTURE_STRATEGY_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.futureStrategy")) - 1));
    assert(_STRATEGY_WHITELIST_TIME_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.strategyWhitelistTime")) - 1));
    assert(_STRATEGY_WHITELIST_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.strategyWhitelist")) - 1));
    assert(_SPLITTER_CONFIG_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.splitterConfig")) - 1));

    assert(_NEXT_IMPLEMENTATION_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.nextImplementation")) - 1));
    assert(_NEXT_IMPLEMENTATION_TIMESTAMP_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.nextImplementationTimestamp")) - 1));
    assert(_NEXT_IMPLEMENTATION_DELAY_SLOT == bytes32(uint256(keccak256("eip1967.strategyStorage.nextImplementationDelay")) - 1));
  }

  function initialize(
    address _underlying,
    address _vault,
    address _strategyWhitelist,
    address _splitterConfig,
    uint256 _implementationChangeDelay
  ) public initializer {
    _setUnderlying(_underlying);
    _setVault(_vault);
    _setStrategyWhitelist(_strategyWhitelist);
    _setSplitterConfig(_splitterConfig);
    _setNextImplementationDelay(_implementationChangeDelay);
  }

  function _setUnderlying(address _address) internal {
    setAddress(_UNDERLYING_SLOT, _address);
  }

  function underlying() public view returns (address) {
    return getAddress(_UNDERLYING_SLOT);
  }

  function _setFutureStrategy(address _address) internal {
    setAddress(_FUTURE_STRATEGY_SLOT, _address);
  }

  function futureStrategy() public view returns (address) {
    return getAddress(_FUTURE_STRATEGY_SLOT);
  }

  function _setSplitterConfig(address _address) internal {
    setAddress(_SPLITTER_CONFIG_SLOT, _address);
  }

  function splitterConfig() public view returns (address) {
    return getAddress(_SPLITTER_CONFIG_SLOT);
  }

  function _setStrategyWhitelist(address _address) internal {
    setAddress(_STRATEGY_WHITELIST_SLOT, _address);
  }

  function strategyWhitelist() public view returns (address) {
    return getAddress(_STRATEGY_WHITELIST_SLOT);
  }

  function _setVault(address _address) internal {
    setAddress(_VAULT_SLOT, _address);
  }

  function vault() public view returns (address) {
    return getAddress(_VAULT_SLOT);
  }

  function _setStrategyWhitelistTime(uint256 _strategyWhitelistTime) internal {
    setUint256(_STRATEGY_WHITELIST_TIME_SLOT, _strategyWhitelistTime);
  }

  function strategyWhitelistTime() public view returns (uint256) {
    return getUint256(_STRATEGY_WHITELIST_TIME_SLOT);
  }

  // upgradeability

  function _setNextImplementation(address _address) internal {
    setAddress(_NEXT_IMPLEMENTATION_SLOT, _address);
  }

  function nextImplementation() public view returns (address) {
    return getAddress(_NEXT_IMPLEMENTATION_SLOT);
  }

  function _setNextImplementationTimestamp(uint256 _value) internal {
    setUint256(_NEXT_IMPLEMENTATION_TIMESTAMP_SLOT, _value);
  }

  function nextImplementationTimestamp() public view returns (uint256) {
    return getUint256(_NEXT_IMPLEMENTATION_TIMESTAMP_SLOT);
  }

  function _setNextImplementationDelay(uint256 _value) internal {
    setUint256(_NEXT_IMPLEMENTATION_DELAY_SLOT, _value);
  }

  function nextImplementationDelay() public view returns (uint256) {
    return getUint256(_NEXT_IMPLEMENTATION_DELAY_SLOT);
  }

  function setBoolean(bytes32 slot, bool _value) internal {
    setUint256(slot, _value ? 1 : 0);
  }

  function getBoolean(bytes32 slot) internal view returns (bool) {
    return (getUint256(slot) == 1);
  }

  function setAddress(bytes32 slot, address _address) internal {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      sstore(slot, _address)
    }
  }

  function setUint256(bytes32 slot, uint256 _value) internal {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      sstore(slot, _value)
    }
  }

  function getAddress(bytes32 slot) internal view returns (address str) {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      str := sload(slot)
    }
  }

  function getUint256(bytes32 slot) internal view returns (uint256 str) {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      str := sload(slot)
    }
  }
}
