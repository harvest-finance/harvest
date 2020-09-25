const Utils = require('./Utils.js');
const { time } = require('@openzeppelin/test-helpers');

const Storage = artifacts.require('Storage');
const TestProxy = artifacts.require('TestProxy');
const TestProxyTarget0 = artifacts.require('TestProxyTarget0');
const TestProxyTarget1 = artifacts.require('TestProxyTarget1');

const TARGET_0_RET = 'target0';
const TARGET_1_RET = 'target1';
const PROXY_RET = 'proxy';
const ADDRESS_0 = '0x0000000000000000000000000000000000000000'

contract('TimeLockedProxy', function (accounts) {
  const governance = accounts[1];
  const non_gov = accounts[2];

  let storage;
  let target0;
  let target1;
  let proxy;

  beforeEach(async () => {
    storage = await Storage.new({ from: governance });
    target0 = await TestProxyTarget0.new();
    target1 = await TestProxyTarget1.new();
    proxy = await TestProxy.new(
      target0.address,
      '0x',
      storage.address,
      1
    );
  });

  it('should expose non-admin getters on the proxy', async () => {
    Utils.assertBNEq(
      await proxy.timer(),
      1,
    );

    let result = await proxy.scheduledChange();
    let [time, next] = [result[0], result[1]];
    assert.equal(next, ADDRESS_0);
    Utils.assertBNEq(
      time,
      0
    );

    // check it still loads properly after a change
    await proxy.setNext(target0.address, { from: governance });
    result = await proxy.scheduledChange();
    [time, next] = [result[0], result[1]];
    assert.equal(next, target0.address);
    Utils.assertNEqBN(
      time,
      0
    );
  });

  it('should not expose admin functionality to non-governance', async () => {
    try {
      // we expect an error as this function won't exist
      await proxy.setNext(target1.address, {from: non_gov});
      assert(false);
    } catch (exception) {
      assert.include(exception.message, "revert");
    }
  });

  it('should access target functions if not called by governance', async () => {
    assert.equal(await proxy.getStr.call({ from: governance }), PROXY_RET);
    assert.equal(await proxy.getStr.call({ from: non_gov }), TARGET_0_RET);
  });

  it('should switch targets over automatically', async () => {
    assert.equal(await proxy.getStr.call({ from: non_gov }), TARGET_0_RET);
    assert.equal(await proxy.getStr.call({ from: governance }), PROXY_RET);

    await proxy.setNext(target1.address, { from: governance });
    let scheduled = await proxy.scheduledChange();
    assert.equal(scheduled[1], target1.address);
    await Utils.advanceNBlock(5);

    assert.equal(await proxy.getStr.call({ from: governance }), PROXY_RET);
    assert.equal(await proxy.getStr.call({ from: non_gov }), TARGET_1_RET);
  });
});
