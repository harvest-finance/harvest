pragma solidity 0.5.16;
import "./PickleStrategy3Pool.sol";

/**
* Adds the mainnet addresses to the PickleStrategy3Pool
*/
contract PickleStrategy3PoolMainnet is PickleStrategy3Pool {

  // token addresses
  address constant public __underlying = address(0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490);
  address constant public __pickleJar = address(0x1BB74b5DdC1f4fC91D6f9E7906cf68bc93538e33);
  address constant public __pickleToken = address(0x429881672B9AE42b8EbA0E26cD9C73711b891Ca5);
  address constant public __masterChef = address(0xbD17B1ce622d73bD438b9E658acA5996dc394b0d);
  address constant public __weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
  address constant public __dai = address(0x6B175474E89094C44Da98b954EedeAC495271d0F);
  address constant public __curvePool = address(0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7);
  address constant public __uniswap = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
  uint256 constant public __poolId = 14;

  constructor(
    address _storage,
    address _vault
  )
  PickleStrategy3Pool(
    _storage,
    _vault,
    __underlying,
    __pickleJar,
    __pickleToken,
    __masterChef,
    __poolId,
    __weth,
    __dai,
    __curvePool,
    __uniswap
  )
  public {
  }
}
