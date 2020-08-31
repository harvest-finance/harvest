const { expectRevert } = require("@openzeppelin/test-helpers");
const Vault = artifacts.require("Vault");
const Controller = artifacts.require("Controller");
const MockToken = artifacts.require("MockToken");
const Storage = artifacts.require("Storage");
const DepositHelper = artifacts.require("DepositHelper");
const NoopStrategy = artifacts.require("NoopStrategy");
const ThirdPartyContractThatCallsDepositHelper = artifacts.require("ThirdPartyContractThatCallsDepositHelper");


contract("Deposit Helper Test", function (accounts) {
  describe("depositAll", function () {
    let governance = accounts[0];
    let rewardCollector = accounts[1];
    let farmer = accounts[2];

    let storage;
    let controller;

    let vaultDAI;
    let underlyingDAI;

    let vaultUSDC;
    let underlyingUSDC;

    let depositHelper;

    const tokenUnit = "1000000000000000000";
    const farmerBalanceDAI = "10000";
    const farmerBalanceUSDC = "20000";

    beforeEach(async function () {
      storage = await Storage.new({ from: governance });
      controller = await Controller.new(storage.address, rewardCollector, { from: governance });
      await storage.setController(controller.address, { from: governance });
      // create the underlying token
      underlyingDAI = await MockToken.new({ from: governance });
      await underlyingDAI.mint(farmer, farmerBalanceDAI, { from: governance });
      assert.equal(
        farmerBalanceDAI,
        (await underlyingDAI.balanceOf(farmer)).toString()
      );

      underlyingUSDC = await MockToken.new({ from: governance });
      await underlyingUSDC.mint(farmer, farmerBalanceUSDC, { from: governance });
      assert.equal(
        farmerBalanceUSDC,
        (await underlyingUSDC.balanceOf(farmer)).toString()
      );

      vaultDAI = await Vault.new(storage.address, underlyingDAI.address, 100, 100, {
        from: governance,
      });

      const strategyDAI = await NoopStrategy.new(
        storage.address,
        underlyingDAI.address,
        vaultDAI.address,
        { from: governance }
      );

      await controller.addVaultAndStrategy(
        vaultDAI.address,
        strategyDAI.address, {
          from: governance,
        }
      );

      vaultUSDC = await Vault.new(storage.address, underlyingUSDC.address, 100, 100, {
        from: governance,
      });

      const strategyUSDC = await NoopStrategy.new(
        storage.address,
        underlyingUSDC.address,
        vaultUSDC.address,
        { from: governance }
      );

      await controller.addVaultAndStrategy(
        vaultUSDC.address,
        strategyUSDC.address, {
          from: governance,
        }
      );

      depositHelper = await DepositHelper.new(storage.address, {
        from: governance,
      });
    });

    it("successful deposit for two vaults", async function () {
      const amountDAI = "1000";
      const amountUSDC = "1000";
      await underlyingDAI.approve(depositHelper.address, amountDAI, { from: farmer });
      await underlyingUSDC.approve(depositHelper.address, amountUSDC, { from: farmer });

      await depositHelper.depositAll(
        [amountDAI, amountUSDC],
        [vaultDAI.address, vaultUSDC.address],
        { from: farmer });

      assert.equal(amountDAI, await vaultDAI.balanceOf(farmer));
      assert.equal(amountUSDC, await vaultUSDC.balanceOf(farmer));
    });

    it("successful deposit for two vaults, an account is greylisted but not a contract", async function () {
      const amountDAI = "1000";
      const amountUSDC = "1000";
      await underlyingDAI.approve(depositHelper.address, amountDAI, { from: farmer });
      await underlyingUSDC.approve(depositHelper.address, amountUSDC, { from: farmer });
      await controller.addToGreyList(farmer);

      await depositHelper.depositAll(
        [amountDAI, amountUSDC],
        [vaultDAI.address, vaultUSDC.address],
        { from: farmer });

      assert.equal(amountDAI, await vaultDAI.balanceOf(farmer));
      assert.equal(amountUSDC, await vaultUSDC.balanceOf(farmer));
    });

    it("unsuccessful due to lack of approval", async function () {
      const amountDAI = "1000";
      const amountUSDC = "1000";
      await underlyingDAI.approve(depositHelper.address, amountDAI, { from: farmer });
      await underlyingUSDC.approve(depositHelper.address, amountUSDC / 2, { from: farmer });

      await expectRevert(
        depositHelper.depositAll(
          [amountDAI, amountUSDC],
          [vaultDAI.address, vaultUSDC.address],
          { from: farmer }),
        "SafeERC20: low-level call failed -- Reason given: SafeERC20: low-level call failed."
      );
    });

    it("unsuccessful due to length mismatch", async function () {
      const amountDAI = "1000";
      const amountUSDC = "1000";
      await underlyingDAI.approve(depositHelper.address, amountDAI, { from: farmer });
      await underlyingUSDC.approve(depositHelper.address, amountUSDC / 2, { from: farmer });

      await expectRevert(
        depositHelper.depositAll(
          [amountDAI, amountUSDC],
          [vaultDAI.address, vaultUSDC.address, vaultUSDC.address],
          { from: farmer }),
        "DH: amounts and vault lengths mismatch"
      );
    });

    it("unsuccessful due to lack of balance", async function () {
      const amountDAI = "1000000";
      const amountUSDC = "10000000";
      await underlyingDAI.approve(depositHelper.address, amountDAI, { from: farmer });
      await underlyingUSDC.approve(depositHelper.address, amountUSDC / 2, { from: farmer });

      await expectRevert(
        depositHelper.depositAll(
          [amountDAI, amountUSDC],
          [vaultDAI.address, vaultUSDC.address],
          { from: farmer }),
        "SafeERC20: low-level call failed -- Reason given: SafeERC20: low-level call failed."
      );
    });

    it("unsuccessful when vault is not present", async function () {
      const amountDAI = "1000";
      const amountUSDC = "1000";
      await underlyingDAI.approve(depositHelper.address, amountDAI, { from: farmer });
      await underlyingUSDC.approve(depositHelper.address, amountUSDC, { from: farmer });

      vaultUSDC2 = await Vault.new(storage.address, underlyingUSDC.address, 100, 100, {
        from: governance,
      });

      await expectRevert(
        depositHelper.depositAll(
          [amountDAI, amountUSDC],
          [vaultDAI.address, vaultUSDC2.address],
          { from: farmer }),
        "DH: vault is not present in controller"
      );
    });

    it("unsuccessful when vault is 0", async function () {
      const amountDAI = "1000";
      const amountUSDC = "1000";
      await underlyingDAI.approve(depositHelper.address, amountDAI, { from: farmer });
      await underlyingUSDC.approve(depositHelper.address, amountUSDC, { from: farmer });

      vaultUSDC2 = await Vault.new(storage.address, underlyingUSDC.address, 100, 100, {
        from: governance,
      });

      await expectRevert(
        depositHelper.depositAll(
          [amountDAI, amountUSDC],
          [vaultDAI.address, "0x0000000000000000000000000000000000000000"],
          { from: farmer }),
        "DH: vault is not present in controller"
      );
    });

    it("unsuccessful deposit through a greylisted smart contract", async function () {
      const amountDAI = "1000";
      const amountUSDC = "1000";

      thirdPartyContract = await ThirdPartyContractThatCallsDepositHelper.new(depositHelper.address, {
        from: governance,
      });

      await underlyingDAI.mint(thirdPartyContract.address, amountDAI, {
        from: governance,
      });
      await underlyingUSDC.mint(thirdPartyContract.address, amountUSDC, {
        from: governance,
      });

      // greylist the smart contract `thirdPartyContract`
      await controller.addToGreyList(thirdPartyContract.address);

      await expectRevert(
        thirdPartyContract.depositAll(
          [amountDAI, amountUSDC],
          [vaultDAI.address, vaultUSDC.address],
          { from: farmer }),
        "DH: This smart contract has been grey listed"
      );

      // remove from greylist
      await controller.removeFromGreyList(thirdPartyContract.address);

      // now succeeds
      await thirdPartyContract.depositAll(
        [amountDAI, amountUSDC],
        [vaultDAI.address, vaultUSDC.address],
        { from: farmer }
      );
    });

    it("succeeds for all 0", async function () {
      const amountDAI = "0";
      const amountUSDC = "0";

      await depositHelper.depositAll(
        [amountDAI, amountUSDC],
        [vaultDAI.address, vaultUSDC.address],
        { from: farmer });

      assert.equal(0, await vaultDAI.balanceOf(farmer));
      assert.equal(0, await vaultUSDC.balanceOf(farmer));

      assert.equal(farmerBalanceDAI, await underlyingDAI.balanceOf(farmer));
      assert.equal(farmerBalanceUSDC, await underlyingUSDC.balanceOf(farmer));
    });
  });
});
