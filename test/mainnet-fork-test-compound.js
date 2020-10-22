// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Controller = artifacts.require("Controller");
  const Vault = artifacts.require("Vault");
  const Storage = artifacts.require("Storage");
  const CompoundStrategy = artifacts.require("CompoundStrategy");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  // Compound Comptroller
  // const Comptroller = artifacts.require("Comptroller");
  // UniswapV2 Router
  const UniswapV2Router02 = artifacts.require("UniswapV2Router02");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract.skip("Mainnet Compound", function(accounts){
    describe("Compound savings", function (){

      // external contracts
      let comptroller;
      let uniswapV2Router02;
      let cdai;
      let dai;
      let usdt = accounts[8];
      let comp;

      // external setup
      let daiWhale = MFC.DAI_WHALE_ADDRESS;

      // parties in the protocol
      let governance = accounts[1];
      let rewardCollector = accounts[2];
      let farmer1 = accounts[3];
      let farmer2 = accounts[4];

      // numbers used in tests
      const farmerBalance = "3000000" + "000000000000000000";

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let storage;
      let controller;
      let vault;
      let strategy;

      async function setupExternalContracts() {
        comptroller = await Comptroller.at(MFC.COMPTROLLER_ADDRESS);
        uniswapV2Router02 = await UniswapV2Router02.at(MFC.UNISWAP_V2_ROUTER02_ADDRESS);
        cdai = await IERC20.at(MFC.CDAI_ADDRESS);
        dai = await IERC20.at(MFC.DAI_ADDRESS);
        comp = await IERC20.at(MFC.COMP_ADDRESS);
      }

      async function resetDaiBalance() {
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, daiWhale, "100000000000000000000");
        // reset token balance
        await dai.transfer(daiWhale, await dai.balanceOf(farmer1), {from: farmer1});
        await dai.transfer(daiWhale, await dai.balanceOf(farmer2), {from: farmer2});
        await dai.transfer(farmer1, farmerBalance, {from: daiWhale});
        await dai.transfer(farmer2, farmerBalance, {from: daiWhale});
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

        // set up the vault with 100% investment
        vault = await Vault.new(storage.address, dai.address, 95, 100, {from: governance});

        // set up the strategy
        strategy = await CompoundStrategy.new(
          storage.address,
          dai.address,
          cdai.address,
          vault.address,
          comptroller.address,
          comp.address,
          uniswapV2Router02.address,
          { from: governance }
        );

        // link vault with strategy
        await controller.addVaultAndStrategy(vault.address, strategy.address, {from: governance});
        // todo: the test fails with 70% ratio; try more parameters
        // setting 60% to go to Compound with 2% tolerance
        await strategy.setRatio(60, 100, 2, {from : governance});
      }

      beforeEach(async function () {
        await setupExternalContracts();
        await setupCoreProtocol();
        await resetDaiBalance();
      });

      async function depositVault(_farmer, _underlying, _vault, _amount) {
        await _underlying.approve(_vault.address, _amount, { from: _farmer });
        await _vault.deposit(_amount, { from: _farmer });
        assert.equal(_amount, await vault.balanceOf(_farmer));
        assert.equal(_amount, await vault.getContributions(_farmer));
      }

      it("A farmer investing dai", async function () {
        let farmerOldBalance = new BigNumber(await dai.balanceOf(farmer1));
        await depositVault(farmer1, dai, vault, farmerBalance);
        await vault.invest({from: governance});
        await Utils.advanceNBlock(100);
        await strategy.doHardWork({from: governance});
        await Utils.advanceNBlock(100);
        await strategy.doHardWork({from: governance});
        await Utils.advanceNBlock(100);
        await strategy.doHardWork({from: governance});
        // todo: run the test with multiple parameters
        await vault.withdraw(farmerBalance, {from: farmer1});
        let farmerNewBalance = new BigNumber(await dai.balanceOf(farmer1));
        Utils.assertBNGt(farmerNewBalance, farmerOldBalance);
        console.log(farmerNewBalance.toString());
        console.log(farmerOldBalance.toString());
      });

    });
  });
}
