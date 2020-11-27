pragma solidity 0.5.16;
import "./IdleFinanceStrategy.sol";

/**
* Adds the mainnet addresses to the PickleStrategy3Pool
*/
contract IdleStrategyUSDTMainnet is IdleFinanceStrategy {

  // token addresses
  address constant public __weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
  address constant public __usdt = address(0xdAC17F958D2ee523a2206206994597C13D831ec7);
  address constant public __uniswap = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
  address constant public __idleUnderlying= address(0xF34842d05A1c888Ca02769A633DF37177415C2f8);
  address constant public __comp = address(0xc00e94Cb662C3520282E6f5717214004A7f26888);
  address constant public __idle = address(0x875773784Af8135eA0ef43b5a374AaD105c5D39e);

  constructor(
    address _storage,
    address _vault
  )
  IdleFinanceStrategy(
    _storage,
    __usdt,
    __idleUnderlying,
    _vault,
    __comp,
    __idle,
    __weth,
    __uniswap
  )
  public {
  }
}
