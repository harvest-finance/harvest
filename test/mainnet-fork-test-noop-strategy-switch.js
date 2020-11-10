// This test is only invoked if MAINNET_FORK is set

if ( process.env.MAINNET_FORK ) {

  const MFC = require("./mainnet-fork-test-config.js");
  const BigNumber = require('bignumber.js');
  const Controller = artifacts.require("Controller");

  const Vault = artifacts.require("Vault");
  const IStrategy = artifacts.require("IStrategy");
  const addresses = require("../migrations/config/mainnet/addresses.json");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");

  BigNumber.config({DECIMAL_PLACES: 0});

  // old vaults are all migrated, so this test would fail from now on.
  contract("Strategy Switch Test", function (accounts) {

    function test(vaultId) {
      describe(`Strategy Switch for ${vaultId}`, function () {
        let governance = "0xf00dD244228F51547f0563e60bCa65a30FBF5f7f";
        const vaultSettings = addresses['V2'][vaultId];

        let newVault;
        let newStrategy;

        let etherGiver = accounts[9];

        beforeEach(async function () {
          // vault and migration settings
          newVault = await Vault.at(vaultSettings["NewVault"]);
          newStrategy = vaultSettings["NoopStrategy"];
        });

        it(`switch for ${vaultId}`, async function () {

          console.log("BEFORE====");
          console.log("newVault.underlyingBalanceWithInvestment", (await newVault.underlyingBalanceWithInvestment()).toString());
          console.log("newVault.underlyingBalanceInVault", (await newVault.underlyingBalanceInVault()).toString());
          console.log("newVault.getPricePerFullShare", (await newVault.getPricePerFullShare()).toString());

          await newVault.setVaultFractionToInvest(1,1000000000, {from : governance});
          await newVault.doHardWork({from : governance});
          await newVault.setStrategy(newStrategy, {from : governance});

          console.log("AFTER====");
          console.log("newVault.underlyingBalanceWithInvestment", (await newVault.underlyingBalanceWithInvestment()).toString());
          console.log("newVault.underlyingBalanceInVault", (await newVault.underlyingBalanceInVault()).toString());
          console.log("newVault.getPricePerFullShare", (await newVault.getPricePerFullShare()).toString());
        });
      });
    }

    test("WBTC");
    test("DAI");
    test("USDC");
    test("USDT");
    test("TUSD");
    test("renBTC");
  });
}
