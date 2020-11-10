# Coding Strategies

The Harvest team would like to engage community members in developing
strategies for the protocol. This document should serve as a guide
in such efforts. 

## Strategy Interface
A strategy is a smart contract that uses assets from the vault, invests
them into a third-party DeFi protocol to generate profit. The smart
contract needs to implement the following interface:

```
pragma solidity 0.5.16;

interface IStrategy {

    /**
    * The method should (1) invest all underlying tokens in the external DeFi protocol,
    * (2) claim all the profits (crops) from the external protocol and liquidate them,
    * and (3) reinvest the liquidated sum. The method should be callable only by the
    * vault.
    */
    function doHardWork() external;
    
    /**
    * Withdraws all funds from the strategy to the vault. The method should be callable
    * by the vault, strategy, and governance itself, but nobody else. The implementation
    * needs to ensure that the method does not revert when `investedUnderlyingBalance()`
    * is 0.
    */
    function withdrawAllToVault() external;

    /**
    * Withdraws a specific `amount` of funds (indicated in the underlying tokens, i.e., the
    * tokens of the vault) from the strategy to the vault. The method should be callable
    * by the vault, strategy, and governance itself, but nobody else.
    */
    function withdrawToVault(uint256 amount) external;

    /**
    * Returns the number of invested underlying tokens, plus the tokens that are
    * current present in this smart contract (if any). This number must be accurate
    * as it is used for calculating the value of shares of the vault.
    */
    function investedUnderlyingBalance() external view returns (uint256);

    /**
    * The function should protect the depositors and current vault shareholders
    * against deposits in abnormal market conditions in the DeFi protocol that
    * the strategy invests in, and potentially abnormal result of `investedUnderlyingBalance()`.
    * If this method returns `true`, deposits will be allowed. If it returns false,
    * any deposit attempt will fail a transaction.
    */
    function depositArbCheck() external view returns(bool);

    /**
    * A method that allows the governance to withdraw ERC20 tokens accidentally
    * stuck in this contract. The `token` parameter indicates the token to be
    * salvaged, the `amount` indicates how many tokens should be withdrawn, and
    * the `recipient` is the address to send these tokens to. Tokens that are
    * unsalvageable, as indicated by the method `unsalvagableTokens()` should
    * not be salvageable and any call to this method attempting to withdraw
    * such tokens should revert the transaction.
    */
    function salvage(address recipient, address token, uint256 amount) external;

    /**
    * Indicates whether the token can be withdrawn by the governance (`false`) or
    * not (`true`) via the `salvage()` method.
    */
    function unsalvagableTokens(address tokens) external view returns (bool);
    
    /**
    * Returns the address of the governance. Extend Controllable for this purpose.
    */
    function governance() external view returns (address);

    /**
    * Returns the address of the controller. Extend Controllable for this purpose.
    */
    function controller() external view returns (address);

    /**
    * Returns the address of the underlying token (the token from of the vault). 
    * The underlying token should be immutable and set in the cosntructor.
    */
    function underlying() external view returns (address);

    /**
    * Returns the address of the vault that this strategy is connected to. 
    * The vault token should be immutable and set in the cosntructor.
    */
    function vault() external view returns (address);
}
```

The interface has to be implemented completely, ensure that the methods implement the
required logic correctly, and the implementation has to use the indicated Solidity 0.5.16.
The implementation needs to be delivered with a functioning test (see the next section). 

## Liquidation of Crops

The crops are assets that the strategy earns by invested the underlying token to
external DeFi protocols. These assets need to be converted into the underlying
tokens so that they can be re-invested. This is what we call a liquidation. The
liquidation can happen on any decentralized exchange. However, the developers need to 
consider the liquidity of the exchange. There can be a substantial amount of crops
that the strategy needs to liquidated during a `doHardWork()` call, and poor liquidity
could negatively impact the profits of farmers. Furthermore, the inability of the 
strategy to liquidate crops must not affect withdrawals and deposits of the underlying assets.
The strategy also needs to ensure that liquidation will not fail if there is not enough
crops to be liquidated, i.e., when the amount of crops is too small to receive even
a single token of the underlying asset (think about attempt to conver 1 WEI into WBTC).
It is a good idea to equip your strategy with a flag using which the governance
can enable or disable liquidation (either because there is not enough crops to liquidate,
or if there is a failure in the liquidation path, caused for instance by the liquidity
disappearing).

The strategy has to transfer 30% of the crops (before or after liquidation) to the
[FeeRewardForwarder](https://github.com/harvest-finance/harvest/blob/master/contracts/FeeRewardForwarder.sol) contract ([0xEF08A639cAc2009fdAD3773CC9F56D6a8feB1153](https://etherscan.io/address/0xEF08A639cAc2009fdAD3773CC9F56D6a8feB1153)). This amount will be shared with other farmers. Extend
the [RewardTokenProfitNotifier](https://github.com/harvest-finance/harvest/blob/master/contracts/strategies/RewardTokenProfitNotifier.sol) contract for this purpose, and call the provided method.


## Testing

It is important that the strategies are tested. The tests need to prove the following
(at minimum):

- Deposits in the strategy are possible
- Calls to `doHardWork()` are possible
- Withdrawals from the strategy are possible
- After reasonably long time, the strategy generates profits for a farmer

The repository contains sample tests for the existing strategies, titled as 
`mainnet-fork-test-*.js`. These tests can be executed by running the following
ganache in one terminal

```
npx ganache-cli --fork https://mainnet.infura.io/v3/putyourtokenhere -u '0xf00dD244228F51547f0563e60bCa65a30FBF5f7f' -u '0x39415255619783a2e71fcf7d8f708a951d92e1b6' ...    
```

and then the test itself in another terminal

```
truffle build && export MAINNET_FORK=True && npx truffle test ./test/mainnet-fork-test-curve-dai.js
```

The flags for ganache will create a local fork of the chain at the current block via
the provided infura connction. The flags `-u` will allows the test to transact from an
externally owned account listed with the flag (and multiple such flags can be present).
This is especially useful for sourcing assets for a substantial deposit in the vault,
or for calling the `doHardWork()` on the strategy from the governance account (as the
access to the method should be restricted).

## Additional Consideration

In addition to the code itself, the developers need to be answer the following questions:

1. Impermanent Loss. Are the underlying assets combined with any other assets in the external
DeFi protocol, and can they suffer from impermanent loss when the other assets appreciates or
depreciates?
2. Deposit and Withdrawal Fees. Are there any withdrawal or deposit fees for the external DeFi
protocol? If so, how is your strategy handling them?
3. Liquidity and Caps. What is the deposit cap in the external DeFi protocol that the strategy
uses? Is there any cap on withdrawal? What is going to happen with the funds inside the
external DeFi protocol, and are we going to be always able to withdraw the entire amount?
If there any risks of liquidity shortage?
4. Crops and Liquidation. What are the crops that this strategy returns? How are they
liquidated? Can the liquidation suffer from lack of liquidity? Are there any circumstances 
when the liquidation would start failing?
5. Inflation and Deflation of Tokens. Are the crop or underlying assets deflationary or
inflationary? Can this affect the accounting of the strategy in any way?
6. Rug Pulls and Centralization of Power. What are the capabilities of the external DeFi
protocols that the strategy uses? Can the operators execute a rug pull on our funds?
Can the operators disable withdrawal? Do the operators allow deposits via smart contracts?
Is there any other capability that the funds of the vaults can be impacted by? Is there a deposit
lock?
7. Profit Calculation. What is the expected profit from the strategy? How can we calculate
its APY?

## What to Not Do

Do not implement any income streams for yourself in the strategies. Harvest Finance has
an operations budget that can be used to reward strategy developers. The developers of
strategies will be rewarded when their strategies are accepted. All the strategy
profits belong to the humble farmers of Harvest Finance. 

Do not submit strategies without tests or without answers to all the outlined questions.
If you run into troubles, reach out for help on our Discord!

Do not submit strategies for external projects that you do not fully understand. The primary
goal is to not put farmers' funds at risk. If uncertain, reach out for help on Discord!

## Reference Materials

For examples, refer to the [WETH Strategy for DEGO](https://github.com/harvest-finance/harvest/blob/master/contracts/strategies/SNXRewards/DEGOSimpleStrategy.sol)
and its [mainnet test](https://github.com/harvest-finance/harvest/blob/master/test/mainnet-fork-test-DEGO-weth.js).

