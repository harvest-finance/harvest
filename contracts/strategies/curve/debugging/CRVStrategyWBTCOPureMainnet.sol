pragma solidity 0.5.16;
import "./CRVStrategyWBTCPure.sol";

/**
* Adds the mainnet addresses to the CRVStrategyStable
*/
contract CRVStrategyWBTCOPureMainnet is CRVStrategyWBTCPure {

  // token addresses
  // y-addresses are taken from: https://docs.yearn.finance/yearn.finance/yearn-1
  address constant public dai = address(0x6B175474E89094C44Da98b954EedeAC495271d0F);
  address constant public usdc = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
  address constant public usdt = address(0xdAC17F958D2ee523a2206206994597C13D831ec7);
  address constant public wbtc = address(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599);
  address constant public wbtcMix = address(0x49849C98ae39Fff122806C06791Fa73784FB3675);
  address constant public crv = address(0xD533a949740bb3306d119CC777fa900bA034cd52);
  address constant public weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
  address constant public pool = address(0xB1F2cdeC61db658F091671F5f199635aEF202CAC);
  address constant public __mintr = address(0xd061D61a4d941c39E5453435B6345Dc261C2fcE0); // _mintr

  // protocols
  address constant public __curve = address(0x93054188d876f558f4a66B2EF1d97d16eDf0895B);

  address constant public _uniswap = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

  constructor(
  )
  CRVStrategyWBTCPure(
    address(0),
    wbtc,
    msg.sender,
    1, // token index
    wbtcMix,
    __curve, // curve protocol
    crv,
    weth,
    pool,
    __mintr,
    _uniswap // uniswap
  )
  public {
    wbtcPriceCheckpoint = wbtcValueFromMixToken(mixTokenUnit);
  }
}
