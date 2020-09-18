// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send, time } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Controller = artifacts.require("Controller");
  const Vault = artifacts.require("Vault");
  const Storage = artifacts.require("Storage");
  const SNXRewardUniLPStrategy = artifacts.require("SNXRewardUniLPStrategy");
  const SNXRewardInterface = artifacts.require("SNXRewardInterface");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const StakingRewardFactory = artifacts.require("StakingRewardsFactory");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");
  // UniswapV2 Router
  const UniswapV2Router02 = artifacts.require("UniswapV2Router02");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Mainnet Uniswap Staking Reward", function(accounts){
    describe("Uniswap Staking Reward earnings", function (){

      // external contracts
      let uniswapV2Router02;
      let underlying;
      let cropToken;
      let cropPool;
      let token0;
      let token1;

      // external setup
      let underlyingWhale = MFC.UNISWAP_ETH_USDT_LP_WHALE_ADDRESS;
      let token0Whale = MFC.WETH_WHALE_ADDRESS;
      let token1Whale = MFC.USDT_WHALE_ADDRESS;
      
      let token0Path; // weth
      let token1Path; // usdt

      // parties in the protocol
      let governance = accounts[1];
      let farmer1 = accounts[3];
      let farmer2 = accounts[4];

      // numbers used in tests
      //                    "000000000000000000"
      const farmerBalance =  "10000000000000000";

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let storage;
      let controller;
      let vault;
      let strategy;
      let feeRewardForwarder;


      async function setupExternalContracts() {
        uniswapV2Router02 = await UniswapV2Router02.at(MFC.UNISWAP_V2_ROUTER02_ADDRESS);
        underlying = await IERC20.at(MFC.UNISWAP_ETH_USDT_LP_ADDRESS);
        weth = await IERC20.at(MFC.WETH_ADDRESS);
        cropToken = await IERC20.at(MFC.UNI_ADDRESS);
        cropPool = await SNXRewardInterface.at(MFC.UNISWAP_ETH_USDT_STAKING_POOL_ADDRESS);
        stakingRewardFactory = await StakingRewardFactory.at(MFC.UNISWAP_STAKING_REWARD_FACTORY_ADDRESS);
        token0Path = [MFC.UNI_ADDRESS, MFC.WETH_ADDRESS];
        token1Path = [MFC.UNI_ADDRESS, MFC.WETH_ADDRESS, MFC.USDT_ADDRESS];
        token0 = await IERC20.at(MFC.WETH_ADDRESS);
        token1 = await IERC20.at(MFC.USDT_ADDRESS);
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
        // deploy storage
        storage = await Storage.new({ from: governance });

        feeRewardForwarder = await FeeRewardForwarder.new(storage.address, MFC.UNISWAP_V2_ROUTER02_ADDRESS, { from: governance });
        // set up controller
        controller = await Controller.new(storage.address, feeRewardForwarder.address, {
          from: governance,
        });

        await storage.setController(controller.address, { from: governance });

        // set up the vault with 100% investment
        vault = await Vault.new(storage.address, underlying.address, 100, 100, {from: governance});

        // set up the strategy
        strategy = await SNXRewardUniLPStrategy.new(
          storage.address,
          underlying.address,
          vault.address,
          cropPool.address, 
          cropToken.address,
          { from: governance }
        );

        await strategy.setLiquidationPaths(
          token0Path,
          token1Path, 
          {from: governance}
        );

        // link vault with strategy
        await controller.addVaultAndStrategy(vault.address, strategy.address, {from: governance});
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
        assert.equal(_amount, await vault.getContributions(_farmer));
      }

      it("A farmer investing underlying", async function () {
        // time travel to enable Uni rewards
        await time.increase(20000);
        await Utils.advanceNBlock(10);
        await stakingRewardFactory.notifyRewardAmount(underlying.address);

        let duration = 500000;
        let farmerOldBalance = new BigNumber(await underlying.balanceOf(farmer1));
        await depositVault(farmer1, underlying, vault, farmerBalance);
        await vault.doHardWork({from: governance});
        let strategyOldBalance = new BigNumber(await cropPool.balanceOf(strategy.address));
        assert.equal(strategyOldBalance.toFixed(), farmerOldBalance.toFixed()); // strategy invested into pool after `invest`
        await Utils.advanceNBlock(10);
        
        await vault.doHardWork({from: governance});
        await time.increase(duration);
        await Utils.advanceNBlock(100);

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