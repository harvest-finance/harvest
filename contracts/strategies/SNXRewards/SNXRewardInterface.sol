pragma solidity 0.5.16;

interface SNXRewardInterface {
    function withdraw(uint) external;
    function getReward() external;
    function stake(uint) external;
    function balanceOf(address) external view returns (uint);
    function earned(address account) external view returns (uint256);
    function exit() external;
}
