interface IShortsFiShorting {
  function enter(uint256, uint256, uint256) external;
  function exit(uint256, uint256, bool) external;
  function exitAll(uint256) external;
  function estimateProfitDetailed(address _account) external view returns (uint256, uint256, uint256, uint256);
  function shareNum() external view returns(uint256);
  function shareDen() external view returns(uint256);
}

interface IShortsFiStaking {
  function balanceOf(address) external returns(uint256);
  function getReward() external;
}