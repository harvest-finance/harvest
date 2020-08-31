pragma solidity 0.5.16;

import "../Vault.sol";

contract VaultUSDT is Vault {
  constructor(address _controller,
      address _underlying,
      uint256 _toInvestNumerator,
      uint256 _toInvestDenominator
  ) Vault(
    _controller,
    _underlying,
    _toInvestNumerator,
    _toInvestDenominator
  ) public {
  }
}
