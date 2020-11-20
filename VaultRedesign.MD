# New Vault Design

The Harvest team performed a re-design of the vault and would like to 
call all security researchers and enthusiasts in the community to review
the code and provide their comments. The main intention of the update is
to prevent attacks that use the flashloan mechanism.

In the new design, the vault records its own virtual price per share whenever
`doHardWork()` is called by the Harvest team. As the calls to `doHardWork()`
are performed in trusted manner under regular market conditions, the
recorded virtual price represents the true value of the vault's shares at the
moment. The other share price that the vault has is the real-time price that is
dynamically calculated at the moment when it is queried by taking the sum of the
underlying assets in the strategy (which are invested) and the assets in the vault
(forming the withdrawal buffer) over the total number of vault's shares.

When the user deposited in the vault in the previous design, the number of shares
they received was calculated only based on the real-time share price. In the new
design, the number of shares to be given is calculated by taking the maximum of
the real-time share price and vault's virtual share price. Thus, if the user uses
a flash loan to reduce the real-time share price by affecting the strategies invested
assets, they will be issued based on the most recent virtual price recorded at the time
of the most recent `doHardWork()` call.

When the user withdraws from the vault, under the new design, the value of their
shares will be calculated using the minimum of the real-time price and the vault's
virtual price. Thus, if the user manipulates the market to benefit from a higher
value of the strategy investment, they will still receive underlying assets based
only on the virtual price recorded at the time of the most recent `doHardWork()` call.

Additionally, the strategy method `withdrawToVault(uint256 underlyingAmount)` no 
longer withdraws the target amount of underlying asset, regardless of the trading costs. 
Instead, its signature changes to
`withdrawToVault(uint256 underlyingAmount, uint256 correspondingShares, uint256 totalVaultShares)`
so that the strategy can calculate how much LP tokens (such as Curve's yCRV tokens) is
the user's shares being withdraws correspond to. The method will trade out exactly this
amount of LP tokens and send the outcome to the vault, without trading excess of the LP 
tokens attempting to obtain `underlyingAmount`. This should ensure that funds of other
users will not be subjected to a trade during a potential attack.

As a consequence of the virtual price calculation, if an honest user deposits funds into a vault,
they should wait for at least one `doHardWork()` call before withdrawing, otherwise 
they will notice a slight discrepancy between the deposited amount
and the amount withdrawn. This is because the deposit will be priced at the maximum of the
real-time price and the virtual price (likely with the real-time price being higher), while
the withdrawal will be priced at the minimum of the real-time price and the virtual price 
(likely with the virtual price being lower). With an APR of 20% in the strategy's DeFi protocol 
(i.e., discounting FARM rewards), the daily appreciation is approximately 0.055%. Hence, 
if `doHardWork()` calls happen at least once in 24 hours, the discrepancy will come to at most 
$550 on a $1,000,000 investment. Majority of underlying DeFi protocols offer lower APRs, so
the expected effect would be lower as well. If the withdrawal happens after a `doHardWork()`, 
there will be no discrepancy compared to the deposit caused by the existence of the virtual price. 

The migration of the vaults will not happen until community feedback for the new vault design 
is received. The contracts involved in the redesign are [Vault.sol](https://github.com/harvest-finance/harvest/blob/master/contracts/Vault.sol)
with a [reference strategy for renBTC/WBTC](https://github.com/harvest-finance/harvest/tree/master/contracts/strategiesV2/curve/CRVStrategyWRenBTCV2.sol).
Feedback can be by opening an issue in this repository, or via our community discord.
