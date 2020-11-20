pragma solidity 0.5.16;

import "./CompoundNoFoldStrategy.sol";

contract CompoundNoFoldStrategyUSDTMainnet is CompoundNoFoldStrategy {

  // token addresses
  address constant public __underlying = address(0xdAC17F958D2ee523a2206206994597C13D831ec7);
  address constant public __ctoken = address(0xf650C3d88D12dB855b8bf7D11Be6C55A4e07dCC9);
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
