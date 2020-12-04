pragma solidity 0.5.16;

contract SplitterStrategyWhitelist {
  mapping(address => bool) public isStrategyWhitelisted;
  address[] public whitelistedStrategies;
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

  function whitelistedStrategyCount() public view returns (uint256) {
    return whitelistedStrategies.length;
  }

  function whitelist(address _strategy) public restricted {
    require(_strategy != address(0), "_strategy cannot be 0x0");
    whitelistedStrategies.push(_strategy);
    isStrategyWhitelisted[_strategy] = true;
  }

  function unwhitelist(address _strategy) public restricted {
    require(_strategy != address(0), "_strategy cannot be 0x0");
    isStrategyWhitelisted[_strategy] = false;
    for (uint256 i = 0; i < whitelistedStrategies.length; i++) {
      if (whitelistedStrategies[i] == _strategy) {
        if (i < whitelistedStrategies.length - 1) {
          whitelistedStrategies[i] = whitelistedStrategies[whitelistedStrategies.length - 1];
        }
        whitelistedStrategies.length--;
        return;
      }
    }
  }
}
