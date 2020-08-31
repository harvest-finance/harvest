pragma solidity 0.5.16;

import "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";

contract NoopYVault is ERC20, ERC20Detailed, ERC20Mintable, ERC20Burnable {

  IERC20 underlying;

  constructor(address _underlying, uint8 decim) public ERC20Detailed("Mock Token", "MOCK", decim) {
    underlying = IERC20(_underlying);
  }

  function deposit(uint256 _amount) external {
    underlying.transferFrom(msg.sender, address(this), _amount);
    _mint(msg.sender, _amount);
  }

  event GG(string s, uint256 v);

  function withdraw(uint256 _amount) external {
    emit GG("withdrawing", _amount);
    burn(_amount);
    underlying.transfer(msg.sender, _amount);
  }

  function getPricePerFullShare() public view returns(uint256) {
    return 1000000000000000000;
  }
}
