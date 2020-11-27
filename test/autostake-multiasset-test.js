const BigNumber = require("bignumber.js");
const Controller = artifacts.require("Controller");
const MockToken = artifacts.require("MockToken");
const MockToken6Decimals = artifacts.require("MockToken6Decimals");
const Storage = artifacts.require("Storage");
const MockRewardPool = artifacts.require("MockRewardPool");
const AutoStakeMultiAsset = artifacts.require("AutoStakeMultiAsset");

BigNumber.config({ DECIMAL_PLACES: 0 });

contract("Autostaking with multiple assets", function (accounts) {
  describe("18 decimals", function () {
    let autostake;
    let rewardPool;
    let farm;
    let stakeToken;
    let farmer1 = accounts[1];
    let farmer2 = accounts[2];
    let farmer3 = accounts[3];
    let owner = accounts[0];
    let escrow = accounts[9];
    let storage;
    let controller;
    let rewardCollector = accounts[8];
    let multiassetAutostake;
    const zeroes = "000000000000000000";

    beforeEach(async function () {
      storage = await Storage.new({ from: owner });
      controller = await Controller.new(storage.address, rewardCollector, {
        from: owner,
      });
      await storage.setController(controller.address, { from: owner });
      farm = await MockToken.new({ from: owner });
      stakeToken = await MockToken.new({ from: owner });
      await farm.mint(owner, "710" + zeroes, { from: owner });
      await stakeToken.mint(farmer1, "1000" + zeroes, { from: owner });
      rewardPool = await MockRewardPool.new(stakeToken.address, farm.address);
      autostake = await MockRewardPool.new(farm.address, farm.address);
      multiassetAutostake = await AutoStakeMultiAsset.new(
        storage.address,
        rewardPool.address,
        stakeToken.address,
        escrow,
        autostake.address,
        farm.address
      );
    });

    it("Multistake basic test stake and withdraw", async function () {
      // 1. Farmer1 stakes 1000.
      //   - Farmer 1 has 1000 shares, 0 debt shares.
      // 2. Contract accummulates reward of 200.
      // 3. Farmer 1 withdraws and gets 1000 stake back + 200 FARM tokens
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes, { from: farmer1 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(await stakeToken.balanceOf(farmer1), 0);
      await multiassetAutostake.exit({ from: farmer1 });
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(await stakeToken.balanceOf(farmer1), "1000" + zeroes);
    });

    it("Multistake basic test stake and withdraw with reward", async function () {
      // 1. Farmer1 stakes 1000.
      //   - Farmer 1 has 1000 shares, 0 debt shares.
      // 2. Contract accummulates reward of 200.
      // 3. Farmer 1 withdraws and gets 1000 stake back + 200 FARM tokens
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes, { from: farmer1 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);

      // configure the reward first
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });

      // exit now
      await multiassetAutostake.exit({ from: farmer1 });
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), "200" + zeroes);
      assert.equal(await stakeToken.balanceOf(farmer1), "1000" + zeroes);
    });

    it("Multistake with 2 farmers staking", async function () {
      // 1. Farmer1 stakes 1000.
      //   - Farmer1 has 1000 shares, 0 debt shares.
      // 2. Contract acummulates reward of 200.
      // 3. Farmer2 stakes 100. Farmer1 should have 1000 stakes + 200 in autostake, farmer 1 only 100.
      // - Farmer 1 has 1000 shares, 0 debt shares, 200 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 0 in autostake
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes, { from: farmer1 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);

      // configure the reward first
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });

      // Farmer2 stakes
      await stakeToken.mint(farmer2, "100" + zeroes, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "100" + zeroes, {
        from: farmer2,
      });
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes);
      await multiassetAutostake.stake("100" + zeroes, { from: farmer2 });

      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      // assert.isTrue(false);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "200" + zeroes
      );

      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // exit now
      await multiassetAutostake.exit({ from: farmer1 });
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), "200" + zeroes);
      assert.equal(await stakeToken.balanceOf(farmer1), "1000" + zeroes);

      await multiassetAutostake.exit({ from: farmer2 });
      assert.equal(await multiassetAutostake.balanceOf(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(await farm.balanceOf(farmer2), 0);
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
    });

    it("Multistake with 2 farmers staking and extra farm reward", async function () {
      // 1. Farmer1 stakes 1000.
      //   - Farmer1 has 1000 shares, 0 debt shares.
      // 2. Contract acummulates reward of 200.
      // 3. Farmer2 stakes 100. Farmer1 should have 1000 stakes + 200 in autostake, farmer 1 only 100.
      // - Farmer 1 has 1000 shares, 0 debt shares, 200 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 0 in autostake
      // 4. Contract gets 110 from reward pool
      // - Farmer 1 has 1000 shares, 0 debt shares, 300 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 10 in autostake
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes, { from: farmer1 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);

      // configure the reward first
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });

      // Farmer2 stakes
      await stakeToken.mint(farmer2, "100" + zeroes, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "100" + zeroes, {
        from: farmer2,
      });
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes);
      await multiassetAutostake.stake("100" + zeroes, { from: farmer2 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "200" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // reward again
      await farm.approve(rewardPool.address, "110" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "110" + zeroes, {
        from: owner,
      });
      await multiassetAutostake.refreshAutoStake();
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "300" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1],
        "10" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // exit now
      await multiassetAutostake.exit({ from: farmer1 });
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), "300" + zeroes);
      assert.equal(await stakeToken.balanceOf(farmer1), "1000" + zeroes);

      await multiassetAutostake.exit({ from: farmer2 });
      assert.equal(await multiassetAutostake.balanceOf(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(await farm.balanceOf(farmer2), "10" + zeroes);
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
    });

    it("Multistake with 2 farmers staking and extra farm reward plus FARM autostake reward", async function () {
      // 1. Farmer1 stakes 1000.
      //   - Farmer1 has 1000 shares, 0 debt shares.
      // 2. Contract acummulates reward of 200.
      // 3. Farmer2 stakes 100. Farmer1 should have 1000 stakes + 200 in autostake, farmer 1 only 100.
      // - Farmer 1 has 1000 shares, 0 debt shares, 200 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 0 in autostake
      // 4. Contract gets 110 from reward pool
      // - Farmer 1 has 1000 shares, 0 debt shares, 300 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 10 in autostake
      // 5. FARM autostake rewards 310 FARM
      // - Farmer 1 has 1000 shares, 0 debt shares, 600 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 20 in autostake
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes, { from: farmer1 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);

      // configure the reward first
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });

      // Farmer2 stakes
      await stakeToken.mint(farmer2, "100" + zeroes, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "100" + zeroes, {
        from: farmer2,
      });
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes);
      await multiassetAutostake.stake("100" + zeroes, { from: farmer2 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "200" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // reward again
      await farm.approve(rewardPool.address, "110" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "110" + zeroes, {
        from: owner,
      });
      await multiassetAutostake.refreshAutoStake();
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "300" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1],
        "10" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // award extra 310
      await farm.approve(autostake.address, "310" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "310" + zeroes, {
        from: owner,
      });
      await multiassetAutostake.refreshAutoStake();
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      // debt per share doubles because we doubled the amount of FARM tied to shares
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "2" + zeroes);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "600" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1],
        "20" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // exit now
      await multiassetAutostake.exit({ from: farmer1 });
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), "600" + zeroes);
      assert.equal(await stakeToken.balanceOf(farmer1), "1000" + zeroes);

      await multiassetAutostake.exit({ from: farmer2 });
      assert.equal(await multiassetAutostake.balanceOf(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(await farm.balanceOf(farmer2), "20" + zeroes);
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
    });

    it("Complex test", async function () {
      // 1. Farmer1 stakes 1000.
      //   - farm 20, autostake 0
      // 2. Farmer 2 stakes 3000
      //   - farm 100, autostake 10
      // 3. Farmer 1 withdraws
      //   - farm 200, autostake 10
      // 4. Farmer 3 stakes 300
      //   - farm 330, autostake 10
      // 5. Farmer 3 withdraws
      //   - farm 100, 50 autostake
      // 6. Farmer 2 withdraws
      await farm.mint(owner, "10000000" + zeroes, { from: owner });

      // 1. Farmer 1 stakes 1000.
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes, { from: farmer1 });

      // Reward: farm 20, autostake 0
      await farm.approve(rewardPool.address, "20" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "20" + zeroes, {
        from: owner,
      });

      // 2. Farmer 2 stakes 3000
      await stakeToken.mint(farmer2, "3000" + zeroes, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "3000" + zeroes, {
        from: farmer2,
      });
      assert.equal(await stakeToken.balanceOf(farmer2), "3000" + zeroes);
      await multiassetAutostake.stake("3000" + zeroes, { from: farmer2 });
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1].toString()
      );

      // Reward: farm 100, autostake 10
      await farm.approve(rewardPool.address, "100" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "100" + zeroes, {
        from: owner,
      });
      await farm.approve(autostake.address, "10" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "10" + zeroes, {
        from: owner,
      });

      // 3. Farmer 1 withdraws
      await multiassetAutostake.exit({ from: farmer1 });
      console.log("------------");
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1].toString()
      );
      console.log((await stakeToken.balanceOf(farmer1)).toString());
      console.log((await farm.balanceOf(farmer1)).toString());
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1].toString()
      );

      // Reward: farm 200, autostake 10
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });
      await farm.approve(autostake.address, "10" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "10" + zeroes, {
        from: owner,
      });

      // 4. Farmer 3 stakes 300
      await stakeToken.mint(farmer3, "300" + zeroes, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "300" + zeroes, {
        from: farmer3,
      });
      assert.equal(await stakeToken.balanceOf(farmer3), "300" + zeroes);
      await multiassetAutostake.stake("300" + zeroes, { from: farmer3 });
      console.log("------------");
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer3))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer3))[1].toString()
      );

      // Reward: farm 330, autostake 10
      await farm.approve(rewardPool.address, "330" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "330" + zeroes, {
        from: owner,
      });
      await farm.approve(autostake.address, "10" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "10" + zeroes, {
        from: owner,
      });

      // 5. Farmer 3 withdraws
      await multiassetAutostake.exit({ from: farmer3 });
      console.log("------------");
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer3))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer3))[1].toString()
      );

      // Reward: farm 100, autostake 10
      await farm.approve(rewardPool.address, "100" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "100" + zeroes, {
        from: owner,
      });
      await farm.approve(autostake.address, "50" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "50" + zeroes, {
        from: owner,
      });

      // 6. Farmer 2 withdraws
      await multiassetAutostake.exit({ from: farmer2 });
      console.log("------------");
      console.log((await farm.balanceOf(farmer1)).toString());
      console.log((await stakeToken.balanceOf(farmer1)).toString());
      console.log((await farm.balanceOf(farmer2)).toString());
      console.log((await stakeToken.balanceOf(farmer2)).toString());
      console.log((await farm.balanceOf(farmer3)).toString());
      console.log((await stakeToken.balanceOf(farmer3)).toString());

      assert.equal(await farm.balanceOf(farmer1), "55000000000000000000");
      assert.equal(
        await stakeToken.balanceOf(farmer1),
        "1000000000000000000000"
      );
      assert.equal(await farm.balanceOf(farmer2), "744999999999999999000"); // due to rounding error
      assert.equal(
        await stakeToken.balanceOf(farmer2),
        "3000000000000000000000"
      );
      assert.equal(await farm.balanceOf(farmer3), "30000000000000000267"); // due to rounding error
      assert.equal(
        await stakeToken.balanceOf(farmer3),
        "300000000000000000000"
      );
    });
  });

  describe("6 decimals", function () {
    let autostake;
    let rewardPool;
    let farm;
    let stakeToken;
    let farmer1 = accounts[1];
    let farmer2 = accounts[2];
    let farmer3 = accounts[3];
    let owner = accounts[0];
    let escrow = accounts[9];
    let storage;
    let controller;
    let rewardCollector = accounts[8];
    let multiassetAutostake;
    const zeroes = "000000000000000000";
    const zeroes6 = "000000000";

    const mintAndSetReward = async function(amount, pool) {
      await farm.mint(owner, amount, {from: owner});
      await farm.approve(pool.address, amount, {from: owner});
      await pool.reward(multiassetAutostake.address, amount, {
        from: owner,
      });
    }

    const mintAndStake = async function(amount, farmer) {
      await stakeToken.mint(farmer, amount, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, amount, {
        from: farmer,
      });
      await multiassetAutostake.stake(amount, { from: farmer });
    }

    beforeEach(async function () {
      storage = await Storage.new({ from: owner });
      controller = await Controller.new(storage.address, rewardCollector, {
        from: owner,
      });
      await storage.setController(controller.address, { from: owner });
      farm = await MockToken.new({ from: owner });
      stakeToken = await MockToken6Decimals.new({ from: owner });
      await farm.mint(owner, "710" + zeroes, { from: owner });
      await stakeToken.mint(farmer1, "1000" + zeroes6, { from: owner });
      rewardPool = await MockRewardPool.new(stakeToken.address, farm.address);
      autostake = await MockRewardPool.new(farm.address, farm.address);
      multiassetAutostake = await AutoStakeMultiAsset.new(
        storage.address,
        rewardPool.address,
        stakeToken.address,
        escrow,
        autostake.address,
        farm.address
      );
    });

    it("Multistake basic test stake and withdraw", async function () {
      // 1. Farmer1 stakes 1000.
      //   - Farmer 1 has 1000 shares, 0 debt shares.
      // 2. Contract accummulates reward of 200.
      // 3. Farmer 1 withdraws and gets 1000 stake back + 200 FARM tokens
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes6, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes6, { from: farmer1 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(await stakeToken.balanceOf(farmer1), 0);
      await multiassetAutostake.exit({ from: farmer1 });
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(await stakeToken.balanceOf(farmer1), "1000" + zeroes6);
    });

    it("Multistake basic test stake and withdraw", async function () {
      // 1. Farmer1 stakes 1000.
      //   - Farmer 1 has 1000 shares, 0 debt shares.
      // 2. Contract accummulates reward of 200.
      // 3. Farmer 1 withdraws and gets 1000 stake back + 200 FARM tokens
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes6, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes6, { from: farmer1 });
      assert.equal(
          await multiassetAutostake.balanceOf(farmer1),
          "1000" + zeroes6
      );
      assert.equal(
          (await multiassetAutostake.balanceOfJoint(farmer1))[0],
          "1000" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(await stakeToken.balanceOf(farmer1), 0);
      await multiassetAutostake.exit({ from: farmer1 });
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(await stakeToken.balanceOf(farmer1), "1000" + zeroes6);
    });

    it("Incremental stake test stake and withdraw with reward", async function () {
      // 1. Farmer1 stakes 1000.
      //   - Farmer 1 has 1000 shares, 0 debt shares.
      // 2. Contract accummulates reward of 200.
      // 3. Farmer1 stakes 1000
      // 4. Contract accummulates reward of 200, autostake accummulates 200
      // 5. Farmer1 stakes 1000
      // 6. Contract accummulates reward of 200, autostake accummulates 200
      // 7. Farmer 1 withdraws and gets 3000 stake back + 1000 FARM tokens
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes6, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes6, { from: farmer1 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);

      // configure the reward first
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });

      // second stake
      await stakeToken.mint(farmer1, "1000" + zeroes6, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes6, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes6, { from: farmer1 });
      assert.equal(
          await multiassetAutostake.balanceOf(farmer1),
          "2000" + zeroes6
      );
      assert.equal(
          (await multiassetAutostake.balanceOfJoint(farmer1))[0],
          "2000" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), "200" + zeroes);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], "200" + zeroes);
      assert.equal(await farm.balanceOf(farmer1), 0);

      // second reward
      await farm.mint(owner, "400" + zeroes, { from: owner });
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });
      await farm.approve(autostake.address, "200" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });

      // third stake
      await stakeToken.mint(farmer1, "1000" + zeroes6, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes6, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes6, { from: farmer1 });
      assert.equal(
          await multiassetAutostake.balanceOf(farmer1),
          "3000" + zeroes6
      );
      assert.equal(
          (await multiassetAutostake.balanceOfJoint(farmer1))[0],
          "3000" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "2" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), "450" + zeroes);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], "600" + zeroes);
      assert.equal(await farm.balanceOf(farmer1), 0);

      // third reward
      await farm.mint(owner, "400" + zeroes, { from: owner });
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });
      await farm.approve(autostake.address, "200" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });

      // exit now
      await multiassetAutostake.exit({ from: farmer1 });
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), "999999999999999999999"); // rounding error
      assert.equal(await stakeToken.balanceOf(farmer1), "3000" + zeroes6);
    });

    it("Incremental stake test stake interleaving", async function () {
      // 1. Farmer1 stakes 1000.
      // 2. Contract accummulates reward of 200.
      // 3. Farmer2 stakes 1000
      // Repeat 2x (numbers will vary for easy calculations):
      //   - Contract accummulates reward of X, autostake accummulates X
      //   - Farmer1 stakes 1000
      //   - Contract accummulates reward of X, autostake accummulates X
      //   - Farmer2 stakes 1000
      // 4. Farmer 2 withdraws and gets 3000 stake back + 1000 FARM tokens
      // 5. Farmer 1 withdraws and gets 3000 stake back + 1000 FARM tokens
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes6, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes6, { from: farmer1 });
      assert.equal(
          await multiassetAutostake.balanceOf(farmer1),
          "1000" + zeroes6
      );
      assert.equal(
          (await multiassetAutostake.balanceOfJoint(farmer1))[0],
          "1000" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);

      // configure the reward first
      await mintAndSetReward("200" + zeroes, rewardPool);

      // second stake
      await mintAndStake("1000" + zeroes6, farmer2);
      // farmer 1: + 200 FARM into autostake

      await mintAndSetReward("200" + zeroes, rewardPool);
      await mintAndSetReward("200" + zeroes, autostake);
      await mintAndStake("1000" + zeroes6, farmer1);
      // farmer 1: + 200 FARM from autostake, 400 in autostake total
      // farmer 2: + 100 FARM from pool, 100 in autostake
      // farmer 1: + 100 FARM from pool, 500 in autostake total
      // stake farmer1 2000, farmer2 1000

      await mintAndSetReward("300" + zeroes, rewardPool);
      await mintAndSetReward("600" + zeroes, autostake);
      await mintAndStake("1000" + zeroes6, farmer2);
      // farmer 1: + 500 FARM from autostake, 1000 in autostake total
      // farmer 2: + 100 FARM from autostake, 200 in autostake total
      // farmer 1: + 200 FARM from pool, 1200 in autostake total
      // farmer 2: + 100 FARM from pool, 300 in autostake total
      // stake farmer1 2000, farmer2 2000

      await mintAndSetReward("200" + zeroes, rewardPool);
      await mintAndSetReward("500" + zeroes, autostake);
      await mintAndStake("1000" + zeroes6, farmer1);
      // farmer 1: + 400 FARM from autostake, 1600 in autostake total
      // farmer 2: + 100 FARM from autostake, 400 in autostake total
      // farmer 1: + 100 FARM from pool, 1700 in autostake total
      // farmer 2: + 100 FARM from pool, 500 in autostake total
      // stake farmer1 3000, farmer2 2000

      await mintAndSetReward("500" + zeroes, rewardPool);
      await mintAndSetReward("2200" + zeroes, autostake);
      await mintAndStake("1000" + zeroes6, farmer2);
      // farmer 1: + 1700 FARM from autostake, 3400 in autostake total
      // farmer 2: + 500 FARM from autostake, 1000 in autostake total
      // farmer 1: + 300 FARM from pool, 3700 in autostake total
      // farmer 2: + 200 FARM from pool, 1200 in autostake total
      // stake farmer1 3000, farmer2 3000

      // exit now
      await multiassetAutostake.exit({ from: farmer1 });
      await multiassetAutostake.exit({ from: farmer2 });
      // farmer1
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), "3699999999999999999698"); // rounding error
      assert.equal(await stakeToken.balanceOf(farmer1), "3000" + zeroes6);
      // farmer2
      assert.equal(await multiassetAutostake.balanceOf(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[0], "0");
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(await farm.balanceOf(farmer2), "1200000000000000000302"); // rounding error
      assert.equal(await stakeToken.balanceOf(farmer2), "3000" + zeroes6);
    });

    it("Multistake with 2 farmers staking", async function () {
      // 1. Farmer1 stakes 1000.
      //   - Farmer1 has 1000 shares, 0 debt shares.
      // 2. Contract acummulates reward of 200.
      // 3. Farmer2 stakes 100. Farmer1 should have 1000 stakes + 200 in autostake, farmer 1 only 100.
      // - Farmer 1 has 1000 shares, 0 debt shares, 200 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 0 in autostake
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes6, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes6, { from: farmer1 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);

      // configure the reward first
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });

      // Farmer2 stakes
      await stakeToken.mint(farmer2, "100" + zeroes6, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "100" + zeroes6, {
        from: farmer2,
      });
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes6);
      await multiassetAutostake.stake("100" + zeroes6, { from: farmer2 });

      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      // assert.isTrue(false);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "200" + zeroes
      );

      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes6
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // exit now
      await multiassetAutostake.exit({ from: farmer1 });
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), "200" + zeroes);
      assert.equal(await stakeToken.balanceOf(farmer1), "1000" + zeroes6);

      await multiassetAutostake.exit({ from: farmer2 });
      assert.equal(await multiassetAutostake.balanceOf(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(await farm.balanceOf(farmer2), 0);
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes6);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
    });

    it("Multistake with 2 farmers staking and extra farm reward", async function () {
      // 1. Farmer1 stakes 1000.
      //   - Farmer1 has 1000 shares, 0 debt shares.
      // 2. Contract acummulates reward of 200.
      // 3. Farmer2 stakes 100. Farmer1 should have 1000 stakes + 200 in autostake, farmer 1 only 100.
      // - Farmer 1 has 1000 shares, 0 debt shares, 200 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 0 in autostake
      // 4. Contract gets 110 from reward pool
      // - Farmer 1 has 1000 shares, 0 debt shares, 300 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 10 in autostake
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes6, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes6, { from: farmer1 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);

      // configure the reward first
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });

      // Farmer2 stakes
      await stakeToken.mint(farmer2, "100" + zeroes6, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "100" + zeroes6, {
        from: farmer2,
      });
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes6);
      await multiassetAutostake.stake("100" + zeroes6, { from: farmer2 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "200" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes6
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // reward again
      await farm.approve(rewardPool.address, "110" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "110" + zeroes, {
        from: owner,
      });
      await multiassetAutostake.refreshAutoStake();
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "300" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1],
        "10" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes6
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // exit now
      await multiassetAutostake.exit({ from: farmer1 });
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), "300" + zeroes);
      assert.equal(await stakeToken.balanceOf(farmer1), "1000" + zeroes6);

      await multiassetAutostake.exit({ from: farmer2 });
      assert.equal(await multiassetAutostake.balanceOf(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(await farm.balanceOf(farmer2), "10" + zeroes);
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes6);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
    });

    it("Multistake with 2 farmers staking and extra farm reward plus FARM autostake reward", async function () {
      // 1. Farmer1 stakes 1000.
      //   - Farmer1 has 1000 shares, 0 debt shares.
      // 2. Contract acummulates reward of 200.
      // 3. Farmer2 stakes 100. Farmer1 should have 1000 stakes + 200 in autostake, farmer 1 only 100.
      // - Farmer 1 has 1000 shares, 0 debt shares, 200 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 0 in autostake
      // 4. Contract gets 110 from reward pool
      // - Farmer 1 has 1000 shares, 0 debt shares, 300 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 10 in autostake
      // 5. FARM autostake rewards 310 FARM
      // - Farmer 1 has 1000 shares, 0 debt shares, 600 in autostake
      // - Farmer 2 has 100 shares, 20 debt shares, 20 in autostake
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes6, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes6, { from: farmer1 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), 0);

      // configure the reward first
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });

      // Farmer2 stakes
      await stakeToken.mint(farmer2, "100" + zeroes6, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "100" + zeroes6, {
        from: farmer2,
      });
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes6);
      await multiassetAutostake.stake("100" + zeroes6, { from: farmer2 });
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "200" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes6
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // reward again
      await farm.approve(rewardPool.address, "110" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "110" + zeroes, {
        from: owner,
      });
      await multiassetAutostake.refreshAutoStake();
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "300" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1],
        "10" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes6
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // award extra 310
      await farm.approve(autostake.address, "310" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "310" + zeroes, {
        from: owner,
      });
      await multiassetAutostake.refreshAutoStake();
      assert.equal(
        await multiassetAutostake.balanceOf(farmer1),
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0],
        "1000" + zeroes6
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0],
        "100" + zeroes6
      );
      assert.equal(await multiassetAutostake.debtShare(farmer1), 0);
      assert.equal(await multiassetAutostake.debtShare(farmer2), "20" + zeroes);
      // debt per share doubles because we doubled the amount of FARM tied to shares
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "2" + zeroes);
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1],
        "600" + zeroes
      );
      assert.equal(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1],
        "20" + zeroes
      );
      assert.equal(await farm.balanceOf(farmer1), 0);
      assert.equal(
        await multiassetAutostake.balanceOf(farmer2),
        "100" + zeroes6
      );
      assert.equal(await farm.balanceOf(farmer2), 0);

      // exit now
      await multiassetAutostake.exit({ from: farmer1 });
      assert.equal(await multiassetAutostake.balanceOf(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer1), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer1))[1], 0);
      assert.equal(await farm.balanceOf(farmer1), "600" + zeroes);
      assert.equal(await stakeToken.balanceOf(farmer1), "1000" + zeroes6);

      await multiassetAutostake.exit({ from: farmer2 });
      assert.equal(await multiassetAutostake.balanceOf(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[0], "0");
      assert.equal(await multiassetAutostake.debtShare(farmer2), "0");
      assert.equal((await multiassetAutostake.balanceOfJoint(farmer2))[1], 0);
      assert.equal(await farm.balanceOf(farmer2), "20" + zeroes);
      assert.equal(await stakeToken.balanceOf(farmer2), "100" + zeroes6);
      assert.equal(await multiassetAutostake.debtPerDebtShare(), "1" + zeroes);
    });

    it("Complex test", async function () {
      // 1. Farmer1 stakes 1000.
      //   - farm 20, autostake 0
      // 2. Farmer 2 stakes 3000
      //   - farm 100, autostake 10
      // 3. Farmer 1 withdraws
      //   - farm 200, autostake 10
      // 4. Farmer 3 stakes 300
      //   - farm 330, autostake 10
      // 5. Farmer 3 withdraws
      //   - farm 100, 50 autostake
      // 6. Farmer 2 withdraws
      await farm.mint(owner, "10000000" + zeroes, { from: owner });

      // 1. Farmer 1 stakes 1000.
      await stakeToken.approve(multiassetAutostake.address, "1000" + zeroes6, {
        from: farmer1,
      });
      await multiassetAutostake.stake("1000" + zeroes6, { from: farmer1 });

      // Reward: farm 20, autostake 0
      await farm.approve(rewardPool.address, "20" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "20" + zeroes, {
        from: owner,
      });

      // 2. Farmer 2 stakes 3000
      await stakeToken.mint(farmer2, "3000" + zeroes6, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "3000" + zeroes6, {
        from: farmer2,
      });
      assert.equal(await stakeToken.balanceOf(farmer2), "3000" + zeroes6);
      await multiassetAutostake.stake("3000" + zeroes6, { from: farmer2 });
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1].toString()
      );

      // Reward: farm 100, autostake 10
      await farm.approve(rewardPool.address, "100" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "100" + zeroes, {
        from: owner,
      });
      await farm.approve(autostake.address, "10" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "10" + zeroes, {
        from: owner,
      });

      // 3. Farmer 1 withdraws
      await multiassetAutostake.exit({ from: farmer1 });
      console.log("------------");
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1].toString()
      );
      console.log((await stakeToken.balanceOf(farmer1)).toString());
      console.log((await farm.balanceOf(farmer1)).toString());
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1].toString()
      );

      // Reward: farm 200, autostake 10
      await farm.approve(rewardPool.address, "200" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "200" + zeroes, {
        from: owner,
      });
      await farm.approve(autostake.address, "10" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "10" + zeroes, {
        from: owner,
      });

      // 4. Farmer 3 stakes 300
      await stakeToken.mint(farmer3, "300" + zeroes6, { from: owner });
      await stakeToken.approve(multiassetAutostake.address, "300" + zeroes6, {
        from: farmer3,
      });
      assert.equal(await stakeToken.balanceOf(farmer3), "300" + zeroes6);
      await multiassetAutostake.stake("300" + zeroes6, { from: farmer3 });
      console.log("------------");
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer3))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer3))[1].toString()
      );

      // Reward: farm 330, autostake 10
      await farm.approve(rewardPool.address, "330" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "330" + zeroes, {
        from: owner,
      });
      await farm.approve(autostake.address, "10" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "10" + zeroes, {
        from: owner,
      });

      // 5. Farmer 3 withdraws
      await multiassetAutostake.exit({ from: farmer3 });
      console.log("------------");
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer1))[1].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer2))[1].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer3))[0].toString()
      );
      console.log(
        (await multiassetAutostake.balanceOfJoint(farmer3))[1].toString()
      );

      // Reward: farm 100, autostake 10
      await farm.approve(rewardPool.address, "100" + zeroes, { from: owner });
      await rewardPool.reward(multiassetAutostake.address, "100" + zeroes, {
        from: owner,
      });
      await farm.approve(autostake.address, "50" + zeroes, { from: owner });
      await autostake.reward(multiassetAutostake.address, "50" + zeroes, {
        from: owner,
      });

      // 6. Farmer 2 withdraws
      await multiassetAutostake.exit({ from: farmer2 });
      console.log("------------");
      console.log((await farm.balanceOf(farmer1)).toString());
      console.log((await stakeToken.balanceOf(farmer1)).toString());
      console.log((await farm.balanceOf(farmer2)).toString());
      console.log((await stakeToken.balanceOf(farmer2)).toString());
      console.log((await farm.balanceOf(farmer3)).toString());
      console.log((await stakeToken.balanceOf(farmer3)).toString());

      assert.equal(await farm.balanceOf(farmer1), "55000000000000000000");
      assert.equal(await stakeToken.balanceOf(farmer1), "1000000000000");
      assert.equal(await farm.balanceOf(farmer2), "744999999999999999987"); // due to rounding error
      assert.equal(await stakeToken.balanceOf(farmer2), "3000000000000");
      assert.equal(await farm.balanceOf(farmer3), "30000000000000000013"); // due to rounding error
      assert.equal(await stakeToken.balanceOf(farmer3), "300000000000");
    });
  });
});
