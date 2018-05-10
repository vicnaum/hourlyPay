const HourlyPay = artifacts.require("HourlyPay");

module.exports = async function(deployer) {
  await deployer.deploy(HourlyPay);
}