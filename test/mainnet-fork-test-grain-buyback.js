// This test is only invoked if MAINNET_FORK is set
if (process.env.MAINNET_FORK) {
  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { time, send } = require("@openzeppelin/test-helpers");
  const BigNumber = require("bignumber.js");
  const Controller = artifacts.require("Controller");
  const Storage = artifacts.require("Storage");
  const CRVStrategy3PoolMainnet = artifacts.require("CRVStrategy3PoolMainnet");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const RewardToken = artifacts.require("RewardToken");
  const IERC20 = artifacts.require("IERC20");
  const Grain = artifacts.require("Grain");
  const IUniswapV2Router02 = artifacts.require("IUniswapV2Router02");
  const IUniswapV2Factory = artifacts.require("IUniswapV2Factory");
  const IUniswapV2Pair = artifacts.require("IUniswapV2Pair");
  const NoMintRewardPool = artifacts.require("NoMintRewardPool");
  const makeVault = require("./make-vault.js");

  BigNumber.config({ DECIMAL_PLACES: 8 });

  contract("Mainnet Grain Buybacks", function (accounts) {
    describe(`Curve 3pool`, function () {

      /*
          1. Deploy Grain
          2. Mint Grain and get FARM
          3. Use Uniswap Router to create FARM/Grain pair
          4. Set new feeRewardForwarder in Controller
          5. doHardwork and check the buyback
      */

      // external contracts
      let underlying;

      // external setup
      let underlyingWhale = MFC.THREE_POOL_WHALE_ADDRESS;
      let crv;
      let usdc;

      // parties in the protocol
      let governance = "0xf00dD244228F51547f0563e60bCa65a30FBF5f7f";
      let farmer1 = accounts[3];

      // Uniswap 
      let uniRouter;
      let uniFarmGrainPair;
      let uniFactory;

      // numbers used in tests
      let farmerBalance;

      // only used for ether distribution
      let etherGiver = accounts[9];
      let farmWhale;

      // new core 
      let grain;

      // Core protocol contracts
      let farm;
      let storage;
      let controller;
      let vault;
      let strategy;
      let feeRewardForwarder;

      // secondary protocol contracts

      async function setupExternalContracts() {
        underlying = await IERC20.at(MFC.THREE_POOL_ADDRESS);
        crv = await IERC20.at(MFC.CRV_ADDRESS);
        usdc = await IERC20.at(MFC.USDC_ADDRESS);
      }

      async function setupBalance(){
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, underlyingWhale, "1" + "000000000000000000");

        farmerBalance = await underlying.balanceOf(underlyingWhale);

        await underlying.transfer(farmer1, farmerBalance, { from: underlyingWhale });
      }

      async function setupCoreProtocol() {
        // get farm
        farm = await RewardToken.at("0xa0246c9032bC3A600820415aE600c6388619A14D");
        farmWhale = "0x843002b1d545ef7abb71c716e6179570582faa40";
        await farm.transfer(governance, await farm.balanceOf(farmWhale), {from: farmWhale});

        // get storage
        storage = await Storage.at("0xc95CbE4ca30055c787CB784BE99D6a8494d0d197");

        // New core protocol contracts
        grain = await Grain.new(storage.address, {from: governance});
        feeRewardForwarder = await FeeRewardForwarder.new(storage.address, farm.address, grain.address, { from: governance });

        // minting grain
        let grainMax = "30938517224397506697899427";
        await grain.mint(governance, grainMax, {from: governance});
        assert.equal(await grain.balanceOf(governance), grainMax);


        // set up controller
        controller = await Controller.at("0x222412af183BCeAdEFd72e4Cb1b71f1889953b1C");
        assert.equal(await controller.governance(), governance);

        // set up the vault with 90% investment
        vault = await makeVault(storage.address, underlying.address, 100, 100, {
          from: governance,
        });

        // set up the strategies
        strategy = await CRVStrategy3PoolMainnet.new(
          storage.address,
          vault.address,
          { from: governance }
        );

        // link vaults with strategies
        await controller.addVaultAndStrategy(
          vault.address,
          strategy.address,
          { from: governance }
        );
      }

      beforeEach(async function () {
        await setupExternalContracts();
        await setupCoreProtocol();
        await setupBalance();
      });

      async function depositVault(_farmer, _underlying, _vault, _amount) {
        await _underlying.approve(_vault.address, _amount, { from: _farmer });
        await _vault.deposit(_amount, { from: _farmer });
        Utils.assertBNEq(_amount, await _vault.balanceOf(_farmer));
      }

      async function setupUniPair() {
        // governance provides Uniswap Pair
        // https://uniswap.org/docs/v2/smart-contracts/factory/#createpair
        uniFactory = await IUniswapV2Factory.at("0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f");
        uniRouter = await IUniswapV2Router02.at("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");

        let grainAmount = "1000" + "000000000000000000";
        let farmAmount = "1" + "000000000000000000";
        await time.advanceBlock();
        let blocktime = new BigNumber(await time.latest());

        let deadline = blocktime.plus("1000");
        await grain.approve(uniRouter.address, grainAmount, {from: governance});
        await farm.approve(uniRouter.address, farmAmount, {from: governance});
        await uniRouter.addLiquidity(grain.address, farm.address, grainAmount, farmAmount, 0, 0, governance, deadline.toFixed(), {from: governance});
      
        let uniFarmGrainPairAddr = await uniFactory.getPair(grain.address, farm.address);
        uniFarmGrainPair = await IUniswapV2Pair.at(uniFarmGrainPairAddr);
      }

      async function setNewFeeRewardForwarder() {
        await controller.setFeeRewardForwarder(feeRewardForwarder.address, {from: governance});
        await feeRewardForwarder.setTokenPool("0x8f5adC58b32D4e5Ca02EAC0E293D35855999436C", {from: governance});
        let profitSharingPool = await NoMintRewardPool.at("0x8f5adC58b32D4e5Ca02EAC0E293D35855999436C");
        await profitSharingPool.setRewardDistribution(feeRewardForwarder.address, {from: governance});
        // use half of the profit to buy grain and burn it.
        await feeRewardForwarder.setGrainConfig(50, 100, true, "0x0000000000000000000000000000000000000000", governance, {from: governance});
      }

      it("A farmer investing triPool", async function () {

        await setupUniPair();

        let farmerOldBalance = new BigNumber(await underlying.balanceOf(farmer1));
        await depositVault(farmer1, underlying, vault, farmerBalance);

        // Using half days is to simulate how we doHardwork in the real world
        //let numberOfHalfDays = 6; // 3 days
        let hours = 12;
        let oldSharePrice;
        let newSharePrice;
        let lastGrainTotalSupply;
        let grainTotalSupply;
        let lastCrvBalance;
        let crvBalance;
        let lastUSDCBalance;
        let USDCBalance;
        for (let i = 0; i < hours; i++) {
          console.log("loop ", i);
          if(i == 0){
            // switch to new feeRewardForwarder.
            // it also configs to use half the profit to buy grain and do immediate burn.
            // Check: GRAIN totalSupply decreasing 
            await setNewFeeRewardForwarder();
          } else if(i == 3){ 
            // no immediate buy backs and sending the crop directly. 
            // Check: GRAIN totalSupply not decreasing. And governance received CRV.
            await feeRewardForwarder.setGrainConfig(50, 100, false, "0x0000000000000000000000000000000000000000", governance, {from: governance});
          } else if(i == 6){
            // no immediate buy backs and convert it to some token. Let's use USDC
            // Check: GRAIN totalSupply not decreasing. governance should receive USDC.
            await feeRewardForwarder.setGrainConfig(50, 100, false, MFC.USDC_ADDRESS, governance, {from: governance});
          } else if(i == 9){
            // no grain buy backs at all 
            // Check: GRAIN totalSupply not decreasing. governance should receive NOTHING.
            await feeRewardForwarder.setGrainConfig(0, 100, false, "0x0000000000000000000000000000000000000000", governance, {from: governance});
          }

          lastGrainTotalSupply = (new BigNumber(await grain.totalSupply()));
          lastCrvBalance = new BigNumber(await crv.balanceOf(governance));
          lastUSDCBalance = new BigNumber(await usdc.balanceOf(governance));

          let blocksPerHour = 240;
          oldSharePrice = new BigNumber(await vault.getPricePerFullShare());
          await controller.doHardWork(vault.address, { from: governance });
          newSharePrice = new BigNumber(await vault.getPricePerFullShare());

          console.log("old shareprice: ", oldSharePrice.toFixed());
          console.log("new shareprice: ", newSharePrice.toFixed());
          console.log("growth: ", (newSharePrice.dividedBy(oldSharePrice)).toFixed());

          console.log("grain totalSupply: ", (new BigNumber(await grain.totalSupply())).toFixed() );

          grainTotalSupply = (new BigNumber(await grain.totalSupply()));
          crvBalance = new BigNumber(await crv.balanceOf(governance));
          USDCBalance = new BigNumber(await usdc.balanceOf(governance));

          if(i == 0){
            // Special case, doHardwork is only investing.
          }
          else if(i < 3){
            // Check: GRAIN totalSupply decreasing 
            Utils.assertBNGt(lastGrainTotalSupply, grainTotalSupply);
          } else if(i < 6){
            // Check: GRAIN totalSupply not decreasing. And governance received CRV.
            Utils.assertBNEq(lastGrainTotalSupply, grainTotalSupply);
            Utils.assertBNGt(crvBalance, lastCrvBalance);
          } else if(i < 9){
            // Check: GRAIN totalSupply not decreasing. governance should receive USDC.
            Utils.assertBNEq(lastGrainTotalSupply, grainTotalSupply);
            Utils.assertBNGt(USDCBalance, lastUSDCBalance);            
          } else {
            // Check: GRAIN totalSupply not decreasing. governance should receive NOTHING.
            Utils.assertBNEq(lastGrainTotalSupply, grainTotalSupply);
            Utils.assertBNEq(USDCBalance, lastUSDCBalance);
          }
          await Utils.advanceNBlock(blocksPerHour);
        }

        await vault.withdraw(farmerBalance, { from: farmer1 });
        let farmerNewBalance = new BigNumber(await underlying.balanceOf(farmer1));
        Utils.assertBNGt(farmerNewBalance, farmerOldBalance);
      });
    });
  });
}
