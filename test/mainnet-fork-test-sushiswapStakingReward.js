// This test is only invoked if MAINNET_FORK is set
if ( process.env.MAINNET_FORK ) {

  const Utils = require("./Utils.js");
  const MFC = require("./mainnet-fork-test-config.js");
  const { expectRevert, send, time } = require('@openzeppelin/test-helpers');
  const BigNumber = require('bignumber.js');
  const Controller = artifacts.require("Controller");
  const Vault = artifacts.require("Vault");
  const Storage = artifacts.require("Storage");
  const SushiMasterChefLPStrategy = artifacts.require("SushiMasterChefLPStrategy");
  const StrategyProxy = artifacts.require("StrategyProxy");
  const IMasterChef = artifacts.require("IMasterChef");
  const FeeRewardForwarder = artifacts.require("FeeRewardForwarder");
  const makeVault = require("./make-vault.js");

  // ERC20 interface
  const IERC20 = artifacts.require("IERC20");
  // UniswapV2 Router
  const UniswapV2Router02 = artifacts.require("IUniswapV2Router02");

  BigNumber.config({DECIMAL_PLACES: 0});

  contract("Mainnet Sushiswap Staking Reward", function(accounts){
    function test(vaultId, tokens, whales, sushiPoolId, sushiLPAddress, tokenLiquidationPaths){
      describe(`Sushiswap Staking Reward earnings for ${vaultId}`, function (){

        // external contracts
        let underlying;
        let cropToken;
        let cropPool;
        let token0;
        let token1;
        let sushiswapRouter;

        // external setup
        let poolID = sushiPoolId;
        let token0Whale = whales[0];
        let token1Whale = whales[1];

        let token0Path; // wbtc
        let token1Path; // tbtc

        // parties in the protocol
        let governance = accounts[1];
        let farmer1 = accounts[3];

        // numbers used in tests
        //                    "000000000000000000"
        // const farmerBalance = "10000000000";
        let farmerBalance;

        // only used for ether distribution
        let etherGiver = accounts[9];

        // Core protocol contracts
        let storage;
        let controller;
        let vault;
        let strategyImpl;
        let strategy;
        let strategyAsProxy;
        let feeRewardForwarder;


        async function setupExternalContracts() {
          underlying = await IERC20.at(sushiLPAddress);
          cropToken = await IERC20.at(MFC.SUSHI_ADDRESS);
          cropPool = await IMasterChef.at(MFC.SUSHISWAP_MASTER_CHEF);
          token0Path = tokenLiquidationPaths[0]; // [MFC.SUSHI_ADDRESS, MFC.WETH_ADDRESS, tokens[0]];
          token1Path = tokenLiquidationPaths[1]; // [MFC.SUSHI_ADDRESS, MFC.WETH_ADDRESS, tokens[1]];
          token0 = await IERC20.at(tokens[0]);
          token1 = await IERC20.at(tokens[1]);

          sushiswapRouter = await UniswapV2Router02.at(MFC.SUSHISWAP_ROUTER_ADDRESS);

          // master chef does not have this
          cropPool.balanceOf = async (address) => {
            const info = await cropPool.userInfo(poolID, address);
            return info.amount;
          }
        }

        async function resetBalance() {
          // Give whale some ether to make sure the following actions are good
          await send.ether(etherGiver, token0Whale, "1000000000000000000");
          await send.ether(etherGiver, token1Whale, "1000000000000000000");

          await token0.transfer(farmer1, await token0.balanceOf(token0Whale), {from: token0Whale});
          await token1.transfer(farmer1, await token1.balanceOf(token1Whale), {from: token1Whale});
          let token0Balance = await token0.balanceOf(farmer1);
          let token1Balance = await token1.balanceOf(farmer1);

          await token0.approve(sushiswapRouter.address, token0Balance, {from:farmer1});
          await token1.approve(sushiswapRouter.address, token1Balance, {from:farmer1});
          await sushiswapRouter.addLiquidity(
            token0.address,
            token1.address,
            token0Balance, // desired
            token1Balance, // desired
            1,  // min
            1,  // min
            farmer1,
            1760144767,
            { from: farmer1 }
          );

          farmerBalance = await underlying.balanceOf(farmer1);
        }

        async function setupCoreProtocol() {
          // deploy storage
          storage = await Storage.new({ from: governance });

          feeRewardForwarder = await FeeRewardForwarder.new(storage.address, underlying.address, MFC.UNISWAP_V2_ROUTER02_ADDRESS, { from: governance });
          // set up controller
          controller = await Controller.new(storage.address, feeRewardForwarder.address, {
            from: governance,
          });

          await storage.setController(controller.address, { from: governance });

          // set up the vault with 100% investment
          vault = await makeVault(storage.address, underlying.address, 100, 100, {from: governance});

          // set up the strategy
          // set up the strategy
          strategyImpl = await SushiMasterChefLPStrategy.new(
            { from: governance }
          );

          strategyAsProxy = await StrategyProxy.new(
            strategyImpl.address,
            { from: governance }
          );

          strategy = await SushiMasterChefLPStrategy.at(strategyAsProxy.address);

          await strategy.initializeStrategy(
            storage.address,
            underlying.address,
            vault.address,
            cropPool.address,
            cropToken.address,
            poolID,
            { from: governance }
          );

          await strategy.setLiquidationPathsOnUni(
            token0Path,
            token1Path,
            {from: governance}
          );

          await strategy.setLiquidationPathsOnSushi(
            token0Path,
            token1Path,
            {from: governance}
          );

          await strategy.setUseUni(
            false,
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
          Utils.assertBNEq(_amount, await vault.balanceOf(_farmer));
          // assert.equal(_amount, await vault.getContributions(_farmer));
        }

        it("A farmer investing underlying", async function () {
          // time travel to enable Uni rewards
          await time.increase(20000);
          await Utils.advanceNBlock(10);
          await cropPool.massUpdatePools();

          let duration = 500000;
          let farmerOldBalance = new BigNumber(await underlying.balanceOf(farmer1));
          await depositVault(farmer1, underlying, vault, farmerBalance);
          await vault.doHardWork({from: governance});
          let strategyOldBalance = new BigNumber(await cropPool.balanceOf(strategy.address));
          Utils.assertBNEq(strategyOldBalance.toFixed(), farmerOldBalance.toFixed()); // strategy invested into pool after `invest`
          await Utils.advanceNBlock(10);

          await vault.doHardWork({from: governance});

          // this is bad code
          while (true) {
            await time.increase(duration);
            await Utils.advanceNBlock(100);
            let pending = new BigNumber(await cropPool.pendingSushi(poolID, strategy.address));
            if (pending.gt(new BigNumber('1000000000000000000'))) break;
          }

          //await token1.transfer(strategy.address, "111111000000", {from: token1Whale});
          await vault.doHardWork({from: governance});

          strategyNewBalance = new BigNumber(await cropPool.balanceOf(strategy.address));
          // strategy invested more money after doHardWork
          Utils.assertBNGt(strategyNewBalance, strategyOldBalance);

          await time.increase(duration);
          await Utils.advanceNBlock(10);
          //await token0.transfer(strategy.address, "301000000000000000000", {from: token0Whale});
          await vault.doHardWork({from: governance});
          await vault.withdraw(farmerBalance, {from: farmer1});
          let farmerNewBalance = new BigNumber(await underlying.balanceOf(farmer1));
          // Farmer gained money
          Utils.assertBNGt(farmerNewBalance, farmerOldBalance);
        });
      });
    }

    // Can only uncomment one at a time because of the overlap in WETH

    // test("WETH_USDT",
    //   [MFC.WETH_ADDRESS, MFC.USDT_ADDRESS],
    //   [MFC.WETH_WHALE_ADDRESS, MFC.USDT_WHALE_ADDRESS],
    //   MFC.SUSHISWAP_USDT_WETH_POOL_ID,
    //   MFC.SUSHISWAP_USDT_WETH_LP_ADDRESS,
    //   [
    //     [MFC.SUSHI_ADDRESS, MFC.WETH_ADDRESS],
    //     [MFC.SUSHI_ADDRESS, MFC.WETH_ADDRESS, MFC.USDT_ADDRESS]
    //   ]
    // );

    // test("USDC_WETH",
    //   [MFC.USDC_ADDRESS, MFC.WETH_ADDRESS],
    //   [MFC.USDC_WHALE_ADDRESS, MFC.WETH_WHALE_ADDRESS],
    //   MFC.SUSHISWAP_USDC_WETH_POOL_ID,
    //   MFC.SUSHISWAP_USDC_WETH_LP_ADDRESS,
    //   [
    //     [MFC.SUSHI_ADDRESS, MFC.WETH_ADDRESS, MFC.USDC_ADDRESS],
    //     [MFC.SUSHI_ADDRESS, MFC.WETH_ADDRESS]
    //   ]
    // );

    // test("DAI_WETH",
    //   [MFC.DAI_ADDRESS, MFC.WETH_ADDRESS],
    //   [MFC.DAI_WHALE_ADDRESS, MFC.WETH_WHALE_ADDRESS],
    //   MFC.SUSHISWAP_DAI_WETH_POOL_ID,
    //   MFC.SUSHISWAP_DAI_WETH_LP_ADDRESS,
    //   [
    //     [MFC.SUSHI_ADDRESS, MFC.WETH_ADDRESS, MFC.DAI_ADDRESS],
    //     [MFC.SUSHI_ADDRESS, MFC.WETH_ADDRESS]
    //   ]
    // );

    test("WBTC_WETH",
      [MFC.WBTC_ADDRESS, MFC.WETH_ADDRESS],
      [MFC.WBTC_WHALE_ADDRESS, MFC.WETH_WHALE_ADDRESS],
      MFC.SUSHISWAP_WBTC_WETH_POOL_ID,
      MFC.SUSHISWAP_WBTC_WETH_LP_ADDRESS,
      [
        [MFC.SUSHI_ADDRESS, MFC.WETH_ADDRESS, MFC.WBTC_ADDRESS],
        [MFC.SUSHI_ADDRESS, MFC.WETH_ADDRESS]
      ]
    );

  });
}
