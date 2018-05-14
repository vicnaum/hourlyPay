import ether from 'openzeppelin-solidity/test/helpers/ether';
import { advanceBlock } from 'openzeppelin-solidity/test/helpers/advanceToBlock';
import { increaseTimeTo, duration } from 'openzeppelin-solidity/test/helpers/increaseTime';
import latestTime from 'openzeppelin-solidity/test/helpers/latestTime';

async function debugLog(hourlyPay) {
  console.log("hired", await hourlyPay.hired.call());
  console.log("working", await hourlyPay.working.call());
  let beginTimeTS = new Date((await hourlyPay.beginTimeTS.call()).toNumber()*1000);
  console.log("beginTimeTS:", beginTimeTS.toString());
  let currentDayTS = new Date((await hourlyPay.currentDayTS.call()).toNumber()*1000);
  console.log("currentDayTS:", currentDayTS.toString());
  let currentTime = new Date((await hourlyPay.currentTime.call()).toNumber()*1000);
  console.log("currentTime:", currentTime.toString());
  console.log("contractDurationInDays:", (await hourlyPay.contractDurationInDays.call()).toNumber());
  console.log("earnings:", web3.fromWei(await hourlyPay.earnings.call()).toNumber(), "ETH");
  console.log("dailyHourLimit:", (await hourlyPay.dailyHourLimit.call()).toNumber(), "hours");
  console.log("isNewDay:", await hourlyPay.isNewDay.call());
  console.log("hasEnoughFundsToStart:", await hourlyPay.hasEnoughFundsToStart.call());
  console.log("isOvertime:", await hourlyPay.isOvertime.call());
  console.log("getWorkSecondsInProgress:", (await hourlyPay.getWorkSecondsInProgress.call()).toNumber(), "sec");
  console.log("workedTodayInSeconds:", (await hourlyPay.workedTodayInSeconds.call()).toNumber(), "sec");
}

const BigNumber = web3.BigNumber

const HourlyPay = artifacts.require("HourlyPay");

contract("HourlyPay", accounts => {
  const [owner, employee, alien] = accounts;

  let hourlyPay;
  const rate = web3.toWei(0.1, "ether");

  beforeEach(async () => {
    hourlyPay = await HourlyPay.new();
    await advanceBlock();
  })

  it("sets an owner", async () => {
    assert.equal(await hourlyPay.owner.call(), owner);
  });

  it("accepts funds", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    assert((await web3.eth.getBalance(hourlyPay.address)).eq(testAmount));
  })

  it("can hire", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    assert.equal(await hourlyPay.employeeAddress.call(), employee);
    assert.isTrue(await hourlyPay.hired.call());
  })

  it("can't hire without balance", async () => {
    let testAmount = ether(0.5);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    try {
      await hourlyPay.hire(employee, rate, {from: owner});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }
  })

  it("can't double-hire", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    try {
      await hourlyPay.hire(employee, rate, {from: owner});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }
  })

  it("can't double-hire an alien", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    try {
      await hourlyPay.hire(alien, rate, {from: owner});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }
  })

  it("can't hire after firing", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));
    await hourlyPay.fire({from: owner});
    try {
      await hourlyPay.hire(employee, rate, {from: owner});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }
  })

  it("canStartWork is true", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));
    assert.isTrue(await hourlyPay.canStartWork.call());
  })

  it("can work for 1 hour", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(1));
    await hourlyPay.stopWork({from: employee});
    assert.isAbove(await hourlyPay.earnings.call(), rate*0.99);
    assert.isBelow(await hourlyPay.earnings.call(), rate*1.01);
  })

  it("can work two times for 1 hour", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(1));
    await hourlyPay.stopWork({from: employee});
    await increaseTimeTo(latestTime() + duration.hours(2));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(1));
    await hourlyPay.stopWork({from: employee});
    assert.isAbove(await hourlyPay.earnings.call(), 2*rate*0.99);
    assert.isBelow(await hourlyPay.earnings.call(), 2*rate*1.01);
  })

  it("can work out all dailyLimit without problems and with (dailyLimit) funds", async () => {
    let testAmount = ether(0.8);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(2));
    await hourlyPay.stopWork({from: employee});
    await increaseTimeTo(latestTime() + duration.hours(1));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(2));
    await hourlyPay.stopWork({from: employee});
    await increaseTimeTo(latestTime() + duration.hours(1));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(3));
    await hourlyPay.stopWork({from: employee});
    await increaseTimeTo(latestTime() + duration.hours(1));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(1));
    await hourlyPay.stopWork({from: employee});

    assert.isAbove(await hourlyPay.earnings.call(), 8*rate*0.99);
    assert.isBelow(await hourlyPay.earnings.call(), 8*rate*1.01);
  })

  it("can't earn more than dailyHourLimit", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(9));
    await hourlyPay.stopWork({from: employee});
    //console.log(web3.fromWei(await hourlyPay.earnings.call()).toNumber());
    assert.equal(await hourlyPay.earnings.call(), rate*(await hourlyPay.dailyHourLimit.call()));
  })

  it("can't earn more than dailyHourLimit if forgot to stopWorking", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.days(3) + duration.hours(5) + duration.minutes(20));
    await hourlyPay.stopWork({from: employee});
    assert.equal(await hourlyPay.earnings.call(), rate*(await hourlyPay.dailyHourLimit.call()));
    assert.isAbove(await hourlyPay.currentDayTS.call(), await hourlyPay.beginTimeTS.call());
  })

  it("can fire while working", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(1));
    await hourlyPay.fire({from: owner});
    assert.isFalse(await hourlyPay.hired.call());
    assert.isFalse(await hourlyPay.working.call());
  })

  it("can't start work after fire", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(1));
    await hourlyPay.stopWork({from: employee});

    await increaseTimeTo(latestTime() + duration.hours(1));
    await hourlyPay.fire({from: owner});
    
    try {
      await hourlyPay.startWork("test startWork", {from: employee});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }
  })

  it("can set dailyHourLimit to 2 hours", async () => {
    await hourlyPay.setDailyHourLimit(2, {from: owner});
    assert.equal(await hourlyPay.dailyHourLimit.call(), 2);
    
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});

    await hourlyPay.hire(employee, rate, {from: owner});

    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});

    await increaseTimeTo(latestTime() + duration.hours(5));

    await hourlyPay.stopWork({from: employee});
    assert.equal(await hourlyPay.earnings.call(), rate*(await hourlyPay.dailyHourLimit.call()));
  })

  it("can set 4AM beginTimeTS", async () => {
    let currentTime = new Date(latestTime()*1000 - duration.days(1));
    currentTime.setHours(4);
    currentTime.setMinutes(0);
    currentTime.setSeconds(0);

    let convenientTimeUTC = Math.floor(currentTime.getTime()/1000);

    let convenientTime = new Date(convenientTimeUTC*1000);
      
    await hourlyPay.setBeginTimeTS(convenientTimeUTC, {from: owner});
    assert.equal(await hourlyPay.beginTimeTS.call(), convenientTimeUTC);
    
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});

    await hourlyPay.hire(employee, rate, {from: owner});

    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});

    await increaseTimeTo(latestTime() + duration.hours(4));

    await hourlyPay.stopWork({from: employee});

    assert.isAbove(await hourlyPay.earnings.call(), 4*rate*0.99);
    assert.isBelow(await hourlyPay.earnings.call(), 4*rate*1.01);
  })

  it("can't start work before beginTimeTS", async () => {
    let currentTime = new Date(latestTime()*1000 - duration.days(1));
      
    await hourlyPay.setBeginTimeTS(latestTime() + duration.days(1), {from: owner});
    assert.isAbove(await hourlyPay.beginTimeTS.call(), latestTime());
    
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});

    await hourlyPay.hire(employee, rate, {from: owner});

    await increaseTimeTo(latestTime() + duration.minutes(1));

    try {
      await hourlyPay.startWork("test startWork", {from: employee});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }
  })

  it("can't start work after contractDurationInDays pass", async () => {
    await hourlyPay.setContractDurationInDays(3, {from: owner});
    assert.equal(await hourlyPay.contractDurationInDays.call(), 3);

    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});

    await hourlyPay.hire(employee, rate, {from: owner});

    await increaseTimeTo(latestTime() + duration.days(4));

    try {
      await hourlyPay.startWork("test startWork", {from: employee});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }
  })
  
  it("can't start work of already working", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(1));

    try {
      await hourlyPay.startWork("test startWork", {from: employee});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }
  })

  it("can't stop work if not working", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    try {
      await hourlyPay.stopWork({from: employee});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }
  })

  it("can't withdraw until payday", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(1));
    await hourlyPay.stopWork({from: employee});
    assert.isAbove(await hourlyPay.earnings.call(), rate*0.99);
    assert.isBelow(await hourlyPay.earnings.call(), rate*1.01);
    await increaseTimeTo(latestTime() + duration.hours(1));
    
    try {
      await hourlyPay.withdraw({from: employee});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }
  })

  it("can withdraw after payday", async () => {
    await hourlyPay.setPaydayFrequencyInDays(1, {from: owner});
    assert.equal(await hourlyPay.paydayFrequencyInDays.call(), 1);

    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    // work for 5 hours

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(5));
    await hourlyPay.stopWork({from: employee});
    
    let earnings = await hourlyPay.earnings.call();

    assert.isAbove(await earnings, 5*rate*0.99);
    assert.isBelow(await earnings, 5*rate*1.01);
    
    // go next day and withdraw

    await increaseTimeTo(latestTime() + duration.days(1));

    let employeeBalance = await web3.eth.getBalance(employee);

    await hourlyPay.withdraw({from: employee});

    let newEmployeeBalance = await web3.eth.getBalance(employee);
    let newEarnings = await hourlyPay.earnings.call();

    assert.equal(newEarnings, 0);
    assert(newEmployeeBalance.gt(employeeBalance.plus(earnings.times(0.95))));
  })

  it("can't withdraw multiple times during one payday period", async () => {
    await hourlyPay.setPaydayFrequencyInDays(1, {from: owner});
    assert.equal(await hourlyPay.paydayFrequencyInDays.call(), 1);

    let testAmount = ether(3);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    // work for 5 hours

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(5));
    await hourlyPay.stopWork({from: employee});
    
    let earnings = await hourlyPay.earnings.call();

    assert.isAbove(await earnings, 5*rate*0.99);
    assert.isBelow(await earnings, 5*rate*1.01);
    
    // go next day and withdraw

    await increaseTimeTo(latestTime() + duration.days(1));

    let employeeBalance = await web3.eth.getBalance(employee);

    await hourlyPay.withdraw({from: employee});

    let newEmployeeBalance = await web3.eth.getBalance(employee);
    let newEarnings = await hourlyPay.earnings.call();

    assert.equal(newEarnings, 0);
    assert(newEmployeeBalance.gt(employeeBalance.plus(earnings.times(0.95))));

    await increaseTimeTo(latestTime() + duration.minutes(1));

    // work again for 6 hours

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(6));
    await hourlyPay.stopWork({from: employee});

    earnings = await hourlyPay.earnings.call();

    assert.isAbove(await earnings, 6*rate*0.99);
    assert.isBelow(await earnings, 6*rate*1.01);

    // advance to +17 hours and try to withdraw (still 1 hour left before new period)

    await increaseTimeTo(latestTime() + duration.hours(17));

    try {
      await hourlyPay.withdraw({from: employee});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }    

    // advance +2 more hours, now withdraw should be possible

    await increaseTimeTo(latestTime() + duration.hours(2));

    employeeBalance = await web3.eth.getBalance(employee);

    await hourlyPay.withdraw({from: employee});

    newEmployeeBalance = await web3.eth.getBalance(employee);
    newEarnings = await hourlyPay.earnings.call();

    assert.equal(newEarnings, 0);
    assert(newEmployeeBalance.gt(employeeBalance.plus(earnings.times(0.95))));

  })

  it("can work and withdraw two days in a row", async () => {
    await hourlyPay.setPaydayFrequencyInDays(1, {from: owner});
    assert.equal(await hourlyPay.paydayFrequencyInDays.call(), 1);

    let testAmount = ether(3);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    // work for 7 hours
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(7));
    await hourlyPay.stopWork({from: employee});
    
    let earnings = await hourlyPay.earnings.call();

    assert.isAbove(await earnings, 7*rate*0.99);
    assert.isBelow(await earnings, 7*rate*1.01);
    
    // go next day and withdraw
    await increaseTimeTo(latestTime() + duration.days(1) - duration.hours(6));

    let employeeBalance = await web3.eth.getBalance(employee);

    await hourlyPay.withdraw({from: employee});

    let newEmployeeBalance = await web3.eth.getBalance(employee);
    let newEarnings = await hourlyPay.earnings.call();

    assert.equal(newEarnings, 0);
    assert(newEmployeeBalance.gt(employeeBalance.plus(earnings.times(0.95))));

    // work for 6 hours in day 2
    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(6));
    await hourlyPay.stopWork({from: employee});

    earnings = await hourlyPay.earnings.call();

    assert.isAbove(await earnings, 6*rate*0.99);
    assert.isBelow(await earnings, 6*rate*1.01);

    // go next day and withdraw
    await increaseTimeTo(latestTime() + duration.days(1) - duration.hours(5));

    employeeBalance = await web3.eth.getBalance(employee);

    await hourlyPay.withdraw({from: employee});

    newEmployeeBalance = await web3.eth.getBalance(employee);
    newEarnings = await hourlyPay.earnings.call();

    assert.equal(newEarnings, 0);
    assert(newEmployeeBalance.gt(employeeBalance.plus(earnings.times(0.95))));
  })

  it("can't hack a withdraw period by working last N hours before next payday and withdrawing instantly", async () => {
    await hourlyPay.setPaydayFrequencyInDays(1, {from: owner});
    assert.equal(await hourlyPay.paydayFrequencyInDays.call(), 1);

    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    
    // wait for -8 hours before payday TS

    await increaseTimeTo(latestTime() + duration.hours(16));

    // work for 8 hours
    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(8));
    await hourlyPay.stopWork({from: employee});
    
    let earnings = await hourlyPay.earnings.call();

    assert.isAbove(await earnings, 8*rate*0.99);
    assert.isBelow(await earnings, 8*rate*1.01);
    
    // wait for 5 minutes (to be sure) and withdraw
    await increaseTimeTo(latestTime() + duration.minutes(5));

    try {
      await hourlyPay.withdraw({from: employee});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }    
  })

  it("client can refund", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(8));
    await hourlyPay.stopWork({from: employee});

    await increaseTimeTo(latestTime() + duration.minutes(1));

    let earnings = await hourlyPay.earnings.call();
    assert.isAbove(await earnings, 8*rate*0.99);
    assert.isBelow(await earnings, 8*rate*1.01);

    await hourlyPay.refundAll({from: owner});

    earnings = await hourlyPay.earnings.call();
    assert.equal(await earnings, 0);
  })

  it("client can't refund if there are no earnings", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    let earnings = await hourlyPay.earnings.call();
    assert.equal(await earnings, 0);

    try {
      await hourlyPay.refundAll({from: owner});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }   
  })

  it("client can refund 0.1 ETH", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(8));
    await hourlyPay.stopWork({from: employee});

    await increaseTimeTo(latestTime() + duration.minutes(1));

    let earnings = await hourlyPay.earnings.call();
    assert.isAbove(await earnings, 8*rate*0.99);
    assert.isBelow(await earnings, 8*rate*1.01);

    await hourlyPay.refund(ether(0.1), {from: owner});

    let newEarnings = await hourlyPay.earnings.call();
    assert((await earnings).minus(await newEarnings).eq(ether(0.1)));
  })

  it("client can't refund more than earnings", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(8));
    await hourlyPay.stopWork({from: employee});

    await increaseTimeTo(latestTime() + duration.minutes(1));

    let earnings = await hourlyPay.earnings.call();
    assert.isAbove(await earnings, 8*rate*0.99);
    assert.isBelow(await earnings, 8*rate*1.01);
    
    assert(ether(1).gt(await earnings));

    try {
      await hourlyPay.refund(ether(1), {from: owner});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }   
  })

  it("employee can refund", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(8));
    await hourlyPay.stopWork({from: employee});

    await increaseTimeTo(latestTime() + duration.minutes(1));

    let earnings = await hourlyPay.earnings.call();
    assert.isAbove(await earnings, 8*rate*0.99);
    assert.isBelow(await earnings, 8*rate*1.01);

    await hourlyPay.refundAll({from: employee});

    earnings = await hourlyPay.earnings.call();
    assert.equal(await earnings, 0);
  })

  it("employee can't refund if there are no earnings", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    let earnings = await hourlyPay.earnings.call();
    assert.equal(await earnings, 0);

    try {
      await hourlyPay.refundAll({from: employee});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }   
  })

  it("employee can refund 0.1 ETH", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(8));
    await hourlyPay.stopWork({from: employee});

    await increaseTimeTo(latestTime() + duration.minutes(1));

    let earnings = await hourlyPay.earnings.call();
    assert.isAbove(await earnings, 8*rate*0.99);
    assert.isBelow(await earnings, 8*rate*1.01);

    await hourlyPay.refund(ether(0.1), {from: employee});

    let newEarnings = await hourlyPay.earnings.call();
    assert((await earnings).minus(await newEarnings).eq(ether(0.1)));
  })

  it("employee can't refund more than earnings", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(8));
    await hourlyPay.stopWork({from: employee});

    await increaseTimeTo(latestTime() + duration.minutes(1));

    let earnings = await hourlyPay.earnings.call();
    assert.isAbove(await earnings, 8*rate*0.99);
    assert.isBelow(await earnings, 8*rate*1.01);
    
    assert(ether(1).gt(await earnings));

    try {
      await hourlyPay.refund(ether(1), {from: employee});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }   
  })

  it("alien can't refund", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(8));
    await hourlyPay.stopWork({from: employee});

    await increaseTimeTo(latestTime() + duration.minutes(1));

    let earnings = await hourlyPay.earnings.call();
    assert.isAbove(await earnings, 8*rate*0.99);
    assert.isBelow(await earnings, 8*rate*1.01);

    try {
      await hourlyPay.refund(ether(0.1), {from: alien});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }
  })

  it("alien can't refund 0.1 ETH", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    await hourlyPay.hire(employee, rate, {from: owner});
    await increaseTimeTo(latestTime() + duration.minutes(1));

    await hourlyPay.startWork("test startWork", {from: employee});
    await increaseTimeTo(latestTime() + duration.hours(8));
    await hourlyPay.stopWork({from: employee});

    await increaseTimeTo(latestTime() + duration.minutes(1));

    let earnings = await hourlyPay.earnings.call();
    assert.isAbove(await earnings, 8*rate*0.99);
    assert.isBelow(await earnings, 8*rate*1.01);

    try {
      await hourlyPay.refund(ether(0.1), {from: alien});
      assert.fail();
    } catch (err) {
      assert.ok(/revert/.test(err.message));
    }   
  })

  it("client can withdraw all", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    assert((await web3.eth.getBalance(hourlyPay.address)).eq(testAmount));

    let clientBalance = await web3.eth.getBalance(owner);

    await hourlyPay.clientWithdrawAll({from: owner});

    assert.equal(await web3.eth.getBalance(hourlyPay.address), 0);

    let newClientBalance = await web3.eth.getBalance(owner);

    assert(newClientBalance.gt(clientBalance.plus(testAmount.times(0.95))));
  })

  it("client can withdraw 0.1 ETH", async () => {
    let testAmount = ether(1);
    await hourlyPay.sendTransaction({from: owner, value: testAmount});
    assert((await web3.eth.getBalance(hourlyPay.address)).eq(testAmount));

    let clientBalance = await web3.eth.getBalance(owner);

    await hourlyPay.clientWithdraw(ether(0.1), {from: owner});

    assert.equal(await web3.eth.getBalance(hourlyPay.address), testAmount - ether(0.1));

    let newClientBalance = await web3.eth.getBalance(owner);

    assert(newClientBalance.gt(clientBalance.plus(ether(0.1).times(0.95))));
  })

})