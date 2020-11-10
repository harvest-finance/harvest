const Utils = require("./Utils.js");
const { expectRevert } = require("@openzeppelin/test-helpers");
const BigNumber = require("bignumber.js");
const Controller = artifacts.require("Controller");
const MockToken = artifacts.require("MockToken");
const Storage = artifacts.require("Storage");
const SplitterStrategy = artifacts.require("SplitterStrategy");

//const CRVStrategyStableMainnet = artifacts.require("CRVStrategyStableMainnet");
// Mocks
const NoopStrategy = artifacts.require("NoopStrategy");
const makeVault = require("./make-vault.js");

// ERC20 interface
//const IERC20 = artifacts.require("IERC20");

BigNumber.config({ DECIMAL_PLACES: 0 });

contract.only("Splitter Strategy Unit Tests", function (accounts) {
  describe("Splitter Strategy", function () {
    // external contracts
    let dai;

    // parties in the protocol
    let governance = accounts[1];
    let rewardCollector = accounts[2];
    let farmer1 = accounts[3];
    let farmer2 = accounts[4];
    let strategyCaps = ["50000" + "000000000000000000",
                        "20000" + "000000000000000000"];

    let strategy1;
    let strategy2;
    let daiVault;
    let investmentRatioNumerators = ["2500", // 25%
                                      "7500" // 75%
                                    ]

    // numbers used in tests
    const farmerBalance1 = "50000" + "000000000000000000";
    const farmerBalance2 = "50000" + "000000000000000000";

    // Core protocol contracts
    let storage;
    let controller;
    let splitter;

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

      splitter = await SplitterStrategy.new(
        storage.address
      );

      // set up the strategies
      strategy1 = await NoopStrategy.new(
        storage.address,
        dai.address,
        splitter.address,
        { from: governance }
      );

      strategy2 = await NoopStrategy.new(
        storage.address,
        dai.address,
        splitter.address,
        { from: governance }
      );

      await splitter.initSplitter(
        dai.address,
        daiVault.address,
        [strategy1.address, strategy2.address],
        investmentRatioNumerators,
        strategyCaps,
        [strategy2.address, strategy1.address], // reverse withdrawal order
        {
          from: governance
        }
      )

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

    it("Investment ratios and caps are enforced", async function () {
//      let farmerOldBalance = new BigNumber(await dai.balanceOf(farmer1));
      await depositVault(farmer1, dai, daiVault, farmerBalance1);
      await depositVault(farmer2, dai, daiVault, farmerBalance2);

      Utils.assertBNEq(new BigNumber(0), await splitter.investedUnderlyingBalance());

      // doing hard work to push the money
      await controller.doHardWork(daiVault.address, {from : governance});

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
      )

      Utils.assertBNEq(
        strategyCaps[1], // strategy 2 would reach the cap
        await strategy2.investedUnderlyingBalance(),
      )

      Utils.assertBNEq(
        // the rest stays in the splitter itself
        totalContribution
          .minus(await strategy1.investedUnderlyingBalance())
          .minus(await strategy2.investedUnderlyingBalance()),

        await dai.balanceOf(splitter.address),
      )

      Utils.assertBNEq(
        farmerBalance1,
        await daiVault.underlyingBalanceWithInvestmentForHolder(farmer1),
      )

      Utils.assertBNEq(
        farmerBalance2,
        await daiVault.underlyingBalanceWithInvestmentForHolder(farmer2),
      )
    });

    it("Withdraw order is enforced", async function () {
      await depositVault(farmer1, dai, daiVault, farmerBalance1);
      await depositVault(farmer2, dai, daiVault, farmerBalance2);

      Utils.assertBNEq(new BigNumber(0), await splitter.investedUnderlyingBalance());

      // doing hard work to push the money
      await controller.doHardWork(daiVault.address, {from : governance});

      // make sure that withdrawal comes from the second strategy
      Utils.assertBNEq(
        await strategy2.investedUnderlyingBalance(),
        strategyCaps[1]
      );
      await daiVault.withdraw(strategyCaps[1], { from: farmer1 });

      // should empty strategy2 but immediately re-invest the slack, leading to:
      Utils.assertBNEq(
        await strategy2.investedUnderlyingBalance(),
        "20000" + "000000000000000000"
      );

      // withdraw the rest of farmer 1 balance:

      Utils.assertBNEq(strategyCaps[1], await dai.balanceOf(farmer1));
      await daiVault.withdraw("10000" + "000000000000000000", { from: farmer1 });
      await daiVault.withdraw(farmerBalance2, { from: farmer2 });
      await daiVault.withdraw("20000" + "000000000000000000", { from: farmer1 });

      // after the second withdrawal, strategies should be empty
      Utils.assertBNEq(
        await strategy1.investedUnderlyingBalance(),
        "0"
      );
      Utils.assertBNEq(
        await strategy2.investedUnderlyingBalance(),
        "0"
      );

      Utils.assertBNEq(farmerBalance1, await dai.balanceOf(farmer1));
      Utils.assertBNEq(farmerBalance2, await dai.balanceOf(farmer2));
    });

    describe("Unwhitelisting", function () {
      it("Unwhitelists an empty strategy at the beginning/middle of the list", async function () {
        Utils.assertBNEq(
          2,
          await splitter.whitelistedStrategyCount(),
        );
        await splitter.unwhitelistStrategy(strategy1.address, {from: governance});
        Utils.assertBNEq(
          1,
          await splitter.whitelistedStrategyCount(),
        );
        assert.equal(
          strategy2.address,
          await splitter.whitelistedStrategies(0),
        );
      });

      it("Unwhitelists an empty strategy at the end of the list", async function () {
        Utils.assertBNEq(
          2,
          await splitter.whitelistedStrategyCount(),
        );
        await splitter.unwhitelistStrategy(strategy2.address, {from: governance});
        Utils.assertBNEq(
          1,
          await splitter.whitelistedStrategyCount(),
        );
        assert.equal(
          strategy1.address,
          await splitter.whitelistedStrategies(0),
        );
      });

      it("Does not whitelist a strategy that has a balance", async function () {
        await depositVault(farmer1, dai, daiVault, farmerBalance1);

        // doing hard work to push the money
        await controller.doHardWork(daiVault.address, {from : governance});

        await expectRevert(
          splitter.unwhitelistStrategy(strategy1.address, {
            from: governance,
          }),
          "can only whitelist an empty strategy"
        );

        // empty the strategy
        await daiVault.withdraw(farmerBalance1, { from: farmer1 });
        await splitter.unwhitelistStrategy(strategy1.address, {from: governance});
      });
    });

    describe("Whitelisting", function () {
      it("Does not whitelist an incompatible strategy", async function () {
        const strategy3 = await NoopStrategy.new(
          storage.address,
          daiVault.address, // just a different underlying
          daiVault.address,
          { from: governance }
        );
        await expectRevert(
          splitter.announceStrategyWhitelist(strategy3.address, {
            from: governance,
          }),
          "Underlying of splitter must match Strategy underlying"
        );
      });

      it("Does not whitelist an alien strategy", async function () {
        const strategy3 = await NoopStrategy.new(
          storage.address,
          dai.address,
          daiVault.address,
          { from: governance }
        );
        await expectRevert(
          splitter.announceStrategyWhitelist(strategy3.address, {
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
        const strategy3 = await NoopStrategy.new(
          storage.address,
          dai.address,
          splitter.address,
          { from: governance }
        );
        await splitter.announceStrategyWhitelist(strategy3.address, {
          from: governance,
        });

        await expectRevert(
          splitter.whitelistStrategy(strategy3.address, {
            from: governance,
          }),
          "The strategy exists and switch timelock did not elapse yet"
        );
      });

      it("Whitelists a legit strategy after the timelock expiry", async function () {
        const strategy3 = await NoopStrategy.new(
          storage.address,
          dai.address,
          splitter.address,
          { from: governance }
        );
        await splitter.announceStrategyWhitelist(strategy3.address, {
          from: governance,
        });

        Utils.assertBNEq(
          2,
          await splitter.whitelistedStrategyCount(),
        );

        await Utils.waitHours(12);

        await splitter.whitelistStrategy(strategy3.address, {
          from: governance,
        });

        Utils.assertBNEq(
          3,
          await splitter.whitelistedStrategyCount(),
        );
        assert.equal(
          strategy3.address,
          await splitter.whitelistedStrategies(2),
        );
      });
    });

    describe("Instant re-configuration", function() {
      it("Allows for switching from one whitelisted strategy to another whitelisted strategy", async function () {
        await depositVault(farmer1, dai, daiVault, farmerBalance1);
        await depositVault(farmer2, dai, daiVault, farmerBalance2);

        // doing hard work to push the money
        await controller.doHardWork(daiVault.address, {from : governance});

        Utils.assertBNEq(
          strategyCaps[1], // strategy2 should reach the cap by now
          await strategy2.investedUnderlyingBalance()
        );

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

        const strategy3 = await NoopStrategy.new(
          storage.address,
          dai.address,
          splitter.address,
          { from: governance }
        );
        await splitter.announceStrategyWhitelist(strategy3.address, {
          from: governance,
        });

        await Utils.waitHours(12);

        await splitter.whitelistStrategy(strategy3.address, {
          from: governance,
        });

        await splitter.configureStrategies(
          [strategy3.address, strategy1.address], // strategy2 no longer active
          [5000, 5000],
          [0, 0], // no strategies are capped at this point
          [strategy2.address, strategy1.address, strategy3.address],
          // strategy2 is still included here for withdrawal order
          // but will be phased out
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

        // unwhitelisting is not allowed because funds are still present
        await expectRevert(
          splitter.unwhitelistStrategy(strategy2.address, {
            from: governance,
          }),
          "can only whitelist an empty strategy"
        );

        // Withdraw. strategy2 should be drained before strategy1 as per the withdrawal order
        // basically, the order would be: the splitter's buffer -> strategy2 -> strategy1
        await daiVault.withdraw("40000" + "000000000000000000", { from: farmer1 });
        await daiVault.withdraw("40000" + "000000000000000000", { from: farmer2 });
        Utils.assertBNEq(
          // strategy2 should have 0 by now, nothing gets re-invested into it
          await strategy2.investedUnderlyingBalance(),
          "0"
        );

        // now, can un-whitelist strategy2
        await splitter.unwhitelistStrategy(strategy2.address, {from: governance});

        // now, can adjust the withdraw order (if necessary) to exclude the old strategy
        await splitter.configureStrategies(
          [strategy3.address, strategy1.address],
          [5000, 5000],
          [0, 0],
          [strategy1.address, strategy3.address],
          // strategy2 is no longer included
          { from: governance }
        );

        // re-deposit
        await dai.approve(daiVault.address, "40000" + "000000000000000000", { from: farmer1 });
        await daiVault.deposit("40000" + "000000000000000000", { from: farmer1 });

        await dai.approve(daiVault.address, "40000" + "000000000000000000", { from: farmer2 });
        await daiVault.deposit("40000" + "000000000000000000", { from: farmer2 });

        await controller.doHardWork(daiVault.address, {from : governance});
        // re-check the total invariant
        Utils.assertBNEq(
          totalContribution,
          await daiVault.underlyingBalanceWithInvestment()
        );
        Utils.assertBNEq(
          totalContribution,
          await splitter.investedUnderlyingBalance()
        );
      });
    });
  });
});
