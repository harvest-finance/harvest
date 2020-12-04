pragma solidity 0.5.16;

contract SplitterConfig {

  address[] public activeStrategies;
  uint256[] public investmentRatioNumerators;

  address public splitter;

  constructor(
    address _splitter
  ) public {
    require(_splitter != address(0), "spliiter cannot be 0x0");
    splitter = _splitter;
  }

  modifier restricted() {
    require(msg.sender == splitter, "The sender has to be the splitter");
    _;
  }

  function activeStrategiesLength() public view returns (uint256) {
    return activeStrategies.length;
  }

  function pushState(
    address[] memory _activeStrategies,
    uint256[] memory _investmentRatioNumerators
  ) public restricted {
    activeStrategies.length = 0;
    investmentRatioNumerators.length = 0;
    for (uint256 i = 0; i < _activeStrategies.length; i++) {
      activeStrategies.push(_activeStrategies[i]);
      investmentRatioNumerators.push(_investmentRatioNumerators[i]);
    }
  }
}
