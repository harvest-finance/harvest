pragma solidity 0.5.16;

interface IStrategy {
    // returns the proportion left after slippage, times 10**18
    function entranceAfterSlippage(uint256 toDeposit) external view returns (uint256 e18PostSlippagePercent);
    // returns the proportion left after slippage, times 10**18
    function exitAfterSlippage(uint256 toExit) external view returns (uint256 e18PostSlippagePercent);

    function unsalvagableTokens(address tokens) external view returns (bool);

    function governance() external view returns (address);
    function controller() external view returns (address);
    function underlying() external view returns (address);
    function vault() external view returns (address);

    function withdrawAllToVault() external;
    function withdrawToVault(uint256 amount) external;

    function investedUnderlyingBalance() external view returns (uint256); // itsNotMuch()

    // should only be called by controller
    function salvage(address recipient, address token, uint256 amount) external;

    function doHardWork() external;
    function depositArbCheck() external view returns(bool);
}
