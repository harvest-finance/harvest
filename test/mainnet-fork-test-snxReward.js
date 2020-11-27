// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send, time } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Controller = artifacts.require("Controller");
  const Vault = artifacts.require("Vault");
  const Storage = artifacts.require("Storage");
  const SNXRewardStrategy = artifacts.require("SNXRewardStrategy");
  const SNXRewardInterface = artifacts.require("SNXRewardInterface");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");
  // UniswapV2 Router
  const UniswapV2Router02 = artifacts.require("UniswapV2Router02");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Mainnet SNXRewards", function(accounts){
    describe("SNXRewards earnings", function (){

      // external contracts
      let uniswapV2Router02;
      let ycrv;
      let yfii;
      let yfiiPool;

      // external setup
      let ycrvWhale = MFC.YCRV_WHALE_ADDRESS;
      let existingRoute;
      let nonExistingRoute;

      // parties in the protocol
      let governance = accounts[1];
      let rewardCollector = accounts[2];
      let farmer1 = accounts[3];
      let farmer2 = accounts[4];

      // numbers used in tests
      const farmerBalance = "30000" + "000000000000000000";

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let storage;
      let controller;
      let vault;
      let strategy;
      let strategy2;
      let feeRewardForwarder;


      async function setupExternalContracts() {
        uniswapV2Router02 = await UniswapV2Router02.at(MFC.UNISWAP_V2_ROUTER02_ADDRESS);
        ycrv = await IERC20.at(MFC.YCRV_ADDRESS);
        weth = await IERC20.at(MFC.WETH_ADDRESS);
        yfii = await IERC20.at(MFC.YFII_ADDRESS);
        yfiiPool = await SNXRewardInterface.at(MFC.YFII_POOL_ADDRESS);
        existingRoute = [MFC.YFII_ADDRESS, MFC.WETH_ADDRESS, MFC.YCRV_ADDRESS];
        nonExistingRoute = [MFC.YFII_ADDRESS];
      }

      async function resetYCRVBalance() {
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, ycrvWhale, "50000000000000000000");
        // reset token balance
        await ycrv.transfer(ycrvWhale, await ycrv.balanceOf(farmer1), {from: farmer1});
        await ycrv.transfer(ycrvWhale, await ycrv.balanceOf(farmer2), {from: farmer2});
        await ycrv.transfer(farmer1, farmerBalance, {from: ycrvWhale});
        await ycrv.transfer(farmer2, farmerBalance, {from: ycrvWhale});
        assert.equal(farmerBalance, await ycrv.balanceOf(farmer1));
      }

      async function setupCoreProtocol() {
        // deploy storage
        storage = await Storage.new({ from: governance });

        feeRewardForwarder = await FeeRewardForwarder.new(storage.address, yfii.address, MFC.UNISWAP_V2_ROUTER02_ADDRESS, { from: governance });
        // set up controller
        controller = await Controller.new(storage.address, feeRewardForwarder.address, {
          from: governance,
        });

        await storage.setController(controller.address, { from: governance });

        // set up the vault with 100% investment
        vault = await makeVault(storage.address, ycrv.address, 100, 100, {from: governance});

        // set up the strategy
        strategy = await SNXRewardStrategy.new(
          storage.address,
          ycrv.address,
          vault.address,
          { from: governance }
        );

        await strategy.setRewardSource(
          yfiiPool.address,
          yfii.address,
          nonExistingRoute,
          {from: governance}
        );

        await strategy.switchRewardSource(yfiiPool.address, {from: governance});

        // link vault with strategy
        await controller.addVaultAndStrategy(vault.address, strategy.address, {from: governance});
      }

      beforeEach(async function () {
        await setupExternalContracts();
        await setupCoreProtocol();
        await resetYCRVBalance();
      });

      async function depositVault(_farmer, _underlying, _vault, _amount) {
        await _underlying.approve(_vault.address, _amount, { from: _farmer });
        await _vault.deposit(_amount, { from: _farmer });
        assert.equal(_amount, await vault.balanceOf(_farmer));
        assert.equal(_amount, await vault.getContributions(_farmer));
      }

      it("A farmer investing ycrv", async function () {
        let duration = 500000;
        let farmerOldBalance = new BigNumber(await ycrv.balanceOf(farmer1));
        await depositVault(farmer1, ycrv, vault, farmerBalance);
        await vault.doHardWork({from: governance});
        let strategyOldBalance = new BigNumber(await yfiiPool.balanceOf(strategy.address));
        assert.equal(strategyOldBalance.toFixed(), farmerOldBalance.toFixed()); // strategy invested into pool after `invest`
        await Utils.advanceNBlock(10);

        await vault.doHardWork({from: governance});
        await time.increase(duration);
        await Utils.advanceNBlock(100);

        await vault.doHardWork({from: governance});
        let strategyNewBalance = new BigNumber(await yfiiPool.balanceOf(strategy.address));

        // Because we didn't set the liquidation route, no additional asset is put into work
        assert.equal(strategyNewBalance.toFixed(), strategyOldBalance.toFixed());

        // let's set a proper liquidation route, do hard work, and now there should be more
        await strategy.setLiquidationRoute(yfiiPool.address, yfii.address, existingRoute, {from: governance});
        await vault.doHardWork({from: governance});
        strategyNewBalance = new BigNumber(await yfiiPool.balanceOf(strategy.address));


        // strategy invested more money after doHardWork
        Utils.assertBNGt(strategyNewBalance, strategyOldBalance);

        await time.increase(duration);
        await Utils.advanceNBlock(10);
        await vault.doHardWork({from: governance});
        await vault.withdraw(farmerBalance, {from: farmer1});
        let farmerNewBalance = new BigNumber(await ycrv.balanceOf(farmer1));
        // Farmer gained money
        Utils.assertBNGt(farmerNewBalance, farmerOldBalance);
      });
    });
  });
}
