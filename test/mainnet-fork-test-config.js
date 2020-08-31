module.exports = {

// 0x07bb is an address that holds a lot of Dai and some Ether
// We found the address by checking out the "holder" page of Dai
// https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f#balances
// It holds large amounts of Dai, but can transfer the amount away as well
// Need to "unlock" this account in ganache mainnet fork, see package.json
// This could be one of the reasons if this mainnet fork test starts failing
//
// Check the address to see if it still holds enough amount of Ether
// If it is not a Dai holder anymore, then change to another EOA found from the list above
// remember to also change the unlocked account in package.json

  DAI_WHALE_ADDRESS: "0x6DCb8492B5De636fD9e0a32413514647D00eF8D0",
  DAI_ADDRESS: "0x6b175474e89094c44da98b954eedeac495271d0f",

  USDC_WHALE_ADDRESS: "0x8cee3eeab46774c1CDe4F6368E3ae68BcCd760Bf",
  USDC_ADDRESS: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",

  // WETH
  WETH_ADDRESS: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",

  // yCRV
  YCRV_WHALE_ADDRESS: "0x39415255619783a2e71fcf7d8f708a951d92e1b6",
  YCRV_ADDRESS: "0xdF5e0e81Dff6FAF3A7e52BA697820c5e32D806A8",

  // YFII
  YFII_ADDRESS: "0xa1d0E215a23d7030842FC67cE582a6aFa3CCaB83",
  YFII_POOL_ADDRESS: "0xb81D3cB2708530ea990a287142b82D058725C092",

  // Compound
  COMP_ADDRESS: "0xc00e94cb662c3520282e6f5717214004a7f26888",
  COMPTROLLER_ADDRESS: "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b",
  CDAI_ADDRESS: "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",

  // Curve
  YCRV_ADDRESS: "0xdF5e0e81Dff6FAF3A7e52BA697820c5e32D806A8",

  // UniswapV2
  UNISWAP_V2_ROUTER02_ADDRESS: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",

  // USDT
  USDT_ADDRESS: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  USDT_WHALE_ADDRESS: "0x7b8c69a0f660cd43ef67948976daae77bc6a019b",
};
