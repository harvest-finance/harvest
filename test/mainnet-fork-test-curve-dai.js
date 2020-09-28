// This test is only invoked if MAINNET_FORK is set
if (process.env.MAINNET_FORK) {
  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send } = require("@openzeppelin/test-helpers");
  const BigNumber = require("bignumber.js");
  const Controller = artifacts.require("Controller");
  const Vault = artifacts.require("Vault");
  const Storage = artifacts.require("Storage");
  const CRVStrategyStable = artifacts.require("CRVStrategyStableMainnet");
  const CRVStrategyYCRV = artifacts.require("CRVStrategyYCRVMainnet");
  const PriceConvertor = artifacts.require("PriceConvertor");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  // UniswapV2 Router (can we ignore this or not?)
  const UniswapV2Router02 = artifacts.require("UniswapV2Router02");

  BigNumber.config({ DECIMAL_PLACES: 0 });

  contract("Mainnet Curve", function (accounts) {
    describe("Curve savings", function () {
      // external contracts
      let dai;
      let ycrv;

      // external setup
      let daiWhale = MFC.DAI_WHALE_ADDRESS;

      // parties in the protocol
      let governance = accounts[1];
      let rewardCollector = accounts[2];
      let farmer1 = accounts[3];
      let farmer2 = accounts[4];

      // numbers used in tests
      const farmerBalance = "1500000" + "000000000000000000";

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let storage;
      let controller;
      let ycrvVault;
      let daiVault;
      let daiStrategy;
      let ycrvStrategy;

      // secondary protocol contracts

      async function setupExternalContracts() {
        ycrv = await IERC20.at(MFC.YCRV_ADDRESS);
        dai = await IERC20.at(MFC.DAI_ADDRESS);
        let crv = "0xD533a949740bb3306d119CC777fa900bA034cd52";
      }

      async function resetDaiBalance() {
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, daiWhale, "1" + "000000000000000000");
        // reset token balance
        await dai.transfer(daiWhale, await dai.balanceOf(farmer1), {
          from: farmer1,
        });
        await dai.transfer(daiWhale, await dai.balanceOf(farmer2), {
          from: farmer2,
        });
        await dai.transfer(farmer1, farmerBalance, { from: daiWhale });
        await dai.transfer(farmer2, farmerBalance, { from: daiWhale });
        assert.equal(farmerBalance, await dai.balanceOf(farmer1));
      }

      async function setupCoreProtocol() {
        // deploy storage
        storage = await Storage.new({ from: governance });

        feeRewardForwarder = await FeeRewardForwarder.new(storage.address, MFC.UNISWAP_V2_ROUTER02_ADDRESS, { from: governance });

        // set up controller
        controller = await Controller.new(storage.address, feeRewardForwarder.address, {
          from: governance,
        });
        assert.equal(await controller.governance(), governance);

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
        ycrvStrategy = await CRVStrategyYCRV.new(
          storage.address,
          ycrvVault.address,
          { from: governance }
        );
        daiStrategy = await CRVStrategyStable.new(
          storage.address,
          dai.address,
          daiVault.address,
          ycrvVault.address,
          { from: governance }
        );

        // link vaults with strategies
        await controller.addVaultAndStrategy(
          ycrvVault.address,
          ycrvStrategy.address,
          { from: governance }
        );
        await controller.addVaultAndStrategy(
          daiVault.address,
          daiStrategy.address,
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
        assert.equal(_amount, await _vault.getContributions(_farmer));
      }

      it("A farmer investing dai", async function () {
        let farmerOldBalance = new BigNumber(await dai.balanceOf(farmer1));
        await depositVault(farmer1, dai, daiVault, farmerBalance);
        // fees are about $800, we are netting about $120 per hour
        let hours = 24;
        for (let i = 0; i < hours; i++) {
          let blocksPerHour = 240;
          await Utils.advanceNBlock(blocksPerHour);
          await controller.doHardWork(daiVault.address, { from: governance });
          await controller.doHardWork(ycrvVault.address, { from: governance });
          let sharePrice = new BigNumber(await daiVault.getPricePerFullShare());
          console.log("Share price: " + sharePrice.toFixed());
        }
        await daiVault.withdraw(farmerBalance, { from: farmer1 });
        let farmerNewBalance = new BigNumber(await dai.balanceOf(farmer1));

        console.log("new balance: " + farmerNewBalance.toFixed());
        console.log("old balance: " + farmerOldBalance.toFixed());
        Utils.assertBNGt(farmerNewBalance, farmerOldBalance);
      });
    });
  });
}
