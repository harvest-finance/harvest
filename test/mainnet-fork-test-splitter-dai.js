// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { send } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Vault = artifacts.require("Vault");
  const Storage = artifacts.require("Storage");
  const IdleStrategyDAIMainnetV2_HY = artifacts.require("IdleStrategyDAIMainnetV2_HY");
  const IdleStrategyDAIMainnetV2_RA = artifacts.require("IdleStrategyDAIMainnetV2_RA");
  const SplitterProxy = artifacts.require("SplitterProxy");
  const SplitterStrategy = artifacts.require("SplitterStrategy");
  const SplitterStrategyWhitelist = artifacts.require("SplitterStrategyWhitelist");
  const SplitterConfig = artifacts.require("SplitterConfig");
  const NoopStrategyV2 = artifacts.require("NoopStrategyV2");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Mainnet DAI Splitter Strategy", function(accounts){
    describe("Mainnet Splitter manipulations", function (){

      // external contracts
      let underlying;

      // external setup
      let underlyingWhale = MFC.DAI_WHALE_ADDRESS;

      // parties in the protocol
      let governance = MFC.GOVERNANCE_ADDRESS;
      let farmer1 = accounts[3];
      let farmer2 = accounts[4];

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let storage;
      let vault;

      let farmerBalance1;
      let farmerBalance2;

      let splitter;
      let strategy1, strategy2, strategy3;

      async function setupExternalContracts() {
        storage = await Storage.at(MFC.STORAGE_ADDRESS);
        underlying = await IERC20.at(MFC.DAI_ADDRESS);
        vault = await Vault.at(MFC.DAI_VAULT_ADDRESS);
      }

      async function resetBalance() {
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, underlyingWhale, "1000000000000000000");

        const allBalance = new BigNumber(await underlying.balanceOf(underlyingWhale)).dividedBy(100);
        farmerBalance1 = allBalance.dividedBy(2);
        farmerBalance2 = allBalance.minus(farmerBalance1);

        await underlying.transfer(farmer1, farmerBalance1.toFixed(), {from: underlyingWhale});
        await underlying.transfer(farmer2, farmerBalance2.toFixed(), {from: underlyingWhale});
      }

      async function setupCoreProtocol() {
        // set up the splitter and all the strategies

        const splitterImpl = await SplitterStrategy.new();
        const splitterProxy = await SplitterProxy.new(splitterImpl.address);
        splitter = await SplitterStrategy.at(splitterProxy.address);

        const strategyWhitelist = await SplitterStrategyWhitelist.new(splitter.address);
        const splitterConfig = await SplitterConfig.new(splitter.address);

        await splitter.initSplitter(
          storage.address,
          vault.address,
          strategyWhitelist.address,
          splitterConfig.address,
          { from: governance }
        );

        // set up the strategies:
        // First IDLE strategy is set with ratio 60%
        // Second IDLE strategy is set with ratio 30%
        // NoopStrategyV2 is set with ratio 5% (just for testing)
        const investmentRatioNumerators = ["6000", "3000", "500"];

        strategy1 = await IdleStrategyDAIMainnetV2_HY.new(
          MFC.STORAGE_ADDRESS,
          splitter.address,
          { from: governance }
        );

        await strategy1.setLiquidation(true, true, true, {from: governance});

        strategy2 = await IdleStrategyDAIMainnetV2_RA.new(
          MFC.STORAGE_ADDRESS,
          splitter.address,
          { from: governance }
        );

        await strategy2.setLiquidation(true, true, true, {from: governance});

        strategy3 = await NoopStrategyV2.new(
          storage.address,
          underlying.address,
          splitter.address,
          { from: governance }
        );

        await splitter.initStrategies(
          [strategy1.address, strategy2.address, strategy3.address],
          investmentRatioNumerators,
          // the rest stays in the splitter as cash
          { from: governance }
        );
      }

      beforeEach(async function () {
        await setupExternalContracts();
        await setupCoreProtocol();
        await resetBalance();
      });

      async function depositVault(_farmer, _underlying, _vault, _amount) {
        await _underlying.approve(_vault.address, _amount, { from: _farmer });
        await _vault.deposit(_amount, { from: _farmer });
      }

      it("A farmer investing underlying + strategy reconfiguration", async function () {
        const vaultInitialBalanceWithInvestment = new BigNumber(await vault.underlyingBalanceWithInvestment());
        console.log("Vault initial total balance:", vaultInitialBalanceWithInvestment.toFixed());
        console.log("Vault's initial price per share:", new BigNumber(await vault.getPricePerFullShare()).toFixed());

        await vault.announceStrategyUpdate(splitter.address, {from: governance});
        let blocksPerHour = 240;

        console.log("waiting for strategy update...");
        for (let i = 0; i < 12; i++) {
          await Utils.advanceNBlock(blocksPerHour);
        }

        await vault.setVaultFractionToInvest(95, 100, {from: governance});
        await vault.setStrategy(splitter.address, {from: governance});

        console.log("splitter set!");
        console.log("deposits began!");

        let farmer1OldBalance = new BigNumber(await underlying.balanceOf(farmer1));
        await depositVault(farmer1, underlying, vault, farmerBalance1);
        let farmer2OldBalance = new BigNumber(await underlying.balanceOf(farmer2));
        await depositVault(farmer2, underlying, vault, farmerBalance2);

        console.log("hard works!");

        await vault.doHardWork({from: governance});
        await Utils.advanceNBlock(10);

        for (let i = 0; i < 8; i++) {
          console.log("Price per share:          ", new BigNumber(await vault.getPricePerFullShare()).toFixed());
          console.log("strategy1 underlying:     ", new BigNumber(await strategy1.investedUnderlyingBalance()).toFixed());
          console.log("strategy2 underlying:     ", new BigNumber(await strategy2.investedUnderlyingBalance()).toFixed());
          console.log("strategy3 underlying:     ", new BigNumber(await strategy3.investedUnderlyingBalance()).toFixed());
          console.log("splitter  underlying:     ", new BigNumber(await underlying.balanceOf(splitter.address)).toFixed());
          console.log("total invested underlying:", new BigNumber(await splitter.investedUnderlyingBalance()).toFixed());
          await Utils.advanceNBlock(blocksPerHour);
          await vault.doHardWork({from: governance});
        }

        await vault.doHardWork({from: governance});

        await Utils.advanceNBlock(10);
        await vault.doHardWork({from: governance});

        // Checking that farmer gained money (but WITHOUT withdrawals because the current vaults are still V2 not V3)
        const farmer1NewBalanceAfterHardwork = new BigNumber(await vault.underlyingBalanceWithInvestmentForHolder(farmer1));
        console.log("Farmer1 balance before:", farmer1OldBalance.toFixed());
        console.log("Farmer1 balance after:", farmer1NewBalanceAfterHardwork.toFixed());
        Utils.assertBNGt(farmer1NewBalanceAfterHardwork, farmer1OldBalance);

        const farmer2NewBalanceAfterHardwork = new BigNumber(await vault.underlyingBalanceWithInvestmentForHolder(farmer2));
        console.log("Farmer2 balance before:", farmer2OldBalance.toFixed());
        console.log("Farmer2 balance after:", farmer2NewBalanceAfterHardwork.toFixed());
        Utils.assertBNGt(farmer2NewBalanceAfterHardwork, farmer2OldBalance);

        //=================
        // now, reconfiguring to withdraw everything from strategies 2 and 3 and deposit into strategy1
        // First, changing the ratios so that all new investAllUnderlying() calls would only invest in strategy1
        await splitter.reconfigureStrategies(
          [strategy1.address, strategy2.address, strategy3.address],
          ["10000", "0", "0"],
          { from: governance }
        );

        console.log("Vault total balance before moveAllAcrossStrategies", new BigNumber(await vault.underlyingBalanceWithInvestment()).toFixed());
        console.log("Price per share:          ", new BigNumber(await vault.getPricePerFullShare()).toFixed());
        console.log("strategy1 underlying:     ", new BigNumber(await strategy1.investedUnderlyingBalance()).toFixed());
        console.log("strategy2 underlying:     ", new BigNumber(await strategy2.investedUnderlyingBalance()).toFixed());
        console.log("strategy3 underlying:     ", new BigNumber(await strategy3.investedUnderlyingBalance()).toFixed());
        console.log("splitter  underlying:     ", new BigNumber(await underlying.balanceOf(splitter.address)).toFixed());
        console.log("total invested underlying:", new BigNumber(await splitter.investedUnderlyingBalance()).toFixed());

        // moving everything from strategy3 into strategy2, at once
        await splitter.moveAllAcrossStrategies(
          strategy3.address, strategy2.address,
          { from: governance }
        );

        // moving everything from strategy2 into strategy1, at once
        await splitter.moveAllAcrossStrategies(
          strategy2.address, strategy1.address,
          { from: governance }
        );

        console.log("Vault total balance  after moveAllAcrossStrategies", new BigNumber(await vault.underlyingBalanceWithInvestment()).toFixed());

        // Checking that farmer balances
        const farmer1NewBalanceAfterReconfiguration = new BigNumber(await vault.underlyingBalanceWithInvestmentForHolder(farmer1));
        console.log("Farmer1 balance before reconfiguration:", farmer1NewBalanceAfterHardwork.toFixed());
        console.log("Farmer1 balance after  reconfiguration:", farmer1NewBalanceAfterReconfiguration.toFixed());

        const farmer2NewBalanceAfterReconfiguration = new BigNumber(await vault.underlyingBalanceWithInvestmentForHolder(farmer2));
        console.log("Farmer2 balance before reconfiguration:", farmer2NewBalanceAfterHardwork.toFixed());
        console.log("Farmer2 balance after  reconfiguration:", farmer2NewBalanceAfterReconfiguration.toFixed());

        console.log("Price per share:          ", new BigNumber(await vault.getPricePerFullShare()).toFixed());
        console.log("strategy1 underlying:     ", new BigNumber(await strategy1.investedUnderlyingBalance()).toFixed());
        console.log("strategy2 underlying:     ", new BigNumber(await strategy2.investedUnderlyingBalance()).toFixed());
        console.log("strategy3 underlying:     ", new BigNumber(await strategy3.investedUnderlyingBalance()).toFixed());
        console.log("splitter  underlying:     ", new BigNumber(await underlying.balanceOf(splitter.address)).toFixed());
        console.log("total invested underlying:", new BigNumber(await splitter.investedUnderlyingBalance()).toFixed());

        // withdrawing everything from all the strategies
        await splitter.withdrawAllToVault({from: governance});

        console.log("Vault total balance after withdrawAllToVault", new BigNumber(await vault.underlyingBalanceWithInvestment()).toFixed());

        // check that the vault hasn't lost any money since the start of the test
        Utils.assertBNGt(await vault.underlyingBalanceWithInvestment(), vaultInitialBalanceWithInvestment);
      });
    });
  });
}
