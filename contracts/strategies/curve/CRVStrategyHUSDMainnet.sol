pragma solidity 0.5.16;

import "./CRVStrategyHUSD.sol";


/**
* This strategy is for the crvHUSD vault, i.e., the underlying token is crvHUSD. It is not to accept
* stable coins. It will farm the CRV crop. For liquidation, it swaps CRV into DAI and uses DAI
* to produce crvHUSD.
*/
contract CRVStrategyHUSDMainnet is CRVStrategyHUSD {

  constructor(
    address _storage,
    address _vault
  ) CRVStrategyHUSD (
    _storage,
    _vault,
    address(0x5B5CFE992AdAC0C9D48E05854B2d91C73a003858), // crvHUSD underlying
    address(0x2db0E83599a91b508Ac268a6197b8B14F5e72840), // _gauge
    address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0), // _mintr
    address(0xD533a949740bb3306d119CC777fa900bA034cd52), // _crv
    address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2), // _weth
    address(0x6B175474E89094C44Da98b954EedeAC495271d0F), // _dai
    address(0x09672362833d8f703D5395ef3252D4Bfa51c15ca), // depositHUSD
    address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D) // _uniswap
  ) public {
  }
}
