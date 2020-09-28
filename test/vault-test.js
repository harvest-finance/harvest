const { expectRevert, constants, time } = require("@openzeppelin/test-helpers");
const Vault = artifacts.require("Vault");
const VaultProxy = artifacts.require("VaultProxy");
const Controller = artifacts.require("Controller");
const MockToken = artifacts.require("MockToken");
const NoopStrategy = artifacts.require("NoopStrategy");
const LossStrategy = artifacts.require("LossStrategy");
const ProfitStrategy = artifacts.require("ProfitStrategy");
const MockGreyListed = artifacts.require("MockGreyListed");
const Storage = artifacts.require("Storage");
const MockUSDC = artifacts.require("MockUSDC");
const CompoundStrategy = artifacts.require("CompoundStrategy");
const MockComptroller = artifacts.require("MockComptroller");
const VaultStrategySwitchLock = artifacts.require("VaultStrategySwitchLock");
const VaultUpgradableSooner = artifacts.require("VaultUpgradableSooner");

const Utils = require("./Utils.js");
const makeVault = require("./make-vault.js");

contract("Vault Test", function (accounts) {
  describe("Deposit and Withdraw", function () {
    let governance = accounts[0];
    let controller = accounts[1];
    let farmer = accounts[2];
    let strategy = accounts[3];
    let farmerBob = accounts[4];
    let burner = accounts[9];

    let storage;
    let vault;
    let underlying;

    const tokenUnit = "1000000000000000000";
    const farmerBalance = "95848503450";
    const roundBalance = "1000000";
    const roundBalancePostLoss = "900000";
    const roundBalancePostGain = "1100000";
    const roundBalancePostGainFarmer = "1152381";
    const roundBalancePostGainFarmerBob =
      2 * roundBalancePostGain - roundBalancePostGainFarmer;

    beforeEach(async function () {
      storage = await Storage.new({ from: governance });
      await storage.setController(controller, { from: governance });
      // create the underlying token
      underlying = await MockToken.new({ from: governance });
      await underlying.mint(farmer, farmerBalance, { from: governance });
      assert.equal(
        farmerBalance,
        (await underlying.balanceOf(farmer)).toString()
      );

      // set up the vault with 100% investment
      vault = await makeVault(storage.address, underlying.address, 100, 100, {
        from: governance,
      });

      // set up the strategy
      strategy = await NoopStrategy.new(
        storage.address,
        underlying.address,
        vault.address,
        { from: governance }
      );
      await vault.setStrategy(strategy.address, { from: controller });
      assert.equal(strategy.address, await vault.strategy());
    });

    it("empty vault", async function () {
      // set up the vault with 100% investment
      vault = await makeVault(storage.address, underlying.address, 100, 100, {
        from: governance,
      });
      assert.equal("0", await vault.underlyingBalanceWithInvestment());
      await underlying.mint(vault.address, farmerBalance, { from: governance });
      assert.equal(
        farmerBalance,
        await vault.underlyingBalanceWithInvestment()
      );
    });

    it("reverts", async function () {
      const vaultImplementation = await Vault.new({
        from: governance,
      });
      const vaultAsProxy = await VaultProxy.new(vaultImplementation.address, {
        from: governance,
      });
      const vault = await Vault.at(vaultAsProxy.address);
      await expectRevert(
        vault.initializeVault(storage.address, underlying.address, 0, 0, {
          from: governance,
        }),
        "cannot divide by 0"
      );
      await expectRevert(
        vault.initializeVault(storage.address, underlying.address, 100, 1, {
          from: governance,
        }),
        "cannot invest more than 100%"
      );

      // initialize so that we can call functions
      await vault.initializeVault(storage.address, underlying.address, 100, 100, {
        from: governance,
      });
      await expectRevert(
        vault.setVaultFractionToInvest(0, 0, {
          from: governance,
        }),
        "denominator must be greater than 0"
      );
      await expectRevert(
        vault.setVaultFractionToInvest(100, 1, {
          from: governance,
        }),
        "denominator must be greater than or equal to the numerator"
      );
      await expectRevert(
        vault.withdraw(1, {
          from: farmer,
        }),
        "Vault has no shares"
      );
      await expectRevert(
        vault.setStrategy(constants.ZERO_ADDRESS, {
          from: governance,
        }),
        "new _strategy cannot be empty"
      );
      await expectRevert(
        vault.doHardWork({
          from: governance,
        }),
        "Strategy must be defined"
      );

      // cannot initialize twice
      await expectRevert(
        vault.initializeVault(storage.address, underlying.address, 100, 100, {
          from: governance,
        }),
        "Contract instance has already been initialized"
      );

      // only governance can schedule an upgrade
      const newerVaultImplementation = await Vault.new({
        from: governance,
      });
      await expectRevert(
        vault.scheduleUpgrade(newerVaultImplementation.address, {
          from: farmer,
        }),
        "Not governance"
      );
    });

    it("deposit and withdraw test with a token of 6 decimals", async function () {
      const usdcTokenUnit = "1000000";
      const usdcUnderlying = await MockUSDC.new({ from: governance });

      await usdcUnderlying.mint(farmer, farmerBalance, { from: governance });
      assert.equal(
        farmerBalance,
        (await usdcUnderlying.balanceOf(farmer)).toString()
      );

      // set up the vault with 100% investment
      const usdcVault = await makeVault(storage.address, usdcUnderlying.address, 100, 100, {
        from: governance,
      });

      // set up the strategy
      strategy = await NoopStrategy.new(
        storage.address,
        usdcUnderlying.address,
        usdcVault.address,
        { from: governance }
      );
      await usdcVault.setStrategy(strategy.address, { from: controller });

      assert.equal(usdcTokenUnit, await usdcVault.getPricePerFullShare());
      await usdcUnderlying.approve(usdcVault.address, farmerBalance, { from: farmer });
      await usdcVault.deposit(farmerBalance, { from: farmer });
      assert.equal(farmerBalance, await usdcVault.balanceOf(farmer));
      assert.equal(
        farmerBalance,
        await usdcVault.underlyingBalanceWithInvestmentForHolder(farmer)
      );
      assert.equal(0, await usdcUnderlying.balanceOf(farmer));
      assert.equal(farmerBalance, await usdcVault.availableToInvestOut());
      assert.equal(farmerBalance, await usdcVault.underlyingBalanceInVault());
      assert.equal(usdcTokenUnit, await usdcVault.getPricePerFullShare());

      await usdcVault.withdraw(farmerBalance, { from: farmer });
      assert.equal(farmerBalance, await usdcUnderlying.balanceOf(farmer));
      assert.equal(0, await usdcVault.balanceOf(farmer));
      assert.equal(0, await usdcVault.availableToInvestOut());
      assert.equal(0, await usdcVault.underlyingBalanceInVault());
      assert.equal(
        0,
        await usdcVault.underlyingBalanceWithInvestmentForHolder(farmer)
      );
      assert.equal(usdcTokenUnit, await usdcVault.getPricePerFullShare());
    });

    it("deposit and withdraw test", async function () {
      assert.equal(tokenUnit, await vault.getPricePerFullShare());
      await underlying.approve(vault.address, farmerBalance, { from: farmer });
      await expectRevert(
        vault.deposit(0, {
          from: farmer,
        }),
        "Cannot deposit 0"
      );
      await expectRevert(
        vault.depositFor(farmerBalance, constants.ZERO_ADDRESS, {
          from: farmer,
        }),
        "holder must be defined"
      );
      await vault.deposit(farmerBalance, { from: farmer });
      assert.equal(farmerBalance, await vault.balanceOf(farmer));
      assert.equal(
        farmerBalance,
        await vault.underlyingBalanceWithInvestmentForHolder(farmer)
      );
      assert.equal(0, await underlying.balanceOf(farmer));
      assert.equal(farmerBalance, await vault.availableToInvestOut());
      assert.equal(farmerBalance, await vault.underlyingBalanceInVault());
      assert.equal(tokenUnit, await vault.getPricePerFullShare());

      await expectRevert(
        vault.withdraw(0, {
          from: farmer,
        }),
        "numberOfShares must be greater than 0"
      );

      await vault.withdraw(farmerBalance, { from: farmer });
      assert.equal(farmerBalance, await underlying.balanceOf(farmer));
      assert.equal(0, await vault.balanceOf(farmer));
      assert.equal(0, await vault.availableToInvestOut());
      assert.equal(0, await vault.underlyingBalanceInVault());
      assert.equal(
        0,
        await vault.underlyingBalanceWithInvestmentForHolder(farmer)
      );
      assert.equal(tokenUnit, await vault.getPricePerFullShare());
    });

    it("deposit for and withdraw test", async function () {
      assert.equal(tokenUnit, await vault.getPricePerFullShare());
      await underlying.approve(vault.address, farmerBalance, { from: farmer });
      await vault.depositFor(farmerBalance, farmerBob, { from: farmer });
      assert.equal(farmerBalance, await vault.balanceOf(farmerBob));
      assert.equal(
        farmerBalance,
        await vault.underlyingBalanceWithInvestmentForHolder(farmerBob)
      );
      assert.equal(0, await vault.balanceOf(farmer));
      assert.equal(0, await underlying.balanceOf(farmer));
      assert.equal(farmerBalance, await vault.availableToInvestOut());
      assert.equal(farmerBalance, await vault.underlyingBalanceInVault());
      assert.equal(tokenUnit, await vault.getPricePerFullShare());

      await vault.withdraw(farmerBalance, { from: farmerBob });
      assert.equal(farmerBalance, await underlying.balanceOf(farmerBob));
      assert.equal(0, await vault.balanceOf(farmerBob));
      assert.equal(0, await vault.availableToInvestOut());
      assert.equal(0, await vault.underlyingBalanceInVault());
      assert.equal(
        0,
        await vault.underlyingBalanceWithInvestmentForHolder(farmer)
      );
      assert.equal(tokenUnit, await vault.getPricePerFullShare());
    });

    it("withdraw all to vault", async function () {
      await underlying.approve(vault.address, farmerBalance, { from: farmer });
      await vault.depositFor(farmerBalance, farmerBob, { from: farmer });
      assert.equal(farmerBalance, await vault.balanceOf(farmerBob));
      assert.equal(
        farmerBalance,
        await vault.underlyingBalanceWithInvestmentForHolder(farmerBob)
      );
      assert.equal(0, await vault.balanceOf(farmer));

      await expectRevert(
        vault.withdrawAll({ from: farmerBob }),
        "The caller must be controller or governance"
      );

      await vault.withdrawAll({ from: governance });
      assert.equal(farmerBalance, await underlying.balanceOf(vault.address));
      assert.equal(farmerBalance, await vault.underlyingBalanceInVault());
    });

    it("dohardwork test", async function () {
      // no fail on 0 balance to invest
      await vault.doHardWork({ from: governance });

      // deposit some tokens
      await underlying.approve(vault.address, farmerBalance, { from: farmer });
      await vault.deposit(farmerBalance, { from: farmer });
      assert.equal(farmerBalance, await vault.balanceOf(farmer));
      assert.equal(0, await underlying.balanceOf(farmer));
      assert.equal(farmerBalance, await vault.availableToInvestOut());
      assert.equal(farmerBalance, await vault.underlyingBalanceInVault());
      assert.equal(
        farmerBalance,
        await vault.underlyingBalanceWithInvestmentForHolder(farmer)
      );

      // make the investment
      await vault.doHardWork({ from: controller });
      assert.equal(farmerBalance, await vault.balanceOf(farmer));
      assert.equal(0, await vault.availableToInvestOut());
      assert.equal(0, await vault.underlyingBalanceInVault());
      assert.equal(
        farmerBalance,
        await vault.underlyingBalanceWithInvestmentForHolder(farmer)
      );

      // withdraw after the investment
      await vault.withdraw(farmerBalance, { from: farmer });
      assert.equal(farmerBalance, await underlying.balanceOf(farmer));
      assert.equal(0, await vault.balanceOf(farmer));
      assert.equal(0, await vault.availableToInvestOut());
      assert.equal(0, await vault.underlyingBalanceInVault());
      assert.equal(
        0,
        await vault.underlyingBalanceWithInvestmentForHolder(farmer)
      );
    });

    it("invest test with a loss", async function () {
      // set up the strategy
      strategy = await LossStrategy.new(
        storage.address,
        underlying.address,
        vault.address,
        { from: governance }
      );
      await vault.setStrategy(strategy.address, { from: controller });

      // reset token balance
      await underlying.transfer(burner, farmerBalance, { from: farmer });
      await underlying.mint(farmer, roundBalance, { from: governance });
      assert.equal(roundBalance, await underlying.balanceOf(farmer));

      // deposit some tokens
      await underlying.approve(vault.address, roundBalance, { from: farmer });
      await vault.deposit(roundBalance, { from: farmer });
      assert.equal(roundBalance, await vault.balanceOf(farmer));
      assert.equal(0, await underlying.balanceOf(farmer));
      assert.equal(roundBalance, await vault.availableToInvestOut());
      assert.equal(roundBalance, await vault.underlyingBalanceInVault());
      assert.equal(
        roundBalance,
        await vault.underlyingBalanceWithInvestmentForHolder(farmer)
      );

      // make the investment
      await vault.doHardWork({ from: controller });
      assert.equal(roundBalance, await vault.balanceOf(farmer));
      assert.equal(0, await vault.availableToInvestOut());
      assert.equal(0, await vault.underlyingBalanceInVault());
      assert.equal(
        roundBalancePostLoss,
        await vault.underlyingBalanceWithInvestment()
      );
      assert.equal(tokenUnit * 0.9, await vault.getPricePerFullShare());
      assert.equal(
        roundBalancePostLoss,
        await vault.underlyingBalanceWithInvestmentForHolder(farmer)
      );

      // withdraw after the investment
      await vault.withdraw(roundBalance, { from: farmer });
      assert.equal(roundBalancePostLoss, await underlying.balanceOf(farmer));
      assert.equal(0, await vault.balanceOf(farmer));
      assert.equal(0, await vault.availableToInvestOut());
      assert.equal(0, await vault.underlyingBalanceInVault());
      assert.equal(tokenUnit, await vault.getPricePerFullShare());
      assert.equal(
        0,
        await vault.underlyingBalanceWithInvestmentForHolder(farmer)
      );
    });

    it("2x invest test with a loss", async function () {
      // set up the strategy
      strategy = await LossStrategy.new(
        storage.address,
        underlying.address,
        vault.address,
        { from: governance }
      );
      await vault.setStrategy(strategy.address, { from: controller });

      // reset token balance
      await underlying.transfer(burner, farmerBalance, { from: farmer });
      await underlying.mint(farmer, roundBalance, { from: governance });
      assert.equal(roundBalance, await underlying.balanceOf(farmer));
      await underlying.mint(farmerBob, roundBalance, { from: governance });
      assert.equal(roundBalance, await underlying.balanceOf(farmerBob));

      // deposit some tokens for both farmers
      await underlying.approve(vault.address, roundBalance, { from: farmer });
      await vault.deposit(roundBalance, { from: farmer });
      await underlying.approve(vault.address, roundBalance, {
        from: farmerBob,
      });
      await vault.deposit(roundBalance, { from: farmerBob });

      // make the investment
      await vault.doHardWork({ from: controller });
      assert.equal(roundBalance, await vault.balanceOf(farmer));
      assert.equal(roundBalance, await vault.balanceOf(farmerBob));
      assert.equal(0, await vault.availableToInvestOut());
      assert.equal(0, await vault.underlyingBalanceInVault());
      assert.equal(
        roundBalancePostLoss * 2,
        await vault.underlyingBalanceWithInvestment()
      );

      // withdraw after the investment for farmer
      await vault.withdraw(roundBalance, { from: farmer });
      assert.equal(roundBalancePostLoss, await underlying.balanceOf(farmer));
      assert.equal(0, await vault.balanceOf(farmer));

      // withdraw after the investment for farmerBob, the strategy eats another 10%
      await vault.withdraw(roundBalance, { from: farmerBob });
      assert.equal(roundBalancePostLoss, await underlying.balanceOf(farmerBob));
      assert.equal(0, await vault.balanceOf(farmerBob));

      // the vault has nothing
      assert.equal(0, await vault.availableToInvestOut());
      assert.equal(0, await vault.underlyingBalanceInVault());
    });

    it("2x invest test with a profit", async function () {
      // set up the strategy
      strategy = await ProfitStrategy.new(
        storage.address,
        underlying.address,
        vault.address,
        { from: governance }
      );
      underlying.addMinter(strategy.address, { from: governance });
      await vault.setStrategy(strategy.address, { from: controller });

      // reset token balance
      await underlying.transfer(burner, farmerBalance, { from: farmer });
      await underlying.mint(farmer, roundBalance, { from: governance });
      assert.equal(roundBalance, await underlying.balanceOf(farmer));
      await underlying.mint(farmerBob, roundBalance, { from: governance });
      assert.equal(roundBalance, await underlying.balanceOf(farmerBob));

      // deposit some tokens for one farmer, will receive 1x shares
      await underlying.approve(vault.address, roundBalance, { from: farmer });
      await vault.deposit(roundBalance, { from: farmer });
      assert.equal(roundBalance, await vault.balanceOf(farmer));

      // make the investment
      await vault.doHardWork({ from: controller });
      assert.equal(roundBalance, await vault.balanceOf(farmer));
      assert.equal(roundBalance, await vault.totalSupply());
      assert.equal(0, await vault.underlyingBalanceInVault());
      assert.equal(
        roundBalancePostGain,
        await vault.underlyingBalanceWithInvestment()
      );
      assert.equal(
        roundBalancePostGain,
        await vault.underlyingBalanceWithInvestmentForHolder(farmer)
      );
      assert.equal(
        Math.trunc(tokenUnit) + tokenUnit / 10,
        await vault.getPricePerFullShare()
      );

      // deposit tokens for farmer Bob, will get 1:1.1 shares
      await underlying.approve(vault.address, roundBalance, {
        from: farmerBob,
      });
      await vault.deposit(roundBalance, { from: farmerBob });
      let totalSupply = roundBalance;
      let currentValue = roundBalancePostGain;
      let expectedShares = Math.trunc(
        roundBalance * (totalSupply / currentValue)
      );
      assert.equal(expectedShares, await vault.balanceOf(farmerBob));

      // make the investment
      await vault.doHardWork({ from: controller });
      assert.equal(expectedShares, await vault.balanceOf(farmerBob));
      assert.equal(
        expectedShares + Math.trunc(roundBalance),
        await vault.totalSupply()
      );
      assert.equal(0, await vault.underlyingBalanceInVault());
      assert.equal(
        roundBalancePostGain * 2,
        await vault.underlyingBalanceWithInvestment()
      );
      assert.equal(
        Math.trunc(
          (expectedShares * roundBalancePostGain * 2) /
            (expectedShares + Math.trunc(roundBalance))
        ),
        await vault.underlyingBalanceWithInvestmentForHolder(farmerBob)
      );

      // withdraw after the investment for farmer
      await vault.withdraw(roundBalance, { from: farmer });
      assert.equal(
        roundBalancePostGainFarmer,
        await underlying.balanceOf(farmer)
      );
      assert.equal(0, await vault.balanceOf(farmer));

      // withdraw after the investment for farmerBob, the strategy eats another 10%
      await vault.withdraw(expectedShares, { from: farmerBob });
      assert.equal(
        roundBalancePostGainFarmerBob,
        await underlying.balanceOf(farmerBob)
      );
      assert.equal(0, await vault.balanceOf(farmerBob));

      // the vault has nothing
      assert.equal(0, await vault.availableToInvestOut());
      assert.equal(0, await vault.underlyingBalanceInVault());
      assert.equal(tokenUnit, await vault.getPricePerFullShare());
      assert.equal(
        0,
        await vault.underlyingBalanceWithInvestmentForHolder(farmer)
      );
    });

    it("setting investment ratio", async function () {
      await vault.setVaultFractionToInvest(50, 100);
      // reset token balance
      await underlying.transfer(burner, farmerBalance, { from: farmer });
      await underlying.mint(farmer, roundBalance, { from: governance });
      assert.equal(roundBalance, await underlying.balanceOf(farmer));

      // deposit some tokens for one farmer, will receive 1x shares
      await underlying.approve(vault.address, roundBalance, { from: farmer });
      await vault.deposit(roundBalance, { from: farmer });
      assert.equal(roundBalance, await vault.balanceOf(farmer));

      // check pre-investment and post-investment
      assert.equal(roundBalance / 2, await vault.availableToInvestOut());
      assert.equal(roundBalance, await vault.underlyingBalanceInVault());
      await vault.doHardWork({ from: governance });
      assert.equal(0, await vault.availableToInvestOut());
      assert.equal(roundBalance / 2, await vault.underlyingBalanceInVault());
    });

    it("Greylist effective on smart contract, but not on EOA", async function () {
      // set up controller
      const controller = await Controller.new(storage.address, governance, {
        from: governance,
      });
      await storage.setController(controller.address, { from: governance });

      // set up the vault with 100% investment
      vault = await makeVault(storage.address, underlying.address, 100, 100, {
        from: governance,
      });

      // set up the strategy
      strategy = await NoopStrategy.new(
        storage.address,
        underlying.address,
        vault.address,
        { from: governance }
      );

      // link vault with strategy
      await controller.addVaultAndStrategy(vault.address, strategy.address);

      // setup complete, now start the test

      let mockDepositBalance = 10000;
      mockGreyListed = await MockGreyListed.new(vault.address, {
        from: governance,
      });
      // mint 2 times the deposit balance to try to deposit twice
      await underlying.mint(mockGreyListed.address, 2 * mockDepositBalance, {
        from: governance,
      });

      // the controller did not greylist our contract yet.
      assert.equal(await controller.greyList(mockGreyListed.address), false);

      // should go through the first time
      await mockGreyListed.deposit(underlying.address, mockDepositBalance);
      assert.equal(
        mockDepositBalance,
        await vault.balanceOf(mockGreyListed.address)
      );

      // greylist the smart contract `mockGreyListed`
      await controller.addToGreyList(mockGreyListed.address);

      // should not go through
      await expectRevert(
        mockGreyListed.deposit(underlying.address, mockDepositBalance),
        "This smart contract has been grey listed"
      );
      assert.equal(
        mockDepositBalance,
        await vault.balanceOf(mockGreyListed.address)
      );

      // remove from greylist
      await controller.removeFromGreyList(mockGreyListed.address);

      // should go through
      await mockGreyListed.deposit(underlying.address, mockDepositBalance);
      assert.equal(
        2 * mockDepositBalance,
        await vault.balanceOf(mockGreyListed.address)
      );

      // greylist an EOA human `farmer`
      await controller.addToGreyList(farmer);
      // deposit some tokens for one farmer
      await underlying.approve(vault.address, farmerBalance, { from: farmer });
      await vault.deposit(farmerBalance, { from: farmer });

      // EOA human farmer could still bypass greylist
      assert.equal(farmerBalance, await vault.balanceOf(farmer));
    });

    describe("Upgradability test", function() {
      // ensures that deposits are intact after an upgrade
      // and that the strategy can no longer be changed in the upgraded vault
      // (to confirm the behavior changed after an upgrade)
      let vault, vaultAsProxy, vaultImplementation, vaultUpgradableSoonerImpl;
      const shorterDelay = 100; // seconds

      it("Interaction with vault being upgraded", async function () {
        vaultImplementation = await VaultUpgradableSooner.new({
          from: governance,
        });
        vaultAsProxy = await VaultProxy.new(vaultImplementation.address, {
          from: governance,
        });

        // making the vault upgradable faster
        vault = await Vault.at(vaultAsProxy.address);
        await vault.initializeVault(storage.address, underlying.address, 100, 100, {
          from: governance,
        });
        vaultUpgradableSoonerImpl = await VaultUpgradableSooner.at(vaultAsProxy.address);
        await vaultUpgradableSoonerImpl.overrideNextImplementationDelay(shorterDelay);

        // set up the strategy
        strategy = await ProfitStrategy.new(
          storage.address,
          underlying.address,
          vault.address,
          { from: governance }
        );
        underlying.addMinter(strategy.address, { from: governance });

        await vault.setStrategy(strategy.address, { from: controller });

        // reset token balance
        await underlying.transfer(burner, farmerBalance, { from: farmer });
        await underlying.mint(farmer, roundBalance, { from: governance });
        assert.equal(roundBalance, await underlying.balanceOf(farmer));
        await underlying.mint(farmerBob, roundBalance, { from: governance });
        assert.equal(roundBalance, await underlying.balanceOf(farmerBob));

        // deposit some tokens for one farmer, will receive 1x shares
        await underlying.approve(vault.address, roundBalance, { from: farmer });
        await vault.deposit(roundBalance, { from: farmer });
        assert.equal(roundBalance, await vault.balanceOf(farmer));

        // okay, the balances are in. Now, scheduling upgrades

        // initially, shouldUpgrade is false
        let shouldUpgrade = await vault.shouldUpgrade();
        assert.equal(false, shouldUpgrade[0]);
        assert.equal("0x0000000000000000000000000000000000000000", shouldUpgrade[1]);

        newVault = await VaultStrategySwitchLock.new({
          from: governance,
        });

        await vault.scheduleUpgrade(newVault.address, {
          from: governance,
        });

        shouldUpgrade = await vault.shouldUpgrade();
        assert.equal(false, shouldUpgrade[0]);
        assert.equal(newVault.address, shouldUpgrade[1]);

        // upgrading now would fail:

        await expectRevert(
          vaultAsProxy.upgrade({
           from: governance,
         }),
          "Upgrade not scheduled"
        );

        assert.equal(vaultImplementation.address, await vaultAsProxy.implementation());

        // advancing time to whenever it is possible to upgrade
        await Utils.advanceNBlock(Math.round(shorterDelay / 15) + 1);

        // now, shouldUpgrade is true
        shouldUpgrade = await vault.shouldUpgrade();
        assert.equal(true, shouldUpgrade[0]);
        assert.equal(newVault.address, shouldUpgrade[1]);

        // Upgrading!!!
        assert.equal(vaultImplementation.address, await vaultAsProxy.implementation());
        await vaultAsProxy.upgrade({
          from: governance,
        });
        assert.equal(newVault.address, await vaultAsProxy.implementation());

        /* After this, the vault should be upgraded */
        // checking that the behaviour has actually changed
        await expectRevert(
          vault.setStrategy(strategy.address, {
           from: governance,
         }),
          "Strategy change not allowed"
        );

        // now, shouldUpgrade is back to false
        shouldUpgrade = await vault.shouldUpgrade();
        assert.equal(false, shouldUpgrade[0]);
        assert.equal("0x0000000000000000000000000000000000000000", shouldUpgrade[1]);

        // Continue interactions as before
        // The following is copy-paste from the Profit test above

        await vault.doHardWork({ from: controller });
        assert.equal(roundBalance, await vault.balanceOf(farmer));
        assert.equal(roundBalance, await vault.totalSupply());
        assert.equal(0, await vault.underlyingBalanceInVault());
        assert.equal(
          roundBalancePostGain,
          await vault.underlyingBalanceWithInvestment()
        );
        assert.equal(
          roundBalancePostGain,
          await vault.underlyingBalanceWithInvestmentForHolder(farmer)
        );
        assert.equal(
          Math.trunc(tokenUnit) + tokenUnit / 10,
          await vault.getPricePerFullShare()
        );

        // deposit tokens for farmer Bob, will get 1:1.1 shares
        await underlying.approve(vault.address, roundBalance, {
          from: farmerBob,
        });
        await vault.deposit(roundBalance, { from: farmerBob });
        let totalSupply = roundBalance;
        let currentValue = roundBalancePostGain;
        let expectedShares = Math.trunc(
          roundBalance * (totalSupply / currentValue)
        );
        assert.equal(expectedShares, await vault.balanceOf(farmerBob));

        // make the investment
        await vault.doHardWork({ from: controller });
        assert.equal(expectedShares, await vault.balanceOf(farmerBob));
        assert.equal(
          expectedShares + Math.trunc(roundBalance),
          await vault.totalSupply()
        );
        assert.equal(0, await vault.underlyingBalanceInVault());
        assert.equal(
          roundBalancePostGain * 2,
          await vault.underlyingBalanceWithInvestment()
        );
        assert.equal(
          Math.trunc(
            (expectedShares * roundBalancePostGain * 2) /
              (expectedShares + Math.trunc(roundBalance))
          ),
          await vault.underlyingBalanceWithInvestmentForHolder(farmerBob)
        );

        // withdraw after the investment for farmer
        await vault.withdraw(roundBalance, { from: farmer });
        assert.equal(
          roundBalancePostGainFarmer,
          await underlying.balanceOf(farmer)
        );
        assert.equal(0, await vault.balanceOf(farmer));

        // withdraw after the investment for farmerBob, the strategy eats another 10%
        await vault.withdraw(expectedShares, { from: farmerBob });
        assert.equal(
          roundBalancePostGainFarmerBob,
          await underlying.balanceOf(farmerBob)
        );
        assert.equal(0, await vault.balanceOf(farmerBob));

        // the vault has nothing
        assert.equal(0, await vault.availableToInvestOut());
        assert.equal(0, await vault.underlyingBalanceInVault());
        assert.equal(tokenUnit, await vault.getPricePerFullShare());
        assert.equal(
          0,
          await vault.underlyingBalanceWithInvestmentForHolder(farmer)
        );
      });
    });
  });
});
