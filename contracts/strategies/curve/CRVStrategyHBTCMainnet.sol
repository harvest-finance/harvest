pragma solidity 0.5.16;

import "./CRVStrategyHBTC.sol";


/**
* This strategy is for the TBTC-mixed vault. It is not to accept
* stable coins. It will farm the CRV crop. For liquidation, it swaps CRV into WBTC and uses WBTC
* to produce the HBTC-mixed token.
*/
contract CRVStrategyHBTCMainnet is CRVStrategyHBTC {

  constructor(
    address _storage,
    address _vault
  ) CRVStrategyHBTC(
    _storage,
    _vault,
    address(0xb19059ebb43466C323583928285a49f558E572Fd), // underlying
    address(0x4c18E409Dc8619bFb6a1cB56D114C3f592E0aE79), // _gauge
    address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0), // _mintr
    address(0xD533a949740bb3306d119CC777fa900bA034cd52), // _crv
    address(0x4CA9b3063Ec5866A4B82E437059D2C43d1be596F), // _curve
    address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2), // _weth
    address(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599), // _wbtc
    address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D)  // _uniswap
  ) public {
  }
}
