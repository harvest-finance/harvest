// This test is only invoked if MAINNET_FORK is set

if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const BigNumber = require('bignumber.js');
  const Controller = artifacts.require("Controller");

  const Storage = artifacts.require("Storage");
  const { expectRevert, send } = require('@openzeppelin/test-helpers');
  const VaultMigratorStrategy = artifacts.require("VaultMigratorStrategy");
  const Vault = artifacts.require("Vault");
  const IStrategy = artifacts.require("IStrategy");
  const NoMintRewardPool = artifacts.require("NoMintRewardPool");
  const StableVaultMigrator = artifacts.require("StableVaultMigrator");
  const addresses = require("../migrations/config/mainnet/addresses.json");
  const makeVault = require("./make-vault.js");
  
  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  BigNumber.config({DECIMAL_PLACES: 0});

  // old vaults are all migrated, so this test would fail from now on.
  contract.skip("Migration basic test", function (accounts) {

    function test(vaultId, sourceTokenAddress, strategySwitch) {
      describe(`Migration for ${vaultId}`, function () {

        const vaultSettings = addresses['V2'][vaultId];

        let storage = "0xc95CbE4ca30055c787CB784BE99D6a8494d0d197";
        let governance = "0xf00dD244228F51547f0563e60bCa65a30FBF5f7f";

        let newStorage;

        let controller;
        let newVault;
        let oldVault;
        let newPool;
        let migrationStrategy;
        let newStrategy;
        let sourceToken;

        let vaultMigrator;
        let etherGiver = accounts[9];

        beforeEach(async function () {
          // deploy storage
          sourceToken = await IERC20.at(sourceTokenAddress);

          newStorage = await Storage.at(addresses['V2']['MigrationStorage']);
          vaultMigrator = await StableVaultMigrator.at(addresses['V2']['StableVaultMigrator']);
          controller = await Controller.at(addresses["Controller"]);

          // vault and migration settings
          oldVault = await Vault.at(vaultSettings["OldVault"]);
          newVault = await Vault.at(vaultSettings["NewVault"]);
          newStrategy = await IStrategy.at(vaultSettings["NewStrategy"]);
          migrationStrategy = await VaultMigratorStrategy.at(vaultSettings['MigrationStrategy']);
          newPool = await NoMintRewardPool.at(vaultSettings['NewPool']);
        });

        it(`migration for ${vaultId}`, async function () {

          console.log("oldVault.underlyingBalanceWithInvestment", (await oldVault.underlyingBalanceWithInvestment()).toString());
          console.log("oldVault.underlyingBalanceInVault", (await oldVault.underlyingBalanceInVault()).toString());

          assert.equal(await oldVault.governance(), governance);

          await oldVault.setStorage(newStorage.address, {from : governance});
          await newVault.setStorage(newStorage.address, {from : governance});
          await migrationStrategy.setStorage(newStorage.address, {from : governance});

          assert.equal(await oldVault.governance(), vaultMigrator.address);
          assert.equal(await newVault.governance(), vaultMigrator.address);
          assert.equal(await migrationStrategy.governance(), vaultMigrator.address);

          await vaultMigrator.migrateInOneTx(
            oldVault.address,
            newVault.address,
            migrationStrategy.address,
            newStrategy.address,
            newPool.address,
            { from : governance }
          );

          assert.equal(await oldVault.governance(), governance);
          assert.equal(await newVault.governance(), governance);

          console.log("newVault.underlyingBalanceInVault", (await newVault.underlyingBalanceInVault()).toString());
          console.log("newVault.underlyingBalanceWithInvestment", (await newVault.underlyingBalanceWithInvestment()).toString());
          console.log("oldVault.underlyingBalanceInVault", (await oldVault.underlyingBalanceInVault()).toString());
          console.log("newVault.balanceOf(newPool.address)", (await newVault.balanceOf(newPool.address)).toString());
          console.log("newVault.getPricePerFullShare", (await newVault.getPricePerFullShare()).toString());
        });
      });
    }

    test("WBTC", MFC.WBTC_ADDRESS);
    test("WETH", MFC.WETH_ADDRESS);
    test("DAI", MFC.DAI_ADDRESS);
    test("USDC", MFC.USDC_ADDRESS);
    test("USDT", MFC.USDT_ADDRESS);
    test("renBTC", MFC.renBTC_ADDRESS);
    test("crvRenWBTC", MFC.crvRenWBTC_ADDRESS);
  });
}
