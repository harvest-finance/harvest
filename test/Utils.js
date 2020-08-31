const BigNumber = require('bignumber.js');
const { time } = require("@openzeppelin/test-helpers");
BigNumber.config({DECIMAL_PLACES: 0});

let gasLogger = {};
let gasLoggerNum = {};

async function gasLog(logTo, targetPromise) {
  let tx = await targetPromise;
  gasUsed = tx.receipt.gasUsed;

  if(gasLogger[logTo] == undefined) {
    gasLogger[logTo] = gasUsed;
    gasLoggerNum[logTo] = 1;
  }
  else {
    gasLogger[logTo] = (gasLogger[logTo])/(gasLoggerNum[logTo]+1) + gasUsed/(gasLoggerNum[logTo]+1);
    gasLoggerNum[logTo]++;
  }
}

async function printGasLog() {
  console.log(gasLogger);
}

async function advanceNBlock (n) {
  let startingBlock = await time.latestBlock();
  await time.increase(15 * Math.round(n));
  let endBlock = startingBlock.addn(n);
  await time.advanceBlockTo(endBlock);
}

function assertBNEq(a, b){
  let _a = new BigNumber(a);
  let _b = new BigNumber(b);
  let msg = _a.toFixed() + " != " + _b.toFixed();
  assert.equal(_a.eq(_b), true, msg);
}

function assertApproxBNEq(a, b, c){
  let _a = new BigNumber(a).div(c);
  let _b = new BigNumber(b).div(c);
  let msg = _a.toFixed() + " != " + _b.toFixed();
  assert.equal(_a.eq(_b), true, msg);
}

function assertBNGt(a, b){
  let _a = new BigNumber(a);
  let _b = new BigNumber(b);
  assert.equal(_a.gt(_b), true);
}

function assertNEqBN(a, b){
  let _a = new BigNumber(a);
  let _b = new BigNumber(b);
  assert.equal(_a.eq(_b), false);
}
  
module.exports = {
  gasLogger,
  gasLoggerNum,
  gasLog,
  printGasLog,
  advanceNBlock,
  assertBNEq,
  assertApproxBNEq,
  assertBNGt,
  assertNEqBN,
};
