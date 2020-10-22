pragma solidity 0.5.16;

interface DEGORewardInterface {
    function withdraw(uint) external;
    function getReward() external;
    function stake(uint, string calldata) external;
    function balanceOf(address) external view returns (uint);
    function earned(address account) external view returns (uint256);
    function exit() external;
}
