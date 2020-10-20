# Harvest Finance

The history of agriculture has been marked by technological advancements that allowed human populations to scale by maximizing the available yield through better tools and crop selection. We evolved from using primitive tools like the yoke to advanced machines like the tractor, which allowed humans to maximize yield and scale our population to billions. :ear_of_rice:

With that, we present Harvest :tractor:, a tool that helps farmers of all shapes and sizes get automatic exposure to the highest yield available across select decentralized finance protocols.

Bread for the people!

Website: [https://harvest.finance/](https://harvest.finance/)

Twitter: [https://twitter.com/harvest_finance](https://twitter.com/harvest_finance)

Medium: [https://medium.com/harvest-finance](https://medium.com/harvest-finance)

Discord: [https://discord.gg/R5SeTVR](https://discord.gg/R5SeTVR)

Community Wiki: [https://farm.chainwiki.dev/en/home](https://farm.chainwiki.dev/en/home)

策略: [https://farm.chainwiki.dev/zh/策略](https://farm.chainwiki.dev/zh/%E7%AD%96%E7%95%A5)

## Audits

**Haechi:** We acquired an [audit from Haechi](https://github.com/harvest-finance/harvest/blob/master/audits/Haechi-Harvest.pdf) which should assure our farmers that their crops are safe and bread for the people will be produced, no matter what the future brings. The audit highlighted one issue classified as major (initially pointed out by the community, thus it is already fixed), and 5 additional minor issues, 4 of which are in fact decentralization features and design choices that we actively made for our platform. The one remaining minor issue was fixed as well. We would like to thank Haechi for their hard work on this audit and keeping our farmers safe.

**PeckShield:** We acquired an [audit from PeckShield](https://github.com/harvest-finance/harvest/blob/master/audits/PeckShield-Harvest.pdf) which should assure our farmers that their crops are safe and bread for the people will be produced, no matter what the future brings. The main issue pointed out by PeckShield is the privileged role of our 0xf00d deployer address. Based on the discussion with our community, we have implemented timelock mechanisms that provide the farmers with an opportunity to leave the farm if they disagree with the deployer's actions before these actions are executed. An additional issue related to CRVStrategyStable's depositArbCheck() was pointed out by our wonderful community and was already fixed before the report by PeckShield was completed. Other non-informational issues do not affect the system, or are explicit design choices and decentralization features made by our team. We would like to thank PeckShield for their hard work on this audit and keeping our farmers safe.

## Addresses

We recommend interacting with Harvest via interfaces provided by our website. Direct interaction 
with the smart contracts should be avoided by farmers who are not experienced in using heavy machinery!

FARM token: <br />
[0xa0246c9032bC3A600820415aE600c6388619A14D](https://etherscan.io/address/0xa0246c9032bC3A600820415aE600c6388619A14D)

### Vaults:

| Vault    |      Lock Token      |  You Receive Instead | Vault Contract Address |
|-----------|:----------------------|:--------------|:--------------:|
| WETH | WETH | fWETH | [0xFE09e53A81Fe2808bc493ea64319109B5bAa573e](https://etherscan.io/address/0xFE09e53A81Fe2808bc493ea64319109B5bAa573e) |
| DAI Vault | DAI | fDAI | [0xab7fa2b2985bccfc13c6d86b1d5a17486ab1e04c](https://etherscan.io/address/0xab7fa2b2985bccfc13c6d86b1d5a17486ab1e04c) |
| USDC Vault | USDC | fUSDC| [0xf0358e8c3CD5Fa238a29301d0bEa3D63A17bEdBE](https://etherscan.io/address/0xf0358e8c3CD5Fa238a29301d0bEa3D63A17bEdBE) |
| USDT Vault | USDT | fUSDT | [0x053c80eA73Dc6941F518a68E2FC52Ac45BDE7c9C](https://etherscan.io/address/0x053c80eA73Dc6941F518a68E2FC52Ac45BDE7c9C) |
| TUSD Vault | TUSD | fTUSD | [0x7674622c63Bee7F46E86a4A5A18976693D54441b](https://etherscan.io/address/0x7674622c63bee7f46e86a4a5a18976693d54441b) |
| WBTC Vault | WBTC | fWBTC | [0x5d9d25c7C457dD82fc8668FFC6B9746b674d4EcB](https://etherscan.io/address/0x5d9d25c7C457dD82fc8668FFC6B9746b674d4EcB) |
| RENBTC Vault | RENBTC | fRENBTC | [0xC391d1b08c1403313B0c28D47202DFDA015633C4](https://etherscan.io/address/0xC391d1b08c1403313B0c28D47202DFDA015633C4) |
| CRVRENBTC Vault | CRVRENBTC | fCRVRENBTC | [0x9aA8F427A17d6B0d91B6262989EdC7D45d6aEdf8](https://etherscan.io/address/0x9aA8F427A17d6B0d91B6262989EdC7D45d6aEdf8) |
| WETH-DAI-LP Vault | UNI-V2 | fUNI-V2 | [0x307E2752e8b8a9C29005001Be66B1c012CA9CDB7](https://etherscan.io/address/0x307E2752e8b8a9C29005001Be66B1c012CA9CDB7) |
| WETH-USDC-LP Vault | UNI-V2 | fUNI-V2 | [0xA79a083FDD87F73c2f983c5551EC974685D6bb36](https://etherscan.io/address/0xA79a083FDD87F73c2f983c5551EC974685D6bb36) |
| WETH-USDT-LP Vault | UNI-V2 | fUNI-V2 | [0x7DDc3ffF0612E75Ea5ddC0d6Bd4e268f70362Cff](https://etherscan.io/address/0x7DDc3ffF0612E75Ea5ddC0d6Bd4e268f70362Cff) |
| WETH-WBTC-LP Vault | UNI-V2 | fUNI-V2 | [0x01112a60f427205dcA6E229425306923c3Cc2073](https://etherscan.io/address/0x01112a60f427205dcA6E229425306923c3Cc2073) |
| WBTC-TBTC Vault | SLP | fSLP | [0xF553E1f826f42716cDFe02bde5ee76b2a52fc7EB](https://etherscan.io/address/0xF553E1f826f42716cDFe02bde5ee76b2a52fc7EB) |

### Staking Contracts:

| Pool    |      Stake Token      |  Reward Token | Reward Pool Contract Link |
|-----------|:----------------------|--------------:|:----------------:|
| Profit Sharing | FARM | FARM | [0x25550Cccbd68533Fa04bFD3e3AC4D09f9e00Fc50](https://etherscan.io/address/0x25550Cccbd68533Fa04bFD3e3AC4D09f9e00Fc50) |
| WETH Pool | fWETH | FARM | [0x3DA9D911301f8144bdF5c3c67886e5373DCdff8e](https://etherscan.io/address/0x3DA9D911301f8144bdF5c3c67886e5373DCdff8e) |
| DAI Pool  | fDAI | FARM | [0x15d3A64B2d5ab9E152F16593Cdebc4bB165B5B4A](https://etherscan.io/address/0x15d3A64B2d5ab9E152F16593Cdebc4bB165B5B4A) |
| USDC Pool | fUSDC | FARM | [0x4F7c28cCb0F1Dbd1388209C67eEc234273C878Bd](https://etherscan.io/address/0x4F7c28cCb0F1Dbd1388209C67eEc234273C878Bd) |
| USDT Pool | fUSDT | FARM | [0x6ac4a7ab91e6fd098e13b7d347c6d4d1494994a2](https://etherscan.io/address/0x6ac4a7ab91e6fd098e13b7d347c6d4d1494994a2) |
| TUSD Pool | fTUSD | FARM | [0xeC56a21CF0D7FeB93C25587C12bFfe094aa0eCdA](https://etherscan.io/address/0xeC56a21CF0D7FeB93C25587C12bFfe094aa0eCdA) |
| WBTC Pool | fWBTC | FARM | [0x917d6480Ec60cBddd6CbD0C8EA317Bcc709EA77B](https://etherscan.io/address/0x917d6480Ec60cBddd6CbD0C8EA317Bcc709EA77B) |
| RENBTC Pool | fRENBTC | FARM | [0x7b8Ff8884590f44e10Ea8105730fe637Ce0cb4F6](https://etherscan.io/address/0x7b8Ff8884590f44e10Ea8105730fe637Ce0cb4F6) |
| CRVRENWBTC Pool | fCRVRENWBTC | FARM | [0xA3Cf8D1CEe996253FAD1F8e3d68BDCba7B3A3Db5](https://etherscan.io/address/0xA3Cf8D1CEe996253FAD1F8e3d68BDCba7B3A3Db5) |
| WBTC-TBTC Vault | fSLP | FARM | [0x9523FdC055F503F73FF40D7F66850F409D80EF34](https://etherscan.io/address/0x9523FdC055F503F73FF40D7F66850F409D80EF34) |
| WETH-DAI-LP Vault | fUNI-V2 | FARM | [0x7aeb36e22e60397098C2a5C51f0A5fB06e7b859c](https://etherscan.io/address/0x7aeb36e22e60397098C2a5C51f0A5fB06e7b859c) |
| WETH-USDC-LP Vault | fUNI-V2 | FARM | [0x156733b89Ac5C704F3217FEe2949A9D4A73764b5](https://etherscan.io/address/0x156733b89Ac5C704F3217FEe2949A9D4A73764b5) |
| WETH-USDT-LP Vault | fUNI-V2 | FARM | [0x75071F2653fBC902EBaff908d4c68712a5d1C960](https://etherscan.io/address/0x75071F2653fBC902EBaff908d4c68712a5d1C960) |
| WETH-WBTC-LP Vault | fUNI-V2 | FARM | [0xF1181A71CC331958AE2cA2aAD0784Acfc436CB93](https://etherscan.io/address/0xF1181A71CC331958AE2cA2aAD0784Acfc436CB93) |


| LP Token Pool    |      Stake Token      |  Reward Token | Reward Pool Contract Link |
|-----------|:----------------------|--------------:|:----------------:|
| FARM - USDC Uniswap | [FARM/USDC UNI-v2](https://uniswap.info/pair/0x514906fc121c7878424a5c928cad1852cc545892) | FARM | [0x99b0d6641A63Ce173E6EB063b3d3AED9A35Cf9bf](https://etherscan.io/address/0x99b0d6641A63Ce173E6EB063b3d3AED9A35Cf9bf) |



### Expiring pools from previous weeks

These are old vaults that no longer hold funds.
| Vault    |      Lock Token      |  You Receive Instead | Vault Contract Address |
|-----------|:----------------------|:--------------|:--------------:|
| WETH | WETH | fWETH | [0x8e298734681adbfc41ee5d17ff8b0d6d803e7098](https://etherscan.io/address/0x8e298734681adbfc41ee5d17ff8b0d6d803e7098) |
| DAI Vault | DAI | fDAI | [0xe85C8581e60D7Cd32Bbfd86303d2A4FA6a951Dac](https://etherscan.io/address/0xe85C8581e60D7Cd32Bbfd86303d2A4FA6a951Dac) |
| USDC Vault | USDC | fUSDC| [0xc3F7ffb5d5869B3ade9448D094d81B0521e8326f](https://etherscan.io/address/0xc3F7ffb5d5869B3ade9448D094d81B0521e8326f) |
| USDT Vault | USDT | fUSDT | [0xc7EE21406BB581e741FBb8B21f213188433D9f2F](https://etherscan.io/address/0xc7EE21406BB581e741FBb8B21f213188433D9f2F) |
| WBTC Vault | WBTC | fWBTC | [0xc07eb91961662d275e2d285bdc21885a4db136b0](https://etherscan.io/address/0xc07eb91961662d275e2d285bdc21885a4db136b0) |
| RENBTC Vault | RENBTC | fRENBTC | [0xfbe122d0ba3c75e1f7c80bd27613c9f35b81feec](https://etherscan.io/address/0xfbe122d0ba3c75e1f7c80bd27613c9f35b81feec) |
| CRVRENBTC Vault | CRVRENBTC | fCRVRENBTC | [0x192e9d29d43db385063799bc239e772c3b6888f3](https://etherscan.io/address/0x192e9d29d43db385063799bc239e772c3b6888f3) |
| WETH-DAI-LP Vault | UNI-V2 | fUNI-V2 | [0x1a9F22b4C385f78650E7874d64e442839Dc32327](https://etherscan.io/address/0x1a9F22b4C385f78650E7874d64e442839Dc32327)|
| WETH-USDC-LP Vault | UNI-V2 | fUNI-V2 | [0x63671425ef4D25Ec2b12C7d05DE855C143f16e3B](https://etherscan.io/address/0x63671425ef4D25Ec2b12C7d05DE855C143f16e3B) |
| WETH-USDT-LP Vault | UNI-V2 | fUNI-V2 | [0xB19EbFB37A936cCe783142955D39Ca70Aa29D43c](https://etherscan.io/address/0xB19EbFB37A936cCe783142955D39Ca70Aa29D43c)|
| WETH-WBTC-LP Vault | UNI-V2 | fUNI-V2 | [0xb1FeB6ab4EF7d0f41363Da33868e85EB0f3A57EE](https://etherscan.io/address/0xb1FeB6ab4EF7d0f41363Da33868e85EB0f3A57EE)|

These pools will not receive any new rewards.

| LP Token Pool    |      Stake Token      |  Reward Token | Reward Pool Contract Link |
|-----------|:----------------------|--------------:|:----------------:|
| Profit Sharing | FARM | FARM | [0x25550Cccbd68533Fa04bFD3e3AC4D09f9e00Fc50](https://etherscan.io/address/0x25550Cccbd68533Fa04bFD3e3AC4D09f9e00Fc50#code) |
| DAI Pool  | fDAI | FARM | [0xF9E5f9024c2f3f2908A1d0e7272861a767C9484b](https://etherscan.io/address/0xF9E5f9024c2f3f2908A1d0e7272861a767C9484b) |
| USDC Pool | fUSDC | FARM | [0xE1f9A3EE001a2EcC906E8de637DBf20BB2d44633](https://etherscan.io/address/0xE1f9A3EE001a2EcC906E8de637DBf20BB2d44633) |
| USDT Pool | fUSDT | FARM | [0x5bd997039FFF16F653EF15D1428F2C791519f58d](https://etherscan.io/address/0x5bd997039FFF16F653EF15D1428F2C791519f58d) |
| WBTC Pool | fWBTC | FARM | [0x6291eCe696CB6682a9bb1d42fca4160771b1D7CC](https://etherscan.io/address/0x6291eCe696CB6682a9bb1d42fca4160771b1D7CC) |
| RENBTC Pool | fRENBTC | FARM | [0xCFE1103863F9e7Cf3452Ca8932Eef44d314bf9C5](https://etherscan.io/address/0xCFE1103863F9e7Cf3452Ca8932Eef44d314bf9C5) |
| CRVRENWBTC Pool | fCRVRENWBTC | FARM | [0x5365A2C47b90EE8C9317faC20edC3ce7037384FB](https://etherscan.io/address/0x5365A2C47b90EE8C9317faC20edC3ce7037384FB) |
| FARM - USDC 20/80 Balancer | [FARM/USDC BPT](https://pools.balancer.exchange/#/pool/0x0126cfa7ec6b6d4a960b5979943c06a9742af55e/) | FARM | [0x346523a81f16030110e6C858Ee0E11F156840BD1](https://etherscan.io/address/0x346523a81f16030110e6C858Ee0E11F156840BD1) |
| fDAI Uniswap | [DAI/fDAI UNI-v2](https://uniswap.info/pair/0x007E383BF3c3Ffa12A5De06a53BAb103335eFF28) | FARM | [0xB492fAEdA6c9FFb9B9854a58F28d5333Ff7a11bc](https://etherscan.io/address/0xB492fAEdA6c9FFb9B9854a58F28d5333Ff7a11bc) |
| fUSDC Uniswap | [USDC/fUSDC UNI-v2](https://uniswap.info/pair/0x4161Fa43eaA1Ac3882aeeD12C5FC05249e533e67) | FARM | [0x43286F57cf5981a5db56828dF91a46CfAb983E58](https://etherscan.io/address/0x43286F57cf5981a5db56828dF91a46CfAb983E58) |
| fUSDT  Uniswap | [USDT/fUSDT UNI-v2](https://uniswap.info/pair/0x713f62ccf8545Ff1Df19E5d7Ab94887cFaf95677) | FARM | [0x316De40F36da4C54AFf11C1D83081555Cca41270](https://etherscan.io/address/0x316De40F36da4C54AFf11C1D83081555Cca41270) |

WETH Pool (accepts WETH, gives you FARM):<br />
0xE604Fd5b1317BABd0cF2c72F7F5f2AD8c00Adbe1

LINK Pool (accepts LINK, gives you FARM):<br />
0xa112c2354d27c2Fb3370cc5d027B28987117a268

YFI Pool (accepts YFI, gives you FARM):<br />
0x84646F736795a8bC22Ab34E05c8982CD058328C7

SUSHI Pool (accepts SUSHI, gives you FARM):<br />
0x4938960C507A4d7094C53A8cDdCF925835393B8f

YFII Pool (accepts YFII, gives you FARM):<br />
0xC97DDAa8091aBaF79A4910b094830CCE5cDd78f4

YFV Pool (accepts YFV, gives you FARM):<br />
0x3631A32c959C5c52BC90AB5b7D212a8D00321918

OGN Pool (accepts OGN, gives you FARM):<br />
0xF71042C88458ff1702c3870f62F4c764712Cc9F0

BASED + sUSD LP Pool (accepts UNI-V2 combo of BASED and sUSD, gives you FARM):<br />
0xb3b56c7BDc87F9DeB7972cD8b5c09329ce421F89

PASTA + ETH LP Pool (accepts UNI-V2 combo of PASTA and ETH, gives you FARM):<br />
0xC6f39CFf6797baC5e29275177b6E8e315cF87D95

Balancer 5/95 pool: [0x0395e4a17ff11d36dac9959f2d7c8eca10fe89c9](https://pools.balancer.exchange/#/pool/0x0395e4a17ff11d36dac9959f2d7c8eca10fe89c9)


| Farm    |      Stake Token      |  Reward Token |  Balancer Pool Link | Reward Pool Contract Link |
|-----------|:----------------------|--------------:|:-------------------:|:----------------:|
| CRV:FARM  |  90/10 CRV/FARM BPT   | FARM          | [balancer pool](https://pools.balancer.exchange/#/pool/0xac6bac9dc3de2c14b420e287de8ecb330d96e492/) | [0x45A760B3E83FF8C107C4df955b1483De0982F393](https://etherscan.io/address/0x45A760B3E83FF8C107C4df955b1483De0982F393) |
| SWRV:FARM |  90/10 SWRV/FARM BPT   |  FARM | [balancer pool](https://pools.balancer.exchange/#/pool/0xf9f2df6e0e369145481a32fcd260e353aa20c1a6/) | [0x44356324864a30216e89193bc8b0f6309227d690](https://etherscan.io/address/0x44356324864a30216e89193bc8b0f6309227d690) |
| BASED/sUSD:FARM | 90/10 BASED+sUSD/FARM BPT |    FARM | [balancer pool](https://pools.balancer.exchange/#/pool/0xf76206115617f090f5a49961a78bcf99bb91cfee/) | [0xf465573288D9D89C6E89b1bc3BC9ce2b997E77dF](https://etherscan.io/address/0xf465573288D9D89C6E89b1bc3BC9ce2b997E77dF) |
| AMPL/ETH:FARM  |  90/10 AMPL+ETH/FARM BPT   | FARM          | [balancer pool](https://pools.balancer.exchange/#/pool/0xdfb341093ea062a74bd19a222c74abdcb97c067b/) | [0x7AF4458D3aBD61C3fd187Bb9f1Bbf917Cd4be9B8](https://etherscan.io/address/0x7AF4458D3aBD61C3fd187Bb9f1Bbf917Cd4be9B8) |
| YFV:FARM |  90/10 YVF/FARM BPT   |  FARM | [balancer pool](https://pools.balancer.exchange/#/pool/0x97cd8e51cd6c888567c6c620188b8fb264ee8e91/) | [0x158edB94D0bfC093952fB3009DeeED613042907c](https://etherscan.io/address/0x158edB94D0bfC093952fB3009DeeED613042907c) |
| SUSHI:FARM | 90/10 SUSHI/FARM BPT |    FARM | [balancer pool](https://pools.balancer.exchange/#/pool/0xb39ce7fa5953bebc6697112e88cd11579cbca579/) | [0x26582BeA67B30AF166b7FCD3424Ba1E0638Ab136](https://etherscan.io/address/0x26582BeA67B30AF166b7FCD3424Ba1E0638Ab136) |
| LINK:FARM  |  90/10 LINK/FARM BPT   | FARM          | [balancer pool](https://pools.balancer.exchange/#/pool/0x418d3dfca5099923cd57e0bf9ed1e9994f515152/) | [0x19f8cE19c9730A1d0db5149e65E48c2f0DAa9919](https://etherscan.io/address/0x19f8cE19c9730A1d0db5149e65E48c2f0DAa9919) |
| PASTA/ETH:FARM |  90/10 PASTA+ETH/FARM BPT   |  FARM | [balancer pool](https://pools.balancer.exchange/#/pool/0xa3e69ebce417ee0508d6996340126ad60078fcdd/) | [0xB4D1D6150dAc0D1A994AfB2A196adadBE639FF95](https://etherscan.io/address/0xB4D1D6150dAc0D1A994AfB2A196adadBE639FF95) |
| PYLON:FARM | 90/10 PYLON/FARM BPT |    FARM | [balancer pool](https://pools.balancer.exchange/#/pool/0x1e2dA0aa71155726C5C0E39AF76Ac0c2e8F74bEF/) | [0x2f97D9f870a773186CB01742Ff298777BBF6f244](https://etherscan.io/address/0x2f97D9f870a773186CB01742Ff298777BBF6f244) |


