// This test is only invoked if MAINNET_E2E is set
if ( process.env.MAINNET_E2E ) {

  // configurations and test helpers
  const MFC = require("./mainnet-fork-test-config.js");
  const {assertBNGt, advanceNBlock, gasLog, printGasLog} = require("./Utils.js");
  const { expectRevert, send, time } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');

  // General interface
  const IERC20 = artifacts.require("IERC20");

  // Core Protocol
  const Controller = artifacts.require("Controller");
  const Vault = artifacts.require("Vault");
  const Storage = artifacts.require("Storage");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const makeVault = require("./make-vault.js");

  // UX improver
  const DepositHelper = artifacts.require("DepositHelper");

  // Strategies
  // SNX strategy
  const SNXRewardStrategy = artifacts.require("SNXRewardStrategy");
  const SNXRewardInterface = artifacts.require("SNXRewardInterface");
  // CRV strategy
  const CRVStrategyStable = artifacts.require("CRVStrategyStableMainnet");
  const CRVStrategyYCRV = artifacts.require("CRVStrategyYCRVMainnet");
  const PriceConvertor = artifacts.require("PriceConvertor");

  // Emission related
  const RewardToken = artifacts.require("RewardToken");
  const NoMintRewardPool = artifacts.require("NoMintRewardPool");
  const DelayMinter = artifacts.require("DelayMinter");
  const HardRewards = artifacts.require("HardRewards");


  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Mainnet End-to-end test", function(accounts){
    describe("basic settings", function (){

      // external contracts
      let dai;
      let usdc;
      let ycrv;
      let yfii;
      let yfiiPool;

      // external setup
      let daiWhale = MFC.DAI_WHALE_ADDRESS;
      let ycrvWhale = MFC.YCRV_WHALE_ADDRESS;
      let usdcWhale = MFC.USDC_WHALE_ADDRESS;
      let existingRoute;

      // parties in the protocol
      let governance = accounts[1];
      let farmer1 = accounts[3];
      let farmer2 = accounts[4];
      let farmer3 = accounts[5];
      let farmer4 = accounts[6];
      let farmer5 = accounts[7];

      let team = accounts[8];
      let operator = accounts[9];

      // numbers used in tests
      const daiusdcBalance18 = "1500000" + "000000000000000000";
      const daiusdcBalance6 = "1500000" + "000000";
      const farmerBalance18 = "3000" + "000000000000000000";
      const farmerBalance6 = "3000" + "000000";
      const rewardDuration = 7 * 86400; // 7 days
      const delayDuration = 86400; // 1 day
      let hardworkReward = "1000";

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let storage;
      let controller;
      let feeRewardForwarder;

      let daiVault;
      let daiYcrvStrategy;

      let usdcVault;
      let usdcYcrvStrategy;

      let ycrvVault;
      let ycrvSNXStrategy;

      let ycrvInternalVault;
      let ycrvCRVStrategy;

      // emission related
      let farm;
      let usdcRewardPool;
      let ycrvRewardPool;
      let delayMinter;
      let hardRewards;

      // profit sharing related
      let daiProfitPool;

      /*
          System setup helper functions
          the full system setup can be traced by reading the "beforeEach()" code
      */

      async function resetBalance(underlying, whale, farmer, balance) {
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, whale, "500000000000000000");

        // reset token balance
        await underlying.transfer(whale, await underlying.balanceOf(farmer), {
          from: farmer,
        });
        await underlying.transfer(farmer, balance, { from: whale });
        assert.equal(balance, await underlying.balanceOf(farmer));
      }

      async function setupInternalYcrvVault() {
        // set up the ycrvVault with 98% investment
        ycrvInternalVault = await makeVault(storage.address, ycrv.address, 98, 100, {
          from: governance,
        });

        // set up the strategies
        ycrvCRVStrategy = await CRVStrategyYCRV.new(
          storage.address,
          ycrvInternalVault.address,
          { from: governance }
        );
        await controller.addVaultAndStrategy(ycrvInternalVault.address, ycrvCRVStrategy.address, {from: governance});
      }

      async function setupDaiVault() {
        // dai Vault
        daiVault = await makeVault(storage.address, dai.address, 90, 100, {
          from: governance,
        });

        daiYcrvStrategy = await CRVStrategyStable.new(
          storage.address,
          dai.address,
          daiVault.address,
          ycrvInternalVault.address,
          { from: governance }
        );

        await controller.addVaultAndStrategy(daiVault.address, daiYcrvStrategy.address, {from: governance});
      }

      async function setupUSDCVault() {
        // usdc Vault
        usdcVault = await makeVault(storage.address, usdc.address, 90, 100, {
          from: governance,
        });

        usdcYcrvStrategy = await CRVStrategyStable.new(
          storage.address,
          usdc.address,
          usdcVault.address,
          ycrvInternalVault.address,
          { from: governance }
        );

        await controller.addVaultAndStrategy(usdcVault.address, usdcYcrvStrategy.address, {from: governance});
      }

      async function setupYcrvVault() {
        // ycrv Vault SNX
        ycrvVault = await makeVault(storage.address, ycrv.address, 100, 100, {from: governance});

        ycrvSNXStrategy = await SNXRewardStrategy.new(
          storage.address,
          ycrv.address,
          ycrvVault.address,
          { from: governance }
        );

        await ycrvSNXStrategy.setRewardSource(
          yfiiPool.address,
          yfii.address,
          existingRoute,
          {from: governance}
        );

        await ycrvSNXStrategy.switchRewardSource(yfiiPool.address, {from: governance});

        // link vault with strategy
        await controller.addVaultAndStrategy(ycrvVault.address, ycrvSNXStrategy.address, {from: governance});
      }

      async function setupRewardPools() {
        daiRewardPool = await NoMintRewardPool.new(
          farm.address, // rewardToken should be FARM
          daiVault.address, // lpToken
          rewardDuration, // duration
          governance, // reward distribution
          storage.address,
          {from: governance}
        );

        usdcRewardPool = await NoMintRewardPool.new(
          farm.address, // rewardToken should be FARM
          usdcVault.address, // lpToken
          rewardDuration, // duration
          governance, // reward distribution
          storage.address,
          {from: governance}
        );

        ycrvRewardPool = await NoMintRewardPool.new(
          farm.address, // rewardToken should be FARM
          ycrvVault.address, // lpToken
          rewardDuration, // duration
          governance, // reward distribution
          storage.address,
          {from: governance}
        );
      }

      async function setupDelayMinter() {
        delayMinter = await DelayMinter.new(
          storage.address,
          farm.address,
          delayDuration,
          team,
          operator,
          { from: governance }
        );

        // authorize the delayMinter to mint
        await farm.addMinter(delayMinter.address, {
          from: governance,
        });
      }

      async function setupHardRewards() {
        hardRewards = await HardRewards.new(storage.address, farm.address, {
          from: governance,
        });
        await hardRewards.addVault(ycrvVault.address, {from: governance});
        await hardRewards.addVault(daiVault.address, {from: governance});
        await hardRewards.addVault(usdcVault.address, {from: governance});
        await controller.setHardRewards(hardRewards.address, {from: governance});
      }

      async function setupExternalContracts() {
        dai = await IERC20.at(MFC.DAI_ADDRESS);
        ycrv = await IERC20.at(MFC.YCRV_ADDRESS);
        weth = await IERC20.at(MFC.WETH_ADDRESS);
        yfii = await IERC20.at(MFC.YFII_ADDRESS);
        usdc = await IERC20.at(MFC.USDC_ADDRESS);
        yfiiPool = await SNXRewardInterface.at(MFC.YFII_POOL_ADDRESS);
        existingRoute = [MFC.YFII_ADDRESS, MFC.WETH_ADDRESS, MFC.YCRV_ADDRESS];
      }

      async function setupCoreProtocol() {
        // deploy storage
        storage = await Storage.new({ from: governance });

        feeRewardForwarder = await FeeRewardForwarder.new(storage.address, farm.address, MFC.UNISWAP_V2_ROUTER02_ADDRESS, { from: governance });
        // set up controller
        controller = await Controller.new(storage.address, feeRewardForwarder.address, {
          from: governance,
        });

        await storage.setController(controller.address, { from: governance });
      }

      async function setupVaultsAndStrategies() {
        await setupInternalYcrvVault();
        await setupDaiVault();
        await setupUSDCVault();
        await setupYcrvVault();
      }

      async function setupIncentives() {
        farm = await RewardToken.new(storage.address, {
          from: governance,
        });

        await setupRewardPools();
        await setupDelayMinter();
        await setupHardRewards();
      }

      /*
        Note:
          Currently Dai/USDT/USDC that uses the internal yCRV vault would contribute to the DAI profit pool
          Other vaults would harvest whatever the underlying token is and contribute to that speicifc pool
          (e.g. yCRV vault would contribute to yCRV)

          We are changing this later so that all rewards are converted into one.
      */

      async function setupProfitSharing() {
        // Dai, USDC, and yCRV Vaults all use Dai to share profit
        daiProfitPool = await NoMintRewardPool.new(
          dai.address,  // rewardToken should be dai, usdc, ycrv
          farm.address, // governance
          rewardDuration, // duration
          feeRewardForwarder.address, // reward distribution
          storage.address,
          { from: governance }
        );

        await feeRewardForwarder.setConversionPath(
          ycrv.address,
          dai.address,
          [MFC.YCRV_ADDRESS, MFC.WETH_ADDRESS, MFC.DAI_ADDRESS],
          {from: governance}
        );

        // Let the feeRewardForwarder know that we are sharing all our profit in this
        // Dai profit pool
        await feeRewardForwarder.setTokenPool(daiProfitPool.address, { from: governance });
      }

      async function distributeBalance() {
        // YCRV to farmer 1 and farmer 2
        await resetBalance(ycrv, ycrvWhale, farmer1, farmerBalance18);
        await resetBalance(ycrv, ycrvWhale, farmer2, farmerBalance18);

        // DAI to farmer 2 and farmer 3
        await resetBalance(dai, daiWhale, farmer2, daiusdcBalance18);
        await resetBalance(dai, daiWhale, farmer3, daiusdcBalance18);

        // USDC to farmer 4 and farmer 5
        await resetBalance(usdc, usdcWhale, farmer4, daiusdcBalance6);
        await resetBalance(usdc, usdcWhale, farmer5, daiusdcBalance6);
      }

      async function renouncePower() {
        await farm.renounceMinter({from: governance});
      }

      // Setting up the whole system
      beforeEach(async function () {
        await setupExternalContracts();
        await setupCoreProtocol();
        await setupVaultsAndStrategies();
        await setupIncentives();
        await setupProfitSharing();
        await distributeBalance();
        await renouncePower();
      });

      /*
        Now, the whole system should have been properly set up.
        Also, priviledge to minting renounced by the governance.
        Minting has to go through the delay minter from now on

        The functions below are all used "AFTER" the system has finished setup
      */

      /*
        Note:
          Currently loading Hardrewards requires that the money is minted to some address first,
          then have that address approve, then have hardreward load from that specific address.
          this would typically be the governance for now.

          We could consider implement a notifier as in the reward pools, this way, the funds would
          not need to go through governance and the announcement of delayMinter would be more clear
          as we would be able to announceMint to the hardReward.
      */

      async function passDelayMintTime(){
        // time passes
        await time.advanceBlock();
        await time.increase(2 * delayDuration);
        await time.advanceBlock();
      }

      async function loadHardReward() {
        // mint some token to governance so that it can be transferred to hardRewards
        let delayId = await delayMinter.nextId();
        await delayMinter.announceMint(governance, 100 * hardworkReward, { from: governance });
        await passDelayMintTime();
        await delayMinter.executeMint(delayId, { from: governance });

        // Delay minter will mint 70% to the target, 10% to the operator, 20% to the team
        await farm.approve(hardRewards.address, 70 * hardworkReward, {
          from: governance,
        });

        await hardRewards.load(farm.address, hardworkReward, 70 * hardworkReward, {
          from: governance,
        });
      }

      // Farmer's perspective
      async function printBalance( msg, _token, _account){
        console.log(msg, " : " , (await _token.balanceOf(_account)).toString());
      }

      async function depositVault(_farmer, _underlying, _vault, _amount) {
        await _underlying.approve(_vault.address, _amount, { from: _farmer });
        await gasLog("Vault Deposit(" + await _vault.symbol() + ")", _vault.deposit(_amount, { from: _farmer }));
      }

      async function _stakePool(_farmer, _stakeToken, _pool, _amount) {
        await _stakeToken.approve(_pool.address, _amount, {from: _farmer});
        await gasLog("PoolStake:", _pool.stake(_amount, {from: _farmer}));
      }

      async function stakeRewardPool(_farmer, _vault, _pool, _amount) {
        await _stakePool(_farmer, _vault, _pool, _amount);
      }

      async function stakeProfitPool(_farmer, _pool) {
        // although we can simplify to just use `farm` for `_farm`, for uniformity, we require that to be passed in
        printBalance("stakeProfitPool", farm, _farmer);
        await _stakePool(_farmer, farm, _pool, await farm.balanceOf(_farmer));
      }

      async function withdrawVault(_farmer, _vault, _pool, _amount) {
        // get back vault token and claim reward
        await _pool.withdraw(_amount, {from: _farmer});
        await gasLog("Vault Small Withdraw(" + await _vault.symbol() + ")", _vault.withdraw( _amount, {from: _farmer}));
      }

      async function exitVault(_farmer, _vault, _pool) {
        // get back vault token and claim reward
        await _pool.exit({from: _farmer});
        await gasLog("Vault Withdraw(" + await _vault.symbol() + ")", _vault.withdraw( await _vault.balanceOf(_farmer), {from: _farmer}));
      }

      // Governance's perspective

      async function mintFarmToPoolAndNotify(_pool, _amount) {
        let _amountToMint = _amount / 7 * 10;  // delay minter always mints 70% to the target
        let delayId = await delayMinter.nextId();
        await delayMinter.announceMint(_pool.address, _amountToMint, { from: governance });
        await passDelayMintTime();
        await delayMinter.executeMint(delayId, { from: governance });

        await _pool.notifyRewardAmount(_amount, {
          from: governance,
        });
      }

      async function doHardWorkOnAllVaults(n){
        // Note: For this end to end test, printing is intentional,
        // otherwise the test takes too long and would be hard to track the progress
        console.log("doHardWorkOnAllVaults: ", n, "hrs");
        for (let i = 0; i < n; i++) {
          let blocksPerHour = 240;
          await advanceNBlock(blocksPerHour);
          await gasLog("Vault doHardWork(" + await ycrvVault.symbol() + ")", controller.doHardWork(ycrvVault.address, {from: governance}));
          await gasLog("Vault doHardWork(" + await daiVault.symbol() + ")",controller.doHardWork(daiVault.address, {from: governance}));
          await gasLog("Vault doHardWork(" + await usdcVault.symbol() + ")",controller.doHardWork(usdcVault.address, {from: governance}));
          await gasLog("Vault doHardWork(I" + await ycrvInternalVault.symbol() + ")",controller.doHardWork(ycrvInternalVault.address, { from: governance }));
        }
      }

      /*

      What is happiness?
      Happiness is:
        * The whole system connects and functions properly for all party
        * farmers are able to stake, withdraw, and earn interest on this system.
        * Profit sharing pool actually getting profit and distributes to stakers
        * farmers make money
        * Hard workers get reward for doing hard work

      */

      it("Happy Path", async function () {
        await loadHardReward();

        await depositVault(farmer1, ycrv, ycrvVault, farmerBalance18);
        await stakeRewardPool(farmer1, ycrvVault, ycrvRewardPool, farmerBalance18);

        let beforeHardWork = await farm.balanceOf(governance);
        await doHardWorkOnAllVaults(1);
        assertBNGt(await farm.balanceOf(governance), beforeHardWork);

        await exitVault(farmer1, ycrvVault, ycrvRewardPool);
        // Farmer1 made money -- note that the reward pool is not activated yet
        assertBNGt(await ycrv.balanceOf(farmer1), farmerBalance18);
        assert.equal(await farm.balanceOf(farmer1), 0);

        // Basic case complete
        // now everyone invests into the vaults
        // YCRV to farmer 1 and farmer 2
        // DAI to farmer 2 and farmer 3
        // USDC to farmer 4 and farmer 5
        await depositVault(farmer1, ycrv, ycrvVault, farmerBalance18);
        await stakeRewardPool(farmer1, ycrvVault, ycrvRewardPool, farmerBalance18);

        // let's start all the reward pools
        await mintFarmToPoolAndNotify(ycrvRewardPool, 700000000);
        await mintFarmToPoolAndNotify(daiRewardPool, 700000000);
        await mintFarmToPoolAndNotify(usdcRewardPool, 700000000);
        await doHardWorkOnAllVaults(1);

        await depositVault(farmer2, ycrv, ycrvVault, farmerBalance18);
        await stakeRewardPool(farmer2, ycrvVault, ycrvRewardPool, await ycrvVault.balanceOf(farmer2));

        // DAI
        await depositVault(farmer2, dai, daiVault, daiusdcBalance18);
        await stakeRewardPool(farmer2, daiVault, daiRewardPool, await daiVault.balanceOf(farmer2));
        await depositVault(farmer3, dai, daiVault, daiusdcBalance18);
        await stakeRewardPool(farmer3, daiVault, daiRewardPool, await daiVault.balanceOf(farmer3));

        // USDC
        await depositVault(farmer4, usdc, usdcVault, daiusdcBalance6);
        await stakeRewardPool(farmer4, usdcVault, usdcRewardPool, await usdcVault.balanceOf(farmer4));
        await depositVault(farmer5, usdc, usdcVault, daiusdcBalance6);
        await stakeRewardPool(farmer5, usdcVault, usdcRewardPool, await usdcVault.balanceOf(farmer5));

        // Everyone staked. Let's get the time passing and do some hard work
        await doHardWorkOnAllVaults(6);

        // Let's get some rewards and stake to the profit sharing pool
        await ycrvRewardPool.getReward({from: farmer1});
        await ycrvRewardPool.getReward({from: farmer2});

        await daiRewardPool.getReward({from: farmer2});
        await daiRewardPool.getReward({from: farmer3});

        await usdcRewardPool.getReward({from: farmer4});
        await usdcRewardPool.getReward({from: farmer5});

        // ycrv vault yields ycrv profit pool
        // dai & usdc vault yields dai profit pool
        await stakeProfitPool(farmer1, daiProfitPool);
        await stakeProfitPool(farmer2, daiProfitPool);
        await stakeProfitPool(farmer3, daiProfitPool);
        await stakeProfitPool(farmer4, daiProfitPool);
        await stakeProfitPool(farmer5, daiProfitPool);

        // pass some time!
        await doHardWorkOnAllVaults(12);

        // withdraw a little bit
        await withdrawVault(farmer1, ycrvVault, ycrvRewardPool, "1");
        await withdrawVault(farmer4, usdcVault, usdcRewardPool, "1");

        await daiProfitPool.exit({from:farmer1});
        await daiProfitPool.exit({from:farmer2});
        await daiProfitPool.exit({from:farmer3});
        await daiProfitPool.exit({from:farmer4});
        await daiProfitPool.exit({from:farmer5});

        await exitVault(farmer1, ycrvVault, ycrvRewardPool);
        await exitVault(farmer2, ycrvVault, ycrvRewardPool);
        await exitVault(farmer2, daiVault, daiRewardPool);
        await exitVault(farmer3, daiVault, daiRewardPool);
        await exitVault(farmer4, usdcVault, usdcRewardPool);
        await exitVault(farmer5, usdcVault, usdcRewardPool);

        // Made money just from vault
        assertBNGt(await ycrv.balanceOf(farmer1), farmerBalance18);
        assertBNGt(await ycrv.balanceOf(farmer2), farmerBalance18);

        // Note: For this end to end test, printing is intentional,
        // otherwise the test takes too long and would be hard to track the progress
        // Below, we will be printing the relevant balances of the farmers
        await printBalance("dai farmer2", dai, farmer2);
        await printBalance("dai farmer3", dai, farmer3);
        await printBalance("usdc farmer4", usdc, farmer4);
        await printBalance("usdc farmer5", usdc, farmer5);

        assertBNGt(await dai.balanceOf(farmer2), farmerBalance18);
        assertBNGt(await dai.balanceOf(farmer3), farmerBalance18);
        assertBNGt(await usdc.balanceOf(farmer4), farmerBalance6);
        assertBNGt(await usdc.balanceOf(farmer5), farmerBalance6);

        // Made money from profit sharing
        await printBalance("dai farmer1", dai, farmer1);
        await printBalance("dai farmer2", dai, farmer2);
        await printBalance("dai farmer3", dai, farmer3);
        await printBalance("dai farmer4", dai, farmer4);
        await printBalance("dai farmer5", dai, farmer5);
        assertBNGt(await dai.balanceOf(farmer1), 0);
        assertBNGt(await dai.balanceOf(farmer2), 0);
        assertBNGt(await dai.balanceOf(farmer3), 0);
        assertBNGt(await dai.balanceOf(farmer4), 0);
        assertBNGt(await dai.balanceOf(farmer5), 0);

        // earned reward token from reward pools
        await printBalance("farm farmer1", farm, farmer1);
        await printBalance("farm farmer2", farm, farmer2);
        await printBalance("farm farmer3", farm, farmer3);
        await printBalance("farm farmer4", farm, farmer4);
        await printBalance("farm farmer5", farm, farmer5);

        assertBNGt(await farm.balanceOf(farmer1), 0);
        assertBNGt(await farm.balanceOf(farmer2), 0);
        assertBNGt(await farm.balanceOf(farmer3), 0);
        assertBNGt(await farm.balanceOf(farmer4), 0);
        assertBNGt(await farm.balanceOf(farmer5), 0);

        await printGasLog();
      });

    });
  });
}
