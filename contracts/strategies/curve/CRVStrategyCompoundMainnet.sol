pragma solidity 0.5.16;

import "./CRVStrategyCompound.sol";


/**
* This strategy is for the 3CRV vault, i.e., the underlying token is 3CRV. It is not to accept
* stable coins. It will farm the CRV crop. For liquidation, it swaps CRV into DAI and uses DAI
* to produce 3CRV.
*/
contract CRVStrategyCompoundMainnet is CRVStrategyCompound {

  constructor(
    address _storage,
    address _vault
  ) CRVStrategyCompound(
    _storage,
    _vault,
    address(0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2), // Compound underlying
    address(0x7ca5b0a2910B33e9759DC7dDB0413949071D7575), // _gauge
    address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0), // _mintr
    address(0xD533a949740bb3306d119CC777fa900bA034cd52), // _crv
    address(0xA2B47E3D5c44877cca798226B7B8118F9BFb7A56), // _curve
    address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2), // _weth
    address(0x6B175474E89094C44Da98b954EedeAC495271d0F), // _dai
    address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D), // _uniswap
    address(0xeB21209ae4C2c9FF2a86ACA31E123764A3B6Bc06) // _curveCompoundDeposit
  ) public {
  }
}
