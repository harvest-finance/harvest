pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";

contract MockRewardPool {

  using SafeMath for uint256;

  mapping(address => uint256) public balances;
  mapping(address => uint256) public rewards;
  address public token;
  address public rewardToken;

  constructor (address _token, address _rewardToken) public {
    token = _token;
    rewardToken = _rewardToken;
  }

  function stake(uint256 amount) public {
    IERC20(token).transferFrom(msg.sender, address(this), amount);
    balances[msg.sender] = balances[msg.sender].add(amount);
  }

  function exit() public {
    if (balances[msg.sender] > 0) {
      IERC20(token).transfer(msg.sender, balances[msg.sender]);
      balances[msg.sender] = 0;
    }
    if (rewards[msg.sender] > 0) {
      IERC20(rewardToken).transfer(msg.sender, rewards[msg.sender]);
      rewards[msg.sender] = 0;
    }
  }

  function reward(address account, uint256 amount) public {
    IERC20(rewardToken).transferFrom(msg.sender, address(this), amount);
    rewards[account] = rewards[account].add(amount);
  }

  function balanceOf(address account) public view returns (uint256) {
    return balances[account];
  }
}
