pragma solidity 0.5.16;

import "./CRVStrategy3Pool.sol";


/**
* This strategy is for the 3CRV vault, i.e., the underlying token is 3CRV. It is not to accept
* stable coins. It will farm the CRV crop. For liquidation, it swaps CRV into DAI and uses DAI
* to produce 3CRV.
*/
contract CRVStrategy3PoolMainnet is CRVStrategy3Pool {

  constructor(
    address _storage,
    address _vault
  ) CRVStrategy3Pool(
    _storage,
    _vault,
    address(0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490), // 3CRV underlying
    address(0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A), // _gauge
    address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0), // _mintr
    address(0xD533a949740bb3306d119CC777fa900bA034cd52), // _crv
    address(0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7), // _curve
    address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2), // _weth
    address(0x6B175474E89094C44Da98b954EedeAC495271d0F), // _dai
    address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D) // _uniswap
  ) public {
  }
}
