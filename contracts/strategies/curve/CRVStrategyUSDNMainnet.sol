pragma solidity 0.5.16;

import "./CRVStrategyUSDN.sol";


/**
* This strategy is for the crvUSDN vault, i.e., the underlying token is crvUSDN. It is not to accept
* stable coins. It will farm the CRV crop. For liquidation, it swaps CRV into DAI and uses DAI
* to produce crvUSDN.
*/
contract CRVStrategyUSDNMainnet is CRVStrategyUSDN {

  constructor(
    address _storage,
    address _vault
  ) CRVStrategyUSDN (
    _storage,
    _vault,
    address(0x4f3E8F405CF5aFC05D68142F3783bDfE13811522), // crvUSDN underlying
    address(0xF98450B5602fa59CC66e1379DFfB6FDDc724CfC4), // _gauge
    address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0), // _mintr
    address(0xD533a949740bb3306d119CC777fa900bA034cd52), // _crv
    address(0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1), // _curve
    address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2), // _weth
    address(0x6B175474E89094C44Da98b954EedeAC495271d0F), // _dai
    address(0x094d12e5b541784701FD8d65F11fc0598FBC6332), // depositUSDN
    address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D) // _uniswap
  ) public {
  }
}
