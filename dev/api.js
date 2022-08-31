const express = require('express');
const bodyParser = require('body-parser');
const { response } = require('express');
const { v4: uuidv4 } = require('uuid');
const Blockchain = require('./blockchain');

// create fake node address
const nodeAddress = uuidv4().split('-').join('');

const bitcoin = new Blockchain();

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', (req, res) => {
  res.send('Hello world');
});

app.get('/blockchain', (req, res) => {
  res.send(bitcoin);
});

app.post('/transaction', (req, res) => {
  const blockIndex = bitcoin.createNewTransaction(
    req.body.amount,
    req.body.sender,
    req.body.recipient,
  );
  res.json({
    note: `Transaction will be added to block ${blockIndex}`,
  });
});

app.get('/mine', (req, res) => {
  const lastBlock = bitcoin.getLastBlock();
  const previousBlockHash = lastBlock.hash;
  const currentBlockData = {
    transactions: bitcoin.pendingTransactions,
    index: lastBlock.index + 1,
  };
  const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
  const blockHash = bitcoin.hashBlock(previousBlockHash, currentBlockData, nonce);

  // reward miner who solved PoW puzzle
  bitcoin.createNewTransaction(12.5, '00', nodeAddress);

  // block finality
  const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, blockHash);

  res.json({
    note: 'New block mined successfully',
    block: newBlock,
  });
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
