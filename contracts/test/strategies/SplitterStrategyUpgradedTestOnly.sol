pragma solidity 0.5.16;

import "../../strategiesV2/splitter/SplitterStrategy.sol";


contract SplitterStrategyUpgradedTestOnly is SplitterStrategy {
  /* The order of variables is intentionally messed up here
  * in order to test upgradability
  */
  uint256 randomInt1;
  uint256[] public investmentRatioNumerators;
  uint256 randomInt2;
  address[] public activeStrategies;
  uint256 randomInt3;

  constructor() public SplitterStrategy() {
    randomInt1 = uint256(-1) - 555;
    randomInt2 = uint256(-1) - 44444;
    randomInt3 = uint256(-1) - 111111;
  }

  function unsalvagableTokens(address token) public view returns (bool) {
    require(randomInt1 > 0);
    require(randomInt2 > 0);
    require(randomInt3 > 0);
    return token == underlying();
  }
}
