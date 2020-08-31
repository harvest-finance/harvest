const Controllable = artifacts.require("Controllable");
const Storage = artifacts.require("Storage");
const { expectRevert, constants } = require("@openzeppelin/test-helpers");

contract("Controllable Test", function (accounts) {
  describe("Controller setting", function () {
    let governance = accounts[0];
    let controller = accounts[1];
    let storage;
    let controllable;

    beforeEach(async function () {
      storage = await Storage.new({ from: governance });
      await storage.setController(controller, { from: governance });
      controllable = await Controllable.new(storage.address, {
        from: governance,
      });
    });

    it("set and read", async function () {
      assert.equal(controller, await controllable.controller());
      await storage.setController(accounts[2], { from: governance });
      assert.equal(accounts[2], await controllable.controller());
      await expectRevert(
        storage.setController(controller, { from: accounts[1] }),
        "Not governance"
      );
      await expectRevert(
        storage.setController(constants.ZERO_ADDRESS, { from: governance }),
        "new controller shouldn't be empty"
      );
    });

    it("set storage", async function () {
      await expectRevert(
        controllable.setStorage(constants.ZERO_ADDRESS, { from: governance }),
        "new storage shouldn't be empty"
      );
      await expectRevert(
        controllable.setStorage(controller, { from: accounts[1] }),
        "Not governance"
      );
      await controllable.setStorage(accounts[2], { from: governance });
      assert.equal(accounts[2], await controllable.store());
    });
  });
});
