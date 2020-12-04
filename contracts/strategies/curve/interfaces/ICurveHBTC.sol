pragma solidity 0.5.16;

interface ICurveHBTC {
    function add_liquidity(
        uint256[2] calldata amounts,
        uint256 min_mint_amount
    ) external;
}
