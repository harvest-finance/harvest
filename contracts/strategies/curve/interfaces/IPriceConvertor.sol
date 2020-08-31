pragma solidity 0.5.16;

interface IPriceConvertor {
  function yCrvToUnderlying(uint256 _token_amount, uint256 i) external view returns (uint256);
}
