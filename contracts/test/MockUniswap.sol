pragma solidity 0.5.16;

contract MockUniswap {

  constructor() public {
  }

  function swapExactTokensForTokens(
    uint256 balance,
    uint256 amountOutMin,
    address[] calldata path,
    address recipient,
    uint256 expiry
  ) external returns (uint[] memory amounts) {}
}
