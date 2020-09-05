pragma solidity 0.5.16;
import "./CRVStrategySwerve.sol";
import "./PriceConvertor.sol";

/**
* Adds the mainnet addresses to the CRVStrategyWBTC
*/
contract CRVStrategySwerveUSDCMainnet is CRVStrategySwerve {

  // token addresses
  // using USDC here
  address constant public __usdc = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
  // mixed token (swerve combo Swerve.fi DAI/USDC/USDT/TUSD (swUSD))
  address constant public __stableMix = address(0x77C6E4a580c0dCE4E5c7a17d0bc077188a83A059);
  // the dao reward token for swerve
  address constant public __swrv = address(0xB8BAa0e4287890a5F79863aB62b7F175ceCbD433);
  address constant public __weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
  // swerve gauge
  address constant public __gauge = address(0xb4d0C929cD3A1FbDc6d57E7D3315cF0C4d6B4bFa);
  // swerve minter
  address constant public __mintr = address(0x2c988c3974AD7E604E276AE0294a7228DEf67974); // _mintr

  // protocols
  // delegate to zap
  address constant public __poolZap = address(0xa746c67eB7915Fa832a4C2076D403D4B68085431);
  address constant public __uniswap = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

  uint256 constant public __tokenIndex = 1;

  constructor(
    address _storage,
    address _vault
  )
  CRVStrategySwerve(
    _storage,
    __usdc,
    _vault,
    __tokenIndex, // token index for USDC
    __stableMix,
    __poolZap, // curve protocol's pool for WBTC
    __swrv, // the reward DAO token address
    __weth,
    __gauge,
    __mintr,
    __uniswap // uniswap
  )
  public {
    wbtcPriceCheckpoint = wbtcValueFromMixToken(mixTokenUnit);
  }
}
