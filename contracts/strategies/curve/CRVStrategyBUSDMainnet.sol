pragma solidity 0.5.16;

import "./CRVStrategyBUSD.sol";


/**
* This strategy is for the crvBUSD vault, i.e., the underlying token is crvBUSD. It is not to accept
* stable coins. It will farm the CRV crop. For liquidation, it swaps CRV into DAI and uses DAI
* to produce crvBUSD.
*/
contract CRVStrategyBUSDMainnet is CRVStrategyBUSD {

  constructor(
    address _storage,
    address _vault
  ) CRVStrategyBUSD (
    _storage,
    _vault,
    address(0x3B3Ac5386837Dc563660FB6a0937DFAa5924333B), // crvBUSD underlying
    address(0x69Fb7c45726cfE2baDeE8317005d3F94bE838840), // _gauge
    address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0), // _mintr
    address(0xD533a949740bb3306d119CC777fa900bA034cd52), // _crv
    address(0x79a8C46DeA5aDa233ABaFFD40F3A0A2B1e5A4F27), // _curve
    address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2), // _weth
    address(0x6B175474E89094C44Da98b954EedeAC495271d0F), // _dai
    address(0xb6c057591E073249F2D9D88Ba59a46CFC9B59EdB), // depositBUSD
    address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D) // _uniswap
  ) public {
  }
}
