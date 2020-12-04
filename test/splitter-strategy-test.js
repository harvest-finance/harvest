const Utils = require("./Utils.js");
const { expectRevert } = require("@openzeppelin/test-helpers");
const BigNumber = require("bignumber.js");
const Controller = artifacts.require("Controller");
const MockToken = artifacts.require("MockToken");
const Storage = artifacts.require("Storage");
const SplitterStrategy = artifacts.require("SplitterStrategy");
const SplitterProxy = artifacts.require("SplitterProxy");
const SplitterStrategyWhitelist = artifacts.require("SplitterStrategyWhitelist");
const SplitterConfig = artifacts.require("SplitterConfig");
const SplitterStrategyUpgradedTestOnly = artifacts.require("SplitterStrategyUpgradedTestOnly");

// Mocks
const NoopStrategyV2 = artifacts.require("NoopStrategyV2");
const makeVault = require("./make-vault.js");

// ERC20 interface
//const IERC20 = artifacts.require("IERC20");

BigNumber.config({ DECIMAL_PLACES: 0 });

contract("Splitter Strategy Unit Tests", function (accounts) {
  describe("Splitter Strategy", function () {
    // external contracts
    let dai;

    // parties in the protocol
    let governance = accounts[1];
    let rewardCollector = accounts[2];
    let farmer1 = accounts[3];
    let farmer2 = accounts[4];

    let strategy1;
    let strategy2;
    let strategy3;
    let daiVault;
    let investmentRatioNumerators = [ "2500", // 25%
                                      "4000", // 40%
                                      "1500"  // 15%. The rest will remain in splitter
                                    ]

    // numbers used in tests
    const farmerBalance1 = "50000" + "000000000000000000";
    const farmerBalance2 = "50000" + "000000000000000000";

    // Core protocol contracts
    let storage;
    let controller;
    let splitter;
    let splitterImpl;

    async function resetDaiBalance() {
      // reset token balance
      await dai.burn(await dai.balanceOf(farmer1), {
        from: farmer1,
      });
      await dai.burn(await dai.balanceOf(farmer2), {
        from: farmer2,
      });
      await dai.mint(farmer1, farmerBalance1, { from: governance });
      await dai.mint(farmer2, farmerBalance2, { from: governance });
      assert.equal(farmerBalance1, await dai.balanceOf(farmer1));
      assert.equal(farmerBalance2, await dai.balanceOf(farmer2));
    }

    async function setupExternalContracts() {
      dai = await MockToken.new({ from: governance });
    }

    async function setupCoreProtocol() {
      // deploy storage
      storage = await Storage.new({ from: governance });

      // set up controller
      controller = await Controller.new(storage.address, rewardCollector, {
        from: governance,
      });

      await storage.setController(controller.address, { from: governance });

      // set up the daiVault with 90% investment
      daiVault = await makeVault(storage.address, dai.address, 100, 100, {
        from: governance,
      });

      splitterImpl = await SplitterStrategy.new();
      const splitterProxy = await SplitterProxy.new(splitterImpl.address);
      splitter = await SplitterStrategy.at(splitterProxy.address);

      const strategyWhitelist = await SplitterStrategyWhitelist.new(splitter.address);
      const splitterConfig = await SplitterConfig.new(splitter.address);

      await splitter.initSplitter(
        storage.address,
        daiVault.address,
        strategyWhitelist.address,
        splitterConfig.address,
        {
          from: governance
        }
      );

      // set up the strategies
      strategy1 = await NoopStrategyV2.new(
        storage.address,
        dai.address,
        splitter.address,
        { from: governance }
      );

      strategy2 = await NoopStrategyV2.new(
        storage.address,
        dai.address,
        splitter.address,
        { from: governance }
      );

      strategy3 = await NoopStrategyV2.new(
        storage.address,
        dai.address,
        splitter.address,
        { from: governance }
      );

      await splitter.initStrategies(
        [strategy1.address, strategy2.address, strategy3.address],
        investmentRatioNumerators,
        {
          from: governance
        }
      );

      // link vaults with strategies
      await controller.addVaultAndStrategy(
        daiVault.address,
        splitter.address,
        { from: governance }
      );
    }

    beforeEach(async function () {
      await setupExternalContracts();
      await setupCoreProtocol();
      await resetDaiBalance();
    });

    async function depositVault(_farmer, _underlying, _vault, _amount) {
      await _underlying.approve(_vault.address, _amount, { from: _farmer });
      await _vault.deposit(_amount, { from: _farmer });
      assert.equal(_amount, await _vault.balanceOf(_farmer));
    }

    it("Investment ratios are enforced", async function () {
      await depositVault(farmer1, dai, daiVault, farmerBalance1);
      await depositVault(farmer2, dai, daiVault, farmerBalance2);

      Utils.assertBNEq(new BigNumber(0), await splitter.investedUnderlyingBalance());

      // doing hard work to push the money
      await daiVault.doHardWork({from : governance});

      const totalContribution = new BigNumber(farmerBalance1).plus(farmerBalance2);

      // check that the total underluing balance has been updated
      Utils.assertBNEq(
        totalContribution,
        await daiVault.underlyingBalanceWithInvestment()
      );

      // check that the total invested balance is the sum of the two
      Utils.assertBNEq(
        totalContribution,
        await splitter.investedUnderlyingBalance()
      );

      Utils.assertBNEq(
        totalContribution.times(0.25), // only 25% goes into the first strategy
        await strategy1.investedUnderlyingBalance(),
      );

      Utils.assertBNEq(
        totalContribution.times(0.4), // 40% goes into the second strategy
        await strategy2.investedUnderlyingBalance(),
      );

      Utils.assertBNEq(
        totalContribution.times(0.15), // 15% goes into the third strategy
        await strategy3.investedUnderlyingBalance(),
      );

      Utils.assertBNEq(
        // the rest remains in the splitter itself
        totalContribution
          .minus(await strategy1.investedUnderlyingBalance())
          .minus(await strategy2.investedUnderlyingBalance())
          .minus(await strategy3.investedUnderlyingBalance()),

        await dai.balanceOf(splitter.address),
      );

      // checking the balances of each farmer
      Utils.assertBNEq(
        farmerBalance1,
        await daiVault.underlyingBalanceWithInvestmentForHolder(farmer1),
      );

      Utils.assertBNEq(
        farmerBalance2,
        await daiVault.underlyingBalanceWithInvestmentForHolder(farmer2),
      );
    });

    it("Withdrawals are proportional", async function () {
      await depositVault(farmer1, dai, daiVault, farmerBalance1);
      await depositVault(farmer2, dai, daiVault, farmerBalance2);

      Utils.assertBNEq(new BigNumber(0), await splitter.investedUnderlyingBalance());

      // doing hard work to push the money
      await daiVault.doHardWork({from : governance});
      const totalContribution = new BigNumber(farmerBalance1).plus(farmerBalance2);

      const withdrawalAmount1 = "20000" + "000000000000000000"; // 0.2 of the total

      await daiVault.withdraw(withdrawalAmount1,  { from: farmer1 });

      // now checking each strategy
      Utils.assertBNEq(
        await strategy1.investedUnderlyingBalance(),
        totalContribution.times(0.25).times(0.8)
      );

      Utils.assertBNEq(
        await strategy2.investedUnderlyingBalance(),
        totalContribution.times(0.40).times(0.8)
      );

      Utils.assertBNEq(
        await strategy3.investedUnderlyingBalance(),
        totalContribution.times(0.15).times(0.8)
      );

      Utils.assertBNEq(
        totalContribution.times(0.20).times(0.8),
        await dai.balanceOf(splitter.address),
      );

      // check how much farmer1 actually got
      Utils.assertBNEq(withdrawalAmount1, await dai.balanceOf(farmer1));

      // withdraw the rest
      const withdrawalAmount2 = "10000" + "000000000000000000";
      await daiVault.withdraw(withdrawalAmount2, { from: farmer1 });
      await daiVault.withdraw(farmerBalance2, { from: farmer2 });
      await daiVault.withdraw(await daiVault.balanceOf(farmer1), { from: farmer1 });

      // after the second withdrawal, strategies should be empty
      Utils.assertBNEq(
        await strategy1.investedUnderlyingBalance(),
        "0"
      );
      Utils.assertBNEq(
        await strategy2.investedUnderlyingBalance(),
        "0"
      );
      Utils.assertBNEq(
        await strategy3.investedUnderlyingBalance(),
        "0"
      );

      Utils.assertBNEq(
        "0",
        await dai.balanceOf(splitter.address),
      );

      Utils.assertBNEq(farmerBalance1, await dai.balanceOf(farmer1));
      Utils.assertBNEq(farmerBalance2, await dai.balanceOf(farmer2));
    });

    describe("Unwhitelisting", function () {
      it("Unwhitelists an empty strategy at the beginning/middle of the list", async function () {
        Utils.assertBNEq(
          3,
          await splitter.whitelistedStrategyCount(),
        );
        await splitter.unwhitelistStrategy(strategy1.address, {from: governance});
        Utils.assertBNEq(
          2,
          await splitter.whitelistedStrategyCount(),
        );
        assert.equal(
          strategy3.address,
          await splitter.whitelistedStrategies(0),
        );
        assert.equal(
          strategy2.address,
          await splitter.whitelistedStrategies(1),
        );
      });

      it("Unwhitelists an empty strategy at the end of the list", async function () {
        Utils.assertBNEq(
          3,
          await splitter.whitelistedStrategyCount(),
        );
        await splitter.unwhitelistStrategy(strategy3.address, {from: governance});
        Utils.assertBNEq(
          2,
          await splitter.whitelistedStrategyCount(),
        );
        assert.equal(
          strategy1.address,
          await splitter.whitelistedStrategies(0),
        );
        assert.equal(
          strategy2.address,
          await splitter.whitelistedStrategies(1),
        );
      });

      it("Does not unwhitelist a strategy that has a balance", async function () {
        await depositVault(farmer1, dai, daiVault, farmerBalance1);

        // doing hard work to push the money
        await daiVault.doHardWork({from : governance});

        await expectRevert(
          splitter.unwhitelistStrategy(strategy1.address, {
            from: governance,
          }),
          "can only unwhitelist an empty strategy"
        );

        // empty the strategy
        await daiVault.withdraw(farmerBalance1, { from: farmer1 });
        await splitter.unwhitelistStrategy(strategy1.address, {from: governance});
      });
    });

    describe("Whitelisting", function () {
      it("Does not whitelist an incompatible strategy", async function () {
        const strategy4 = await NoopStrategyV2.new(
          storage.address,
          daiVault.address, // just a different underlying
          daiVault.address,
          { from: governance }
        );
        await expectRevert(
          splitter.announceStrategyWhitelist(strategy4.address, {
            from: governance,
          }),
          "Underlying of splitter must match Strategy underlying"
        );
      });

      it("Does not whitelist an alien strategy", async function () {
        const strategy4 = await NoopStrategyV2.new(
          storage.address,
          dai.address,
          daiVault.address,
          { from: governance }
        );
        await expectRevert(
          splitter.announceStrategyWhitelist(strategy4.address, {
            from: governance,
          }),
          "The strategy does not belong to this splitter"
        );
      });

      it("Does not whitelist a zero strategy", async function () {
        await expectRevert(
          splitter.announceStrategyWhitelist("0x0000000000000000000000000000000000000000", {
            from: governance,
          }),
          "_strategy cannot be 0x0"
        );
      });

      it("Does not whitelist a legit strategy prior to the timelock expiry", async function () {
        const strategy4 = await NoopStrategyV2.new(
          storage.address,
          dai.address,
          splitter.address,
          { from: governance }
        );
        await splitter.announceStrategyWhitelist(strategy4.address, {
          from: governance,
        });

        await expectRevert(
          splitter.whitelistStrategy(strategy4.address, {
            from: governance,
          }),
          "The strategy exists and switch timelock did not elapse yet"
        );
      });

      it("Whitelists a legit strategy after the timelock expiry", async function () {
        const strategy4 = await NoopStrategyV2.new(
          storage.address,
          dai.address,
          splitter.address,
          { from: governance }
        );
        await splitter.announceStrategyWhitelist(strategy4.address, {
          from: governance,
        });

        Utils.assertBNEq(
          3,
          await splitter.whitelistedStrategyCount(),
        );

        await Utils.waitHours(12);

        await splitter.whitelistStrategy(strategy4.address, {
          from: governance,
        });

        Utils.assertBNEq(
          4,
          await splitter.whitelistedStrategyCount(),
        );
        assert.equal(
          strategy4.address,
          await splitter.whitelistedStrategies(3),
        );
      });
    });

    describe("Instant re-configuration", function() {
      it("Allows for switching from one whitelisted strategy to another whitelisted strategy", async function () {
        await depositVault(farmer1, dai, daiVault, farmerBalance1);
        await depositVault(farmer2, dai, daiVault, farmerBalance2);

        // doing hard work to push the money
        await daiVault.doHardWork({from : governance});

        // check the total invariant
        const totalContribution = new BigNumber(farmerBalance1).plus(farmerBalance2);
        Utils.assertBNEq(
          totalContribution,
          await daiVault.underlyingBalanceWithInvestment()
        );
        Utils.assertBNEq(
          totalContribution,
          await splitter.investedUnderlyingBalance()
        );

        const strategy4 = await NoopStrategyV2.new(
          storage.address,
          dai.address,
          splitter.address,
          { from: governance }
        );
        await splitter.announceStrategyWhitelist(strategy4.address, {
          from: governance,
        });

        await Utils.waitHours(12);

        await splitter.whitelistStrategy(strategy4.address, {
          from: governance,
        });

        // this adds strategy4 to the list
        await splitter.reconfigureStrategies(
          [strategy3.address, strategy1.address, strategy2.address, strategy4.address],
          [1000, 2000, 3000, 1000],
          { from: governance }
        );

        // re-check the total invariant
        Utils.assertBNEq(
          totalContribution,
          await daiVault.underlyingBalanceWithInvestment()
        );
        Utils.assertBNEq(
          totalContribution,
          await splitter.investedUnderlyingBalance()
        );

        // do some withdrawals
        await daiVault.withdraw("40000" + "000000000000000000", { from: farmer1 });
        await daiVault.withdraw("40000" + "000000000000000000", { from: farmer2 });

        // unwhitelisting is not allowed because funds are still present
        await expectRevert(
          splitter.unwhitelistStrategy(strategy2.address, {
            from: governance,
          }),
          "can only unwhitelist an empty strategy"
        );

        // next, withdraw from strategy2
        await splitter.withdrawFromStrategy(strategy2.address, "100", "100", {from: governance});

        // invest some of the splitter's balance into strategy3
        await splitter.investIntoStrategy(strategy3.address, "2000" + "000000000000000000", {from: governance});

        // now, can un-whitelist strategy2
        await splitter.unwhitelistStrategy(strategy2.address, {from: governance});

        // now, can adjust the withdraw order (if necessary) to exclude the old strategy
        await splitter.reconfigureStrategies(
          [strategy3.address, strategy1.address, strategy4.address],
          [5000, 1000, 1000],
          { from: governance }
        );

        // re-deposit
        await dai.approve(daiVault.address, "40000" + "000000000000000000", { from: farmer1 });
        await daiVault.deposit("40000" + "000000000000000000", { from: farmer1 });

        await dai.approve(daiVault.address, "40000" + "000000000000000000", { from: farmer2 });
        await daiVault.deposit("40000" + "000000000000000000", { from: farmer2 });

        await daiVault.doHardWork({from : governance});
        // re-check the total invariant
        Utils.assertBNEq(
          totalContribution,
          await daiVault.underlyingBalanceWithInvestment()
        );
        Utils.assertBNEq(
          totalContribution,
          await splitter.investedUnderlyingBalance()
        );

        // now, just withdrawing all to vault (for the sake of testing)
        await splitter.withdrawAllToVault({from: governance});

        Utils.assertBNEq(
          totalContribution,
          await daiVault.underlyingBalanceWithInvestment()
        );

        Utils.assertBNEq(
          "0",
          await splitter.investedUnderlyingBalance()
        );
      });
    });

    describe("Upgradeability", function() {
      it("Preserves the state after an upgrade", async function () {
        await depositVault(farmer1, dai, daiVault, farmerBalance1);
        await depositVault(farmer2, dai, daiVault, farmerBalance2);

        // doing hard work to push the money
        await daiVault.doHardWork({from : governance});

        // check the total invariant
        const totalContribution = new BigNumber(farmerBalance1).plus(farmerBalance2);
        Utils.assertBNEq(
          totalContribution,
          await daiVault.underlyingBalanceWithInvestment()
        );

        const newImpl = await SplitterStrategyUpgradedTestOnly.new({from : governance});

        await splitter.scheduleUpgrade(newImpl.address, {
          from: governance,
        });

        await Utils.waitHours(12);

        const splitterAsProxy = await SplitterProxy.at(splitter.address);
        assert.equal(await splitterAsProxy.implementation(), splitterImpl.address);
        await splitterAsProxy.upgrade({ from: governance });
        assert.equal(await splitterAsProxy.implementation(), newImpl.address);

        // re-check the total invariant
        // this would basically confirm that addresses have been preserved
        Utils.assertBNEq(
          totalContribution,
          await daiVault.underlyingBalanceWithInvestment()
        );
        Utils.assertBNEq(
          totalContribution,
          await splitter.investedUnderlyingBalance()
        );

        // do some withdrawals
        await daiVault.withdraw("40000" + "000000000000000000", { from: farmer1 });
        await daiVault.withdraw("40000" + "000000000000000000", { from: farmer2 });

        // re-deposit
        await dai.approve(daiVault.address, "40000" + "000000000000000000", { from: farmer1 });
        await daiVault.deposit("40000" + "000000000000000000", { from: farmer1 });

        await dai.approve(daiVault.address, "40000" + "000000000000000000", { from: farmer2 });
        await daiVault.deposit("40000" + "000000000000000000", { from: farmer2 });

        await daiVault.doHardWork({from : governance});
        // re-check the total invariant
        Utils.assertBNEq(
          totalContribution,
          await daiVault.underlyingBalanceWithInvestment()
        );
        Utils.assertBNEq(
          totalContribution,
          await splitter.investedUnderlyingBalance()
        );

        // now, just withdrawing all to vault (for the sake of testing)
        await splitter.withdrawAllToVault({from: governance});

        Utils.assertBNEq(
          totalContribution,
          await daiVault.underlyingBalanceWithInvestment()
        );

        Utils.assertBNEq(
          "0",
          await splitter.investedUnderlyingBalance()
        );
      });
    });
  });
});
