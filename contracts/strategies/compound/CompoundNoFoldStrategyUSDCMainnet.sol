pragma solidity 0.5.16;

import "./CompoundNoFoldStrategy.sol";

contract CompoundNoFoldStrategyUSDCMainnet is CompoundNoFoldStrategy {

  // token addresses
  address constant public __underlying = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
  address constant public __ctoken = address(0x39AA39c021dfbaE8faC545936693aC917d5E7563);
  address constant public __comptroller = address(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
  address constant public __comp = address(0xc00e94Cb662C3520282E6f5717214004A7f26888);
  address constant public __uniswap = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

  constructor(
    address _storage,
    address _vault
  )
  CompoundNoFoldStrategy(
    _storage,
    __underlying,
    __ctoken,
    _vault,
    __comptroller,
    __comp,
    __uniswap
  )
  public {
  }

}
