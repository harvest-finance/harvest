pragma solidity 0.5.16;

contract MockComptroller {
  constructor() public {
  }

  function enterMarkets(address[] memory ctokens) public returns(uint[] memory){
    return new uint[](1);
  }

  function markets(address ctoken) public view returns (bool, uint256) {
    // got from compound for cusdc
    return (true, 750000000000000000);
  }

  function compSpeeds(address ctoken) external view returns (uint256) {
    // got from compound for cusdc
    return 13416296358152430;
  }

  function claimComp(address recipient) external {}
}
