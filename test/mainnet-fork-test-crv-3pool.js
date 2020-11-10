// This test is only invoked if MAINNET_FORK is set
if (process.env.MAINNET_FORK) {
  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { send } = require("@openzeppelin/test-helpers");
  const BigNumber = require("bignumber.js");
  const Controller = artifacts.require("Controller");
  const Storage = artifacts.require("Storage");
  const CRVStrategy3PoolMainnet = artifacts.require("CRVStrategy3PoolMainnet");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const IERC20 = artifacts.require("IERC20");
  const makeVault = require("./make-vault.js");

  BigNumber.config({ DECIMAL_PLACES: 8 });

  contract("Mainnet Curve 3pool", function (accounts) {
    describe(`Curve 3pool`, function () {
      // external contracts
      let underlying;
//      let triPoolToken;

      // external setup
      let underlyingWhale = MFC.THREE_POOL_WHALE_ADDRESS;

      // parties in the protocol
      let governance = accounts[1];
      let farmer1 = accounts[3];

      // numbers used in tests
      let farmerBalance;

      // only used for ether distribution
      let etherGiver = accounts[9];

      // Core protocol contracts
      let storage;
      let controller;
      let vault;
      let strategy;
      let feeRewardForwarder;

      // secondary protocol contracts

      async function setupExternalContracts() {
        underlying = await IERC20.at(MFC.THREE_POOL_ADDRESS);
//        triPoolToken = await IERC20.at(MFC.CRV_TRIPOOL_TOKEN_ADDRESS);
      }

      async function setupBalance(){
        // Give whale some ether to make sure the following actions are good
        await send.ether(etherGiver, underlyingWhale, "1" + "000000000000000000");

        farmerBalance = await underlying.balanceOf(underlyingWhale);

        await underlying.transfer(farmer1, farmerBalance, { from: underlyingWhale });
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

      it("A farmer investing triPool", async function () {
        let farmerOldBalance = new BigNumber(await underlying.balanceOf(farmer1));
        await depositVault(farmer1, underlying, vault, farmerBalance);

        // Using half days is to simulate how we doHardwork in the real world
        //let numberOfHalfDays = 6; // 3 days
        let hours = 40;
        let oldSharePrice;
        let newSharePrice;
        for (let i = 0; i < hours; i++) {
          console.log("loop ", i);
          let blocksPerHour = 240;
          oldSharePrice = new BigNumber(await vault.getPricePerFullShare());
          await controller.doHardWork(vault.address, { from: governance });
          newSharePrice = new BigNumber(await vault.getPricePerFullShare());

          console.log("old shareprice: ", oldSharePrice.toFixed());
          console.log("new shareprice: ", newSharePrice.toFixed());
          console.log("growth: ", (newSharePrice.dividedBy(oldSharePrice)).toFixed());

          await Utils.advanceNBlock(blocksPerHour);
        }
        await vault.withdraw(farmerBalance, { from: farmer1 });
        let farmerNewBalance = new BigNumber(await underlying.balanceOf(farmer1));
        Utils.assertBNGt(farmerNewBalance, farmerOldBalance);
      });
    });
  });
}
