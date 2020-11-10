pragma solidity 0.5.16;
import "./PickleStrategyDai.sol";

/**
* Adds the mainnet addresses to the PickleStrategy3Pool
*/
contract PickleStrategyDaiMainnet is PickleStrategyDai {

  // token addresses
  address constant public __pickleJar = address(0x6949Bb624E8e8A90F87cD2058139fcd77D2F3F87);
  address constant public __pickleToken = address(0x429881672B9AE42b8EbA0E26cD9C73711b891Ca5);
  address constant public __masterChef = address(0xbD17B1ce622d73bD438b9E658acA5996dc394b0d);
  address constant public __weth = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
  address constant public __dai = address(0x6B175474E89094C44Da98b954EedeAC495271d0F);
  address constant public __uniswap = address(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
  uint256 constant public __poolId = 16;

  constructor(
    address _storage,
    address _vault
  )
  PickleStrategyDai(
    _storage,
    _vault,
    __dai,
    __pickleJar,
    __pickleToken,
    __masterChef,
    __poolId,
    __weth,
    __uniswap
  )
  public {
  }
}
