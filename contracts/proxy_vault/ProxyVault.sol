pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";

import "../proxies/TimeLockedProxy.sol";
import "../proxies/GovernableProxy.sol";

import "./ProxyVaultStore.sol";

contract ProxyVault is TimeLockedProxy, ProxyVaultStore {
  constructor(
    address _target,
    bytes memory _data,
    address _storage,
    uint256 _timer,
    address _underlying,
    uint256 _toInvestNumerator,
    uint256 _toInvestDenominator
  )
  TimeLockedProxy(_target, _data, _storage, _timer)
  public {
    require(_toInvestNumerator <= _toInvestDenominator, "cannot invest more than 100%");
    require(_toInvestDenominator != 0, "cannot divide by 0");

    _setVaultFractionToInvestNumerator(_toInvestNumerator);
    _setVaultFractionToInvestDenominator(_toInvestDenominator);

    // ERC20Detailed name + symbol
    string memory _remote_symbol = ERC20Detailed(_underlying).symbol();
    require(bytes(_remote_symbol).length <= 20, "Symbol too long");
    _setName(abi.encodePacked("FARM_", _remote_symbol));
    _setSymbol(abi.encodePacked("f", _remote_symbol));

    uint8 decimals = ERC20Detailed(_underlying).decimals();
    uint256 underlyingUnit = 10 ** uint256(decimals);

    bytes32 _uslot = _UNDERLYING_SLOT;
    bytes32 _unitslot = _UNIT_SLOT;
    bytes32 _decimalsslot = _DECIMALS_SLOT;
    assembly {
        sstore(_uslot, _underlying)
        sstore(_unitslot, underlyingUnit)
        sstore(_decimalsslot, decimals)
    }
  }
}
