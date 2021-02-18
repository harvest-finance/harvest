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

### Deployers, Minters, Treasuries

| Name | Address | Description |
|:---|:--:|:---|
| Deployer | [0xf00dD244228F51547f0563e60bCa65a30FBF5f7f][es-deployer] |Deploys and administers contracts|
| Harvester | [0xbed04C43E74150794F2ff5b62B4F73820EDaF661][es-harvester] |Executes harvests of farmed rewards|
| Delay Minter | [0x284D7200a0Dabb05ee6De698da10d00df164f61d][es-minter] | Announces and executes FARM minting|
| Notify Helper | [0xE20c31e3d08027F5AfACe84A3A46B7b3B165053c][es-notifyhelper] | Sends profitshare emissions daily.
| VWAP Bot | [0x008671Ca953EC3BAa8C1b9af4623d38789EE2236][es-vwap]| Auto-sells some FARM to pay for things|
| Developer Fund| [0x49d71131396F23F0bCE31dE80526D7C025981c4d][es-dev] | Receives 20% of minted FARM|
| Operational Treasury|[0x843002b1D545ef7abB71C716e6179570582faA40][es-ops] | Receives 10% of minted FARM|

[es-deployer]: https://etherscan.io/address/0xf00dd244228f51547f0563e60bca65a30fbf5f7f
[es-minter]: https://etherscan.io/address/0x284d7200a0dabb05ee6de698da10d00df164f61d
[es-dev]: https://etherscan.io/address/0x49d71131396f23f0bce31de80526d7c025981c4d
[es-notifyhelper]: https://etherscan.io/address/0xe20c31e3d08027f5aface84a3a46b7b3b165053c
[es-ops]: https://etherscan.io/address/0x843002b1d545ef7abb71c716e6179570582faa40
[es-vwap]: https://etherscan.io/address/0x008671ca953ec3baa8c1b9af4623d38789ee2236
[es-harvester]: https://etherscan.io/address/0xbed04c43e74150794f2ff5b62b4f73820edaf661

FARM token: <br />
[0xa0246c9032bC3A600820415aE600c6388619A14D](https://etherscan.io/address/0xa0246c9032bC3A600820415aE600c6388619A14D)
GRAIN token: <br />
[0x6589fe1271A0F29346796C6bAf0cdF619e25e58e](https://etherscan.io/address/0x6589fe1271a0f29346796c6baf0cdf619e25e58e)

### Vaults:

| Vault             | Receipt		| Underlying		| Vault Contract Address 					 | Underlying Address						  |
|:------------------|:--------------|:------------------|:-------------------------------------------|:-------------------------------------------|
| fWETH				| fWETH 		| WETH				| [0xFE09e53A81Fe2808bc493ea64319109B5bAa573e][es-fweth] | [0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2][es-weth] | 
|--Stablecoins		|
| fCRV-HUSD			| fhusd3CRV 	| husd3CRV			| [0x29780C39164Ebbd62e9DDDE50c151810070140f2][es-fcrv-husd] | [0x5B5CFE992AdAC0C9D48E05854B2d91C73a003858][es-fcrv-husd] |
| fCRV-YPOOL		| fyDAI+yUSDC+yUSDT+yTUSD| yDAI+yUSDC+yUSDT+yTUSD |[0x0FE4283e0216F94f5f9750a7a11AC54D3c9C38F3][es-fcrv-ypool] | [0xdF5e0e81Dff6FAF3A7e52BA697820c5e32D806A8][es-fcrv-ypool] |
| fCRV-3POOL		| f3Crv 		| 3Crv				| [0x71B9eC42bB3CB40F017D8AD8011BE8e384a95fa5][es-fcrv-3pool] | [0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490][es-fcrv-3pool] |
| fCRV-COMPOUND		| fcDAI+cUSDC	| cDAI+cUSDC		| [0x998cEb152A42a3EaC1f555B1E911642BeBf00faD][es-fcrv-compound] | [0x845838df265dcd2c412a1dc9e959c7d08537f8a2][es-fcrv-compound] |
| fCRV-BUSD			| fyDAI+yUSDC+yUSDT+yBUSD | yDAI+yUSDC+yUSDT+yBUSD | [0x4b1cBD6F6D8676AcE5E412C78B7a59b4A1bbb68a][es-fcrv-busd] | [0x3B3Ac5386837Dc563660FB6a0937DFAa5924333B][es-fcrv-busd] |
| fCRV-USDN			| fusdn3CRV		| usdn3CRV 			| [0x683E683fBE6Cf9b635539712c999f3B3EdCB8664][es-fcrv-usdn] | [0x4f3E8F405CF5aFC05D68142F3783bDfE13811522][es-fcrv-usdn] |
| fUSDC				| fUSDC 		| USDC				| [0xf0358e8c3CD5Fa238a29301d0bEa3D63A17bEdBE][es-fusdc] | [0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48][es-fusdc] |
| fUSDT				| fUSDT			| USDT				| [0x053c80eA73Dc6941F518a68E2FC52Ac45BDE7c9C][es-fusdt] | [0xdAC17F958D2ee523a2206206994597C13D831ec7][es-fusdt] |
| fTUSD				| fTUSD			| TUSD				| [0x7674622c63Bee7F46E86a4A5A18976693D54441b][es-ftusd] | [0x0000000000085d4780B73119b644AE5ecd22b376][es-ftusd] |
| fDAI				| fDAI			| DAI				| [0xab7FA2B2985BCcfC13c6D86b1D5A17486ab1e04C][es-fdai] | [0x6B175474E89094C44Da98b954EedeAC495271d0F][es-fdai] |
|--BTC				|
| fCRV-HBTC 		| fhCRV 		| hCRV				| [0xCC775989e76ab386E9253df5B0c0b473E22102E2][es-fcrv-hbtc] | [0xb19059ebb43466C323583928285a49f558E572Fd][es-fcrv-hbtc] |
| fCRV-TBTC			| ftbtc/sbtcCrv	| tbtc/sbtcCrv		| [0x640704D106E79e105FDA424f05467F005418F1B5][es-fcrv-tbtc] | [0x64eda51d3Ad40D56b9dFc5554E06F94e1Dd786Fd][es-fcrv-tbtc] |
| fCRV-RENWBTC 		| fcrvRenWBTC	| crvRenWBTC		| [0x9aA8F427A17d6B0d91B6262989EdC7D45d6aEdf8][es-fcrv-renwbtc] | [0x49849C98ae39Fff122806C06791Fa73784FB3675][es-fcrv-renwbtc] |
| fWBTC   			| fWBTC			| WBTC				| [0x5d9d25c7C457dD82fc8668FFC6B9746b674d4EcB][es-fwbtc] | [0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599][es-fwbtc] |
| fRENBTC 			| frenBTC 		| renBTC			| [0xC391d1b08c1403313B0c28D47202DFDA015633C4][es-frenbtc] | [0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D][es-frenbtc] |
|--Sushiswap		|
|fSLP-DAI:WETH		| fSLP			| SLP				| [0x203E97aa6eB65A1A02d9E80083414058303f241E][es-fslp-dai:weth] | [0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f][es-fslp-dai:weth] |
|fSLP-USDC:WETH		| fSLP			| SLP				| [0x01bd09A1124960d9bE04b638b142Df9DF942b04a][es-fslp-usdc:weth] | [0x397FF1542f962076d0BFE58eA045FfA2d347ACa0][es-fslp-usdc:weth] |
|fSLP-WETH:USDT		| fSLP			| SLP				| [0x64035b583c8c694627A199243E863Bb33be60745][es-fslp-weth:usdt] | [0x06da0fd433C1A5d7a4faa01111c044910A184553][es-fslp-weth:usdt] |
|fSLP-WBTC:WETH		| fSLP			| SLP				| [0x5C0A3F55AAC52AA320Ff5F280E77517cbAF85524][es-fslp-wbtc:weth] | [0xCEfF51756c56CeFFCA006cD410B03FFC46dd3a58][es-fslp-wbtc:weth] |
|fSLP-WBTC:TBTC 	| fSLP			| SLP				| [0xF553E1f826f42716cDFe02bde5ee76b2a52fc7EB][es-fslp-wbtc:tbtc] | [0x2Dbc7dD86C6cd87b525BD54Ea73EBeeBbc307F68][es-fslp-wbtc:tbtc] |
|--Uniswap			|
|fUNI-DAI:WETH		| fUNI-V2		| UNI-V2			| [0x307E2752e8b8a9C29005001Be66B1c012CA9CDB7][es-funi-dai:weth] | [0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11][es-funi-dai:weth] |
|fUNI-USDC:WETH		| fUNI-V2		| UNI-V2			| [0xA79a083FDD87F73c2f983c5551EC974685D6bb36][es-funi-usdc:weth] | [0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc][es-funi-usdc:weth] |
|fUNI-WETH:USDT		| fUNI-V2		| UNI-V2			| [0x7DDc3ffF0612E75Ea5ddC0d6Bd4e268f70362Cff][es-funi-weth:usdt] | [0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852][es-funi-weth:usdt] |
|fUNI-WBTC:WETH		| fUNI-V2		| UNI-V2			| [0x01112a60f427205dcA6E229425306923c3Cc2073][es-funi-wbtc:weth] | [0xBb2b8038a1640196FbE3e38816F3e67Cba72D940][es-funi-wbtc:weth] |
|fUNI-DPI:WETH		| fUNI-V2 		| UNI-V2			| [0x2a32dcBB121D48C106F6d94cf2B4714c0b4Dfe48][es-funi-dpi:weth] | [0x4d5ef58aAc27d99935E5b6B4A6778ff292059991][es-funi-dpi:weth] |

[//]: # (Vault addresses)
[es-fweth]: https://etherscan.io/address/0xFE09e53A81Fe2808bc493ea64319109B5bAa573e
[//]: # (stablecoins)
[es-fcrv-husd]: https://etherscan.io/address/0x29780C39164Ebbd62e9DDDE50c151810070140f2
[es-fcrv-ypool]: https://etherscan.io/address/0x0FE4283e0216F94f5f9750a7a11AC54D3c9C38F3
[es-fcrv-3pool]: https://etherscan.io/address/0x71B9eC42bB3CB40F017D8AD8011BE8e384a95fa5
[es-fcrv-compound]: https://etherscan.io/address/0x998cEb152A42a3EaC1f555B1E911642BeBf00faD
[es-fcrv-busd]: https://etherscan.io/address/0x4b1cbd6f6d8676ace5e412c78b7a59b4a1bbb68a
[es-fcrv-usdn]: https://etherscan.io/address/0x683e683fbe6cf9b635539712c999f3b3edcb8664
[es-fusdc]: https://etherscan.io/address/0xf0358e8c3CD5Fa238a29301d0bEa3D63A17bEdBE
[es-fusdt]: https://etherscan.io/address/0x053c80eA73Dc6941F518a68E2FC52Ac45BDE7c9C
[es-ftusd]: https://etherscan.io/address/0x7674622c63Bee7F46E86a4A5A18976693D54441b
[es-fdai]: https://etherscan.io/address/0xab7fa2b2985bccfc13c6d86b1d5a17486ab1e04c
[//]: # (BTC)
[es-fcrv-hbtc]: https://etherscan.io/address/0xCC775989e76ab386E9253df5B0c0b473E22102E2
[es-fcrv-tbtc]: https://etherscan.io/address/0x640704D106E79e105FDA424f05467F005418F1B5
[es-fcrv-renwbtc]: https://etherscan.io/address/0x9aA8F427A17d6B0d91B6262989EdC7D45d6aEdf8
[es-fwbtc]: https://etherscan.io/address/0x5d9d25c7C457dD82fc8668FFC6B9746b674d4EcB
[es-frenbtc]: https://etherscan.io/address/0xC391d1b08c1403313B0c28D47202DFDA015633C4
[//]: # (Sushiswap)
[es-fslp-dai:weth]: https://etherscan.io/address/0x203E97aa6eB65A1A02d9E80083414058303f241E
[es-fslp-usdc:weth]: https://etherscan.io/address/0x01bd09a1124960d9be04b638b142df9df942b04a
[es-fslp-weth:usdt]: https://etherscan.io/address/0x64035b583c8c694627a199243e863bb33be60745
[es-fslp-wbtc:weth]: https://etherscan.io/address/0x5c0a3f55aac52aa320ff5f280e77517cbaf85524
[es-fslp-wbtc:tbtc]: https://etherscan.io/address/0xF553E1f826f42716cDFe02bde5ee76b2a52fc7EB
[//]: # (Uniswap)
[es-funi-dai:weth]: https://etherscan.io/address/0x307E2752e8b8a9C29005001Be66B1c012CA9CDB7
[es-funi-usdc:weth]: https://etherscan.io/address/0xA79a083FDD87F73c2f983c5551EC974685D6bb36
[es-funi-weth:usdt]: https://etherscan.io/address/0x7DDc3ffF0612E75Ea5ddC0d6Bd4e268f70362Cff
[es-funi-wbtc:weth]: https://etherscan.io/address/0x01112a60f427205dcA6E229425306923c3Cc2073
[es-funi-dpi:weth]: https://etherscan.io/address/0x2a32dcBB121D48C106F6d94cf2B4714c0b4Dfe48

[//]: # (Vault underlying)
[es-weth]: https://etherscan.io/address/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
[//]: # (stablecoins)
[es-crv-husd]: https://etherscan.io/address/0x5B5CFE992AdAC0C9D48E05854B2d91C73a003858
[es-crv-ypool]: https://etherscan.io/address/0xdF5e0e81Dff6FAF3A7e52BA697820c5e32D806A8
[es-crv-3pool]: https://etherscan.io/address/0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490
[es-crv-compound]: https://etherscan.io/address/0x845838df265dcd2c412a1dc9e959c7d08537f8a2
[es-crv-busd]: https://etherscan.io/address/0x3B3Ac5386837Dc563660FB6a0937DFAa5924333B
[es-crv-usdn]: https://etherscan.io/address/0x4f3E8F405CF5aFC05D68142F3783bDfE13811522
[es-usdc]: https://etherscan.io/address/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
[es-usdt]: https://etherscan.io/address/0xdAC17F958D2ee523a2206206994597C13D831ec7
[es-tusd]: https://etherscan.io/address/0x0000000000085d4780B73119b644AE5ecd22b376
[es-dai]: https://etherscan.io/address/0x6B175474E89094C44Da98b954EedeAC495271d0F
[//]: # (BTC)
[es-crv-hbtc]: https://etherscan.io/address/0xb19059ebb43466C323583928285a49f558E572Fd
[es-crv-tbtc]: https://etherscan.io/address/0x64eda51d3Ad40D56b9dFc5554E06F94e1Dd786Fd
[es-crv-renwbtc]: https://etherscan.io/address/0x49849C98ae39Fff122806C06791Fa73784FB3675
[es-wbtc]: https://etherscan.io/address/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599
[es-renbtc]: https://etherscan.io/address/0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D
[//]: # (Sushiswap)
[es-slp-dai:weth]: https://etherscan.io/address/0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f
[es-slp-usdc:weth]: https://etherscan.io/address/0x397FF1542f962076d0BFE58eA045FfA2d347ACa0
[es-slp-weth:usdt]: https://etherscan.io/address/0x06da0fd433C1A5d7a4faa01111c044910A184553
[es-slp-wbtc:weth]: https://etherscan.io/address/0xCEfF51756c56CeFFCA006cD410B03FFC46dd3a58
[es-slp-wbtc:tbtc]: https://etherscan.io/address/0x2Dbc7dD86C6cd87b525BD54Ea73EBeeBbc307F68
[//]: # (Uniswap)
[es-uni-dai:weth]: https://etherscan.io/address/0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11
[es-uni-usdc:weth]: https://etherscan.io/address/0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc
[es-uni-weth:usdt]: https://etherscan.io/address/0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852
[es-uni-wbtc:weth]: https://etherscan.io/address/0xBb2b8038a1640196FbE3e38816F3e67Cba72D940
[es-uni-dpi:weth]: https://etherscan.io/address/0x4d5ef58aAc27d99935E5b6B4A6778ff292059991

### Staking Contracts:

| Pool    |      Stake Token      |  Reward Token | Reward Pool Contract Link |
|-----------|:----------------------|--------------:|:----------------:|
| WETH Pool | fWETH | FARM | [0x3DA9D911301f8144bdF5c3c67886e5373DCdff8e](https://etherscan.io/address/0x3DA9D911301f8144bdF5c3c67886e5373DCdff8e) |
| Profit Sharing | FARM | FARM | [0x25550Cccbd68533Fa04bFD3e3AC4D09f9e00Fc50](https://etherscan.io/address/0x25550Cccbd68533Fa04bFD3e3AC4D09f9e00Fc50) |
| Uniswap FARM:USDC | [FARM/USDC UNI-v2](https://uniswap.info/pair/0x514906fc121c7878424a5c928cad1852cc545892) | FARM | [0x99b0d6641A63Ce173E6EB063b3d3AED9A35Cf9bf](https://etherscan.io/address/0x99b0d6641A63Ce173E6EB063b3d3AED9A35Cf9bf) |
| Uniswap FARM:WETH | [FARM/WETH UNI-v2](https://info.uniswap.org/pair/0x56feAccb7f750B997B36A68625C7C596F0B41A58) | FARM | [0x6555c79a8829b793F332f1535B0eFB1fE4C11958](https://etherscan.io/address/0x6555c79a8829b793F332f1535B0eFB1fE4C11958)
| Uniswap GRAIN:FARM | [GRAIN/FARM UNI-v2](https://info.uniswap.org/pair/0xB9Fa44B0911F6D777faAb2Fa9d8Ef103f25Ddf49) | FARM | [0xe58f0d2956628921cdEd2eA6B195Fc821c3a2b16](https://etherscan.io/address/0xe58f0d2956628921cdEd2eA6B195Fc821c3a2b16)
|--Stablecoins |
| CRV-HUSD Pool | fCRV-HUSD | FARM | [0x72C50e6FD8cC5506E166c273b6E814342Aa0a3c1](https://etherscan.io/address/0x72C50e6FD8cC5506E166c273b6E814342Aa0a3c1)
| CRV-YPOOL Pool | fCRV-YPOOL | FARM | [0x6D1b6Ea108AA03c6993d8010690264BA96D349A8](https://etherscan.io/address/0x6D1b6Ea108AA03c6993d8010690264BA96D349A8)
| CRV-3POOL Pool | fCRV-3POOL | FARM | [0x27F12d1a08454402175b9F0b53769783578Be7d9](https://etherscan.io/address/0x27F12d1a08454402175b9F0b53769783578Be7d9)
| CRV-COMPOUND Pool | fCRV-COMPOUND | FARM | [0xC0f51a979e762202e9BeF0f62b07F600d0697DE1](https://etherscan.io/address/0xC0f51a979e762202e9BeF0f62b07F600d0697DE1)
| CRV-BUSD Pool | fCRV-BUSD | FARM | [0x093C2ae5E6F3D2A897459aa24551289D462449AD](https://etherscan.io/address/0x093C2ae5E6F3D2A897459aa24551289D462449AD)
| CRV-USDN Pool | fCRV-USDN | FARM | [0xef4Da1CE3f487DA2Ed0BE23173F76274E0D47579](https://etherscan.io/address/0xef4Da1CE3f487DA2Ed0BE23173F76274E0D47579)
| USDC Pool | fUSDC | FARM | [0x4F7c28cCb0F1Dbd1388209C67eEc234273C878Bd](https://etherscan.io/address/0x4F7c28cCb0F1Dbd1388209C67eEc234273C878Bd) |
| USDT Pool | fUSDT | FARM | [0x6ac4a7ab91e6fd098e13b7d347c6d4d1494994a2](https://etherscan.io/address/0x6ac4a7ab91e6fd098e13b7d347c6d4d1494994a2) |
| TUSD Pool | fTUSD | FARM | [0xeC56a21CF0D7FeB93C25587C12bFfe094aa0eCdA](https://etherscan.io/address/0xeC56a21CF0D7FeB93C25587C12bFfe094aa0eCdA) |
| DAI Pool  | fDAI | FARM | [0x15d3A64B2d5ab9E152F16593Cdebc4bB165B5B4A](https://etherscan.io/address/0x15d3A64B2d5ab9E152F16593Cdebc4bB165B5B4A) |
|--BTC		|
| CRV-HBTC Pool | fCRV-HBTC | FARM | [0x01f9CAaD0f9255b0C0Aa2fBD1c1aA06ad8Af7254](https://etherscan.io/address/0x01f9CAaD0f9255b0C0Aa2fBD1c1aA06ad8Af7254)
| CRV-TBTC Pool | fCRV-TBTC | FARM | [0x017eC1772A45d2cf68c429A820eF374f0662C57c](https://etherscan.io/address/0x017eC1772A45d2cf68c429A820eF374f0662C57c)
| CRV-RENWBTC Pool | fCRVRENWBTC | FARM | [0xA3Cf8D1CEe996253FAD1F8e3d68BDCba7B3A3Db5](https://etherscan.io/address/0xA3Cf8D1CEe996253FAD1F8e3d68BDCba7B3A3Db5) |
| WBTC Pool | fWBTC | FARM | [0x917d6480Ec60cBddd6CbD0C8EA317Bcc709EA77B](https://etherscan.io/address/0x917d6480Ec60cBddd6CbD0C8EA317Bcc709EA77B) |
| RENBTC Pool | fRENBTC | FARM | [0x7b8Ff8884590f44e10Ea8105730fe637Ce0cb4F6](https://etherscan.io/address/0x7b8Ff8884590f44e10Ea8105730fe637Ce0cb4F6) |
|--Sushiswap |
| Sushiswap DAI:WETH Pool | fSLP-DAI:WETH | FARM | [0x76Aef359a33C02338902aCA543f37de4b01BA1FA](https://etherscan.io/address/0x76Aef359a33C02338902aCA543f37de4b01BA1FA)
| Sushiswap USDC:WETH Pool | fSLP-USDC:WETH	| FARM | [0x6B4e1E0656Dd38F36c318b077134487B9b0cf7a6](https://etherscan.io/address/0x6B4e1E0656Dd38F36c318b077134487B9b0cf7a6)
| Sushiswap WETH:USDT Pool | fSLP-WETH:USDT	| FARM | [0xA56522BCA0A09f57B85C52c0Cc8Ba1B5eDbc64ef](https://etherscan.io/address/0xA56522BCA0A09f57B85C52c0Cc8Ba1B5eDbc64ef)
| Sushiswap WBTC:WETH Pool | fSLP-WBTC:WETH	| FARM | [0xE2D9FAe95f1e68afca7907dFb36143781f917194](https://etherscan.io/address/0xE2D9FAe95f1e68afca7907dFb36143781f917194)
|--Uniswap |
|Uniswap DPI:WETH Pool| fUNI-DPI:WETH | FARM | [0xAd91695b4BeC2798829ac7a4797E226C78f22Abd](https://etherscan.io/address/0xAd91695b4BeC2798829ac7a4797E226C78f22Abd)

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
| Sushiswap WBTC:TBTC Pool | fSLP-WBTC:TBTC | FARM | [0x9523FdC055F503F73FF40D7F66850F409D80EF34](https://etherscan.io/address/0x9523FdC055F503F73FF40D7F66850F409D80EF34) |

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

