pragma solidity 0.5.16;

import "../AutoStake.sol";

contract ThirdPartyContractThatCallsAutoStake {

  address public autostake;

  constructor(address _autostake) public {
    autostake = _autostake;
  }

  function stake(address _token, uint256 _amount) public {
    IERC20(_token).approve(autostake, _amount);

    AutoStake(autostake).stake(_amount);
  }

  function exit() public {
    AutoStake(autostake).exit();
  }
}