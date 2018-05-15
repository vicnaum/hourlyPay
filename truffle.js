const conf = require("./conf.js").conf;

var HDWalletProvider = require("truffle-hdwallet-provider");

var mnemonic = conf.mnemonic;

require('babel-register')({
  ignore: /node_modules\/(?!openzeppelin-solidity)/
});
require('babel-polyfill');


module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // to customize your Truffle configuration!
  networks: {
    ropsten: {
      provider: function() {
        return new HDWalletProvider(mnemonic, 'https://ropsten.infura.io/' + conf.infuraKey)
      },
      network_id: 3,
      gas: 3000000,
      gasPrice: 1000000000
    }   
  }
};
