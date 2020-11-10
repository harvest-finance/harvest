pragma solidity 0.5.16;

import "./CRVStrategyTBTCMixed.sol";


/**
* This strategy is for the TBTC-mixed vault. It is not to accept
* stable coins. It will farm the CRV and KEEP crop. For liquidation, it swaps CRV and KEEP into WBTC and uses WBTC
* to produce the TBTC-mixed token.
*/
contract CRVStrategyTBTCMixedMainnet is CRVStrategyTBTCMixed {

  constructor(
    address _storage,
    address _vault
  ) CRVStrategyTBTCMixed(
    _storage,
    _vault,
    address(0x64eda51d3Ad40D56b9dFc5554E06F94e1Dd786Fd), // underlying
    address(0x6828bcF74279eE32f2723eC536c22c51Eed383C6), // _gauge
    address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0), // _mintr
    address(0xD533a949740bb3306d119CC777fa900bA034cd52), // _crv
    address(0xaa82ca713D94bBA7A89CEAB55314F9EfFEdDc78c), // _curve
    address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2), // _weth
    address(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599), // _wbtc
    address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D), // _uniswap
    address(0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC), // _keep
    address(0x6828bcF74279eE32f2723eC536c22c51Eed383C6)  // _keepRewards
  ) public {
  }
}
