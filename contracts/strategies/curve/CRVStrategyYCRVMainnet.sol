pragma solidity 0.5.16;

import "./CRVStrategyYCRV.sol";


/**
* This strategy is for the yCRV vault, i.e., the underlying token is yCRV. It is not to accept
* stable coins. It will farm the CRV crop. For liquidation, it swaps CRV into DAI and uses DAI
* to produce yCRV.
*/
contract CRVStrategyYCRVMainnet is CRVStrategyYCRV {

  constructor(
    address _storage,
    address _vault
  ) CRVStrategyYCRV(
    _storage,
    _vault,
    address(0xdF5e0e81Dff6FAF3A7e52BA697820c5e32D806A8), // yCRV underlying
    address(0xFA712EE4788C042e2B7BB55E6cb8ec569C4530c1), // _gauge
    address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0), // _mintr
    address(0xD533a949740bb3306d119CC777fa900bA034cd52), // _crv
    address(0x45F783CCE6B7FF23B2ab2D70e416cdb7D6055f51), // _curve
    address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2), // _weth
    address(0x6B175474E89094C44Da98b954EedeAC495271d0F), // _dai
    address(0x16de59092dAE5CcF4A1E6439D611fd0653f0Bd01), // _yDai
    address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D) // _uniswap
  ) public {
  }
}
