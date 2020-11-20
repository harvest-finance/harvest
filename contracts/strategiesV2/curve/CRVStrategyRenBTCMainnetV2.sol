pragma solidity 0.5.16;
import "./CRVStrategyWRenBTCV2.sol";

/**
* Adds the mainnet addresses to the CRVStrategyWBTC
*/
contract CRVStrategyWBTCMainnetV2 is CRVStrategyWRenBTCV2 {

  // token addresses
  address constant public __renbtc = address(0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D);
  address constant public __wbtcMix = address(0x49849C98ae39Fff122806C06791Fa73784FB3675);
  address constant public __crv = address(0xD533a949740bb3306d119CC777fa900bA034cd52);
  address constant public __weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
  address constant public __gauge = address(0xB1F2cdeC61db658F091671F5f199635aEF202CAC);
  address constant public __mintr = address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0); // _mintr

  // protocols
  address constant public __curve = address(0x93054188d876f558f4a66B2EF1d97d16eDf0895B);
  address constant public __uniswap = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

  uint256 constant public __tokenIndex = 0;

  constructor(
    address _storage,
    address _vault
  )
  CRVStrategyWRenBTCV2(
    _storage,
    __renbtc,
    _vault,
    __tokenIndex, // token index for renBTC
    __wbtcMix,
    __curve, // curve protocol's pool for renBTC
    __crv, // the CRV token address
    __weth,
    __gauge,
    __mintr,
    __uniswap // uniswap
  )
  public {
    wbtcPriceCheckpoint = wbtcValueFromMixToken(mixTokenUnit);
  }
}
