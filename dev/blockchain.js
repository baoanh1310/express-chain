const sha256 = require('crypto-js/sha256');
const { v4: uuidv4 } = require('uuid');

const currentNodeUrl = process.argv[3];

class Blockchain {
  constructor() {
    this.chain = [];
    this.pendingTransactions = [];
    this.currentNodeUrl = currentNodeUrl;
    this.networkNodes = [];
    // genesis block
    this.createNewBlock(100, '0', '0');
  }
}

Blockchain.prototype.createNewBlock = function (nonce, previousBlockHash, hash) {
  const newBlock = {
    index: this.chain.length + 1,
    timestamp: Date.now(),
    transactions: this.pendingTransactions,
    nonce,
    hash,
    previousBlockHash,
  };

  this.pendingTransactions = [];
  this.chain.push(newBlock);
  return newBlock;
};

Blockchain.prototype.getLastBlock = function () {
  return this.chain[this.chain.length - 1];
};

Blockchain.prototype.createNewTransaction = function (amount, sender, recipient) {
  const newTransaction = {
    amount,
    sender,
    recipient,
    transactionId: uuidv4().split('-').join(''),
  };
  return newTransaction;
};

Blockchain.prototype.addTransactionToPendingTransactions = function (transactionObj) {
  this.pendingTransactions.push(transactionObj);
  return this.getLastBlock().index + 1;
};

Blockchain.prototype.hashBlock = function (previousBlockHash, currentBlockData, nonce) {
  const dataAsString = previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
  const hash = sha256(dataAsString).toString();
  return hash;
};

Blockchain.prototype.proofOfWork = function (previousBlockHash, currentBlockData) {
  let nonce = 0;
  let hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
  while (hash.substring(0, 4) !== '0000') {
    nonce += 1;
    hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
  }
  return nonce;
};

Blockchain.prototype.isValidChain = function (blockchain) {
  let isValid = true;

  // validate genesis block
  const genesisBlock = blockchain[0];
  const isCorrectNonce = genesisBlock.nonce === 100;
  const isCorrectPrevBlockHash = genesisBlock.previousBlockHash === '0';
  const isCorrectHash = genesisBlock.hash === '0';
  const isEmptyTransactions = genesisBlock.transactions.length === 0;

  if (!isCorrectNonce || !isCorrectPrevBlockHash || !isCorrectHash || !isEmptyTransactions) {
    return false;
  }

  // validate other blocks
  for (let i = 1; i < blockchain.length; i += 1) {
    const currentBlock = blockchain[i];
    const prevBlock = blockchain[i - 1];
    const blockHash = this.hashBlock(
      prevBlock.hash,
      { transactions: currentBlock.transactions, index: currentBlock.index },
      currentBlock.nonce,
    );
    if (blockHash.substring(0, 4) !== '0000' || currentBlock.previousBlockHash !== prevBlock.hash) {
      isValid = false;
      break;
    }
  }
  return isValid;
};

module.exports = Blockchain;
