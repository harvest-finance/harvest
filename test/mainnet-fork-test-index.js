// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send, time } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Controller = artifacts.require("Controller");
  const Vault = artifacts.require("Vault");
  const SNXRewardUniLPStrategy = artifacts.require("SNXRewardUniLPStrategy");
  const SNXRewardInterface = artifacts.require("SNXRewardInterface");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Mainnet Uniswap Staking Reward DAI", function(accounts){
    describe("Uniswap Staking Reward earnings DAI", function (){

      // external contracts
      let underlying;
      let cropToken;
      let cropPool;
      let token0;
      let token1;

      // external setup
      let underlyingWhale = MFC.ETH_DPI_WHALE_ADDRESS;
      let token0Whale = MFC.DPI_WHALE_ADDRESS;
      let token1Whale = MFC.WETH_WHALE_ADDRESS;
      let cropWhale = MFC.INDEX_WHALE_ADDRESS;

      let token0Path; // weth
      let token1Path; // DPI

      // parties in the protocol
      let governance = MFC.GOVERNANCE_ADDRESS;
      let farmer1 = accounts[3];
      let farmer2 = accounts[4];

      // numbers used in tests
      //                    "000000000000000000"
      const farmerBalance = "200" + "000000000000000000";

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let controller;
      let vault;
      let strategy;
      let feeRewardForwarder;


      async function setupExternalContracts() {
        underlying = await IERC20.at(MFC.UNISWAP_ETH_DPI_LP_ADDRESS);
        weth = await IERC20.at(MFC.WETH_ADDRESS);
        cropToken = await IERC20.at(MFC.INDEX_ADDRESS);
        cropPool = await SNXRewardInterface.at(MFC.ETH_DPI_POOL_ADDRESS);

        token0Path = [MFC.INDEX_ADDRESS, MFC.USDC_ADDRESS, MFC.WETH_ADDRESS, MFC.DPI_ADDRESS];
        token1Path = [MFC.INDEX_ADDRESS, MFC.USDC_ADDRESS, MFC.WETH_ADDRESS];
        token0 = await IERC20.at(MFC.DPI_ADDRESS);
        token1 = await IERC20.at(MFC.WETH_ADDRESS);
      }

      async function resetBalance() {
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, underlyingWhale, "30000000000000000000");
        await send.ether(etherGiver, token0Whale, "30000000000000000000");
        await send.ether(etherGiver, token1Whale, "30000000000000000000");

        // reset token balance
        await underlying.transfer(underlyingWhale, await underlying.balanceOf(farmer1), {from: farmer1});
        await underlying.transfer(underlyingWhale, await underlying.balanceOf(farmer2), {from: farmer2});
        await underlying.transfer(farmer1, farmerBalance, {from: underlyingWhale});
        await underlying.transfer(farmer2, farmerBalance, {from: underlyingWhale});
        assert.equal(farmerBalance, await underlying.balanceOf(farmer1));
      }

      async function setupCoreProtocol() {
        controller = await Controller.at("0x222412af183BCeAdEFd72e4Cb1b71f1889953b1C");
        // set up the vault with 100% investment
        vault = await Vault.at("0x2a32dcBB121D48C106F6d94cf2B4714c0b4Dfe48");
        
        // set up the strategy
        strategy = await SNXRewardUniLPStrategy.at("0x94E74A1cAc19C8CB051887EebE4D9D383840CDbb");

        await strategy.setLiquidationPaths(
          token0Path,
          token1Path,
          {from: governance}
        );

        // link vault with strategy
        await controller.addVaultAndStrategy(vault.address, strategy.address, {from: governance});

        feeRewardForwarder = await FeeRewardForwarder.at("0x9397bd6fB1EC46B7860C8073D2cb83BE34270D94");
        await feeRewardForwarder.setConversionPath(MFC.INDEX_ADDRESS, MFC.FARM_ADDRESS, [MFC.INDEX_ADDRESS, MFC.USDC_ADDRESS, MFC.FARM_ADDRESS], {from: governance});
      }

      beforeEach(async function () {
        await setupExternalContracts();
        await setupCoreProtocol();
        await resetBalance();
      });

      async function depositVault(_farmer, _underlying, _vault, _amount) {
        await _underlying.approve(_vault.address, _amount, { from: _farmer });
        await _vault.deposit(_amount, { from: _farmer });
        assert.equal(_amount, await vault.balanceOf(_farmer));
      }

      it("A farmer investing underlying", async function () {
        let duration = 500000;
        await vault.setVaultFractionToInvest(100, 100, {from: governance});
        let farmerOldBalance = new BigNumber(await underlying.balanceOf(farmer1));
        await depositVault(farmer1, underlying, vault, farmerBalance);
        await vault.doHardWork({from: governance});
        let strategyOldBalance = new BigNumber(await cropPool.balanceOf(strategy.address));
        assert.equal(strategyOldBalance.toFixed(), farmerOldBalance.toFixed()); // strategy invested into pool after `invest`
        await Utils.advanceNBlock(20);

        await vault.doHardWork({from: governance});
        await time.increase(duration);
        await Utils.advanceNBlock(100);
        
        // await cropToken.transfer(strategy.address, "11111100000000000000", {from: cropWhale})
        await token1.transfer(strategy.address, "111111000000", {from: token1Whale});
        await vault.doHardWork({from: governance});

        strategyNewBalance = new BigNumber(await cropPool.balanceOf(strategy.address));
        // strategy invested more money after doHardWork
        Utils.assertBNGt(strategyNewBalance, strategyOldBalance);

        await time.increase(duration);
        await Utils.advanceNBlock(10);
        await token0.transfer(strategy.address, "301000000000000000000", {from: token0Whale});
        await vault.doHardWork({from: governance});
        await vault.withdraw(farmerBalance, {from: farmer1});
        let farmerNewBalance = new BigNumber(await underlying.balanceOf(farmer1));
        // Farmer gained money
        Utils.assertBNGt(farmerNewBalance, farmerOldBalance);
      });
    });
  });
}
