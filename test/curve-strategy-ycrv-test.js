const Utils = require("./Utils.js");
const { expectRevert, send } = require("@openzeppelin/test-helpers");
const BigNumber = require("bignumber.js");
const Controller = artifacts.require("Controller");
const Vault = artifacts.require("Vault");
const Storage = artifacts.require("Storage");
const CRVStrategyYCRV = artifacts.require("CRVStrategyYCRV");

// Mocks
const MockToken = artifacts.require("MockToken");
const MockCurveFi = artifacts.require("MockCurveFi");
const MockGauge = artifacts.require("MockGauge");
const MockMintr = artifacts.require("MockMintr");

// ERC20 interface
const IERC20 = artifacts.require("IERC20");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

BigNumber.config({ DECIMAL_PLACES: 0 });

contract("Curve Strategy YCRV Unit Test", function (accounts) {
  describe("Curve savings", function () {
    // external contracts
    const dai = ZERO_ADDRESS;
    const weth = ZERO_ADDRESS;
    const uniswap = ZERO_ADDRESS;
    const yVault = ZERO_ADDRESS;

    let crv;
    let yDai;
    let curveFi;
    let ycrv;
    let gauge;
    let mintr;

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
    let ycrvStrategy;

    async function setupExternalContracts() {
      crv = await MockToken.new({ from: governance });
      yDai = await MockToken.new({ from: governance });
      curveFi = await MockCurveFi.new(yDai.address, 0, { from: governance });
      ycrv = await MockToken.new({ from: governance });
      await curveFi.setYcrv(ycrv.address);
      gauge = await MockGauge.new(ycrv.address, { from: governance });

      mintr = await MockMintr.new({ from: governance });
    }

    async function resetYCrvBalance() {
      // reset token balance
      await ycrv.burn(await ycrv.balanceOf(farmer1), {
        from: farmer1,
      });
      await ycrv.burn(await ycrv.balanceOf(farmer2), {
        from: farmer2,
      });
      await ycrv.mint(farmer1, farmerBalance, { from: governance });
      await ycrv.mint(farmer2, farmerBalance, { from: governance });
      assert.equal(farmerBalance, await ycrv.balanceOf(farmer1));
    }

    async function setupCoreProtocol() {
      // deploy storage
      storage = await Storage.new({ from: governance });

      // set up controller
      controller = await Controller.new(storage.address, rewardCollector, {
        from: governance,
      });

      await storage.setController(controller.address, { from: governance });

      // set up the ycrvVault with 98% investment
      ycrvVault = await Vault.new(storage.address, ycrv.address, 98, 100, {
        from: governance,
      });

      // set up the strategies
      ycrvStrategy = await CRVStrategyYCRV.new(
        storage.address,
        ycrvVault.address,
        ycrv.address,
        gauge.address,
        mintr.address,
        crv.address,
        curveFi.address,
        weth,
        dai,
        yDai.address,
        uniswap,
        { from: governance }
      );

      // link vaults with strategies
      await controller.addVaultAndStrategy(
        ycrvVault.address,
        ycrvStrategy.address,
        { from: governance }
      );
    }

    beforeEach(async function () {
      await setupExternalContracts();
      await setupCoreProtocol();
      await resetYCrvBalance();
    });

    async function depositVault(_farmer, _underlying, _vault, _amount) {
      await _underlying.approve(_vault.address, _amount, { from: _farmer });
      await _vault.deposit(_amount, { from: _farmer });
      assert.equal(_amount, await _vault.balanceOf(_farmer));
    }

    it("A farmer investing dai", async function () {
      let farmerOldBalance = new BigNumber(await ycrv.balanceOf(farmer1));
      await depositVault(farmer1, ycrv, ycrvVault, farmerBalance);
      await Utils.advanceNBlock(100);
      await controller.doHardWork(ycrvVault.address, {from : governance});
      await Utils.advanceNBlock(100);
      await controller.doHardWork(ycrvVault.address, {from : governance});
      await Utils.advanceNBlock(100);
      await controller.doHardWork(ycrvVault.address, {from : governance});
      await ycrvVault.withdraw(farmerBalance, { from: farmer1 });
      let farmerNewBalance = new BigNumber(await ycrv.balanceOf(farmer1));
      Utils.assertBNEq(farmerNewBalance, farmerOldBalance);
    });
  });
});
