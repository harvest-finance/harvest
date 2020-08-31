pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockGauge {

  IERC20 underlying;
  mapping(address => uint256) balances;

  constructor(address _underlying) public {
    underlying = IERC20(_underlying);
  }

  function balanceOf(address acct) public view returns (uint256) {
    return balances[acct];
  }

  function deposit(uint256 _amount) external {
    underlying.transferFrom(msg.sender, address(this), _amount);
    balances[msg.sender] += _amount;
  }

  function withdraw(uint256 _amount) external {
    underlying.transfer(msg.sender, _amount);
    balances[msg.sender] -= _amount;
  }
}
