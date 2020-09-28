const Utils = require("./Utils.js");
const { expectRevert, send } = require("@openzeppelin/test-helpers");
const BigNumber = require("bignumber.js");
const Controller = artifacts.require("Controller");
const Vault = artifacts.require("Vault");
const Storage = artifacts.require("Storage");
const CRVStrategyStable = artifacts.require("CRVStrategyStable");
// Mocks
const NoopStrategy = artifacts.require("NoopStrategy");
const NoopVault = artifacts.require("NoopVault");
const NoopYVault = artifacts.require("NoopYVault");
const MockToken = artifacts.require("MockToken");
const MockCurveFi = artifacts.require("MockCurveFi");
const MockPriceConvertor = artifacts.require("MockPriceConvertor");
const makeVault = require("./make-vault.js");

// ERC20 interface
const IERC20 = artifacts.require("IERC20");

BigNumber.config({ DECIMAL_PLACES: 0 });

contract("Curve Strategy Stable Unit Test", function (accounts) {
  describe("Curve savings", function () {
    // external contracts
    let dai;
    let ycrv;

    // parties in the protocol
    let governance = accounts[1];
    let rewardCollector = accounts[2];
    let farmer1 = accounts[3];
    let farmer2 = accounts[4];

    // numbers used in tests
    const farmerBalance = "50000" + "000000000000000000";

    // Core protocol contracts
    let storage;
    let controller;
    let ycrvVault;
    let daiVault;
    let daiStrategy;
    let ycrvStrategy;
    let priceConvertor;

    let yVault;

    async function setupExternalContracts() {
      dai = await MockToken.new({ from: governance });
      ydai = await NoopYVault.new(dai.address, 18);
      curveFi = await MockCurveFi.new(ydai.address, 0, { from: governance });
      ycrv = await IERC20.at(await curveFi.ycrv());
    }

    async function resetDaiBalance() {
      // reset token balance
      await dai.burn(await dai.balanceOf(farmer1), {
        from: farmer1,
      });
      await dai.burn(await dai.balanceOf(farmer2), {
        from: farmer2,
      });
      await dai.mint(farmer1, farmerBalance, { from: governance });
      await dai.mint(farmer2, farmerBalance, { from: governance });
      assert.equal(farmerBalance, await dai.balanceOf(farmer1));
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
      daiVault = await makeVault(storage.address, dai.address, 90, 100, {
        from: governance,
      });

      // set up the ycrvVault with 98% investment
      ycrvVault = await makeVault(storage.address, ycrv.address, 98, 100, {
        from: governance,
      });

      // set up the strategies
      ycrvStrategy = await NoopStrategy.new(
        storage.address,
        ycrv.address,
        ycrvVault.address,
        { from: governance }
      );

      priceConvertor = await MockPriceConvertor.new();

      daiStrategy = await CRVStrategyStable.new(
        storage.address,
        dai.address, // mock dai token
        daiVault.address, // our vault for depositing dai
        ycrvVault.address, // our vault for depositing ycrv, a noop vault
        ydai.address, // noop yvault
        0, // token index for dai
        ycrv.address, // ycrv token address
        curveFi.address, // curve protocol
        priceConvertor.address, // mock convertor
        { from: governance }
      );

      // link vaults with strategies
      await controller.addVaultAndStrategy(
        daiVault.address,
        daiStrategy.address,
        { from: governance }
      );
      await controller.addVaultAndStrategy(
        ycrvVault.address,
        ycrvStrategy.address,
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

    it("A farmer investing dai", async function () {
      let farmerOldBalance = new BigNumber(await dai.balanceOf(farmer1));
      await depositVault(farmer1, dai, daiVault, farmerBalance);
      await Utils.advanceNBlock(100);
      await controller.doHardWork(daiVault.address, {from : governance});
      await Utils.advanceNBlock(100);
      await controller.doHardWork(daiVault.address, {from : governance});
      await Utils.advanceNBlock(100);
      await controller.doHardWork(daiVault.address, {from : governance});
      await daiVault.withdraw(farmerBalance, { from: farmer1 });
      let farmerNewBalance = new BigNumber(await dai.balanceOf(farmer1));
      Utils.assertBNEq(farmerNewBalance, farmerOldBalance);
    });
  });
});
