const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const rq = require('request-promise');
const Blockchain = require('./blockchain');

// create fake node address
const nodeAddress = uuidv4().split('-').join('');

const bitcoin = new Blockchain();

const app = express();
const PORT = process.argv[2];

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

app.post('/register-and-broadcast-node', (req, res) => {
  const { newNodeUrl } = req.body;
  // register
  if (bitcoin.networkNodes.indexOf(newNodeUrl) === -1) { bitcoin.networkNodes.push(newNodeUrl); }

  // broadcast to other nodes
  const regNodesPromises = [];
  bitcoin.networkNodes.forEach((networkNodeUrl) => {
    const requestOptions = {
      uri: `${networkNodeUrl}/register-node`,
      method: 'POST',
      body: { newNodeUrl },
      json: true,
    };
    regNodesPromises.push(rq(requestOptions));
  });
  Promise.all(regNodesPromises)
    .then((data) => {
      const bulkRegisterOptions = {
        uri: `${newNodeUrl}/register-nodes-bulk`,
        method: 'POST',
        body: {
          allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl],
        },
        json: true,
      };
      rq(bulkRegisterOptions)
        .then((data) => {
          res.json({ note: 'New node registered with network successfully.' });
        });
    });
});

// register a node with the network
app.post('/register-node', (req, res) => {
  const { newNodeUrl } = req.body;
  const nodeAlreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) !== -1;
  const isCurrentNode = bitcoin.currentNodeUrl === newNodeUrl;
  if (!nodeAlreadyPresent && !isCurrentNode) { bitcoin.networkNodes.push(newNodeUrl); }
  res.json({ note: 'New node registered successfully.' });
});

app.post('/register-nodes-bulk', (req, res) => {
  const { allNetworkNodes } = req.body;
  allNetworkNodes.forEach((networkNodeUrl) => {
    const nodeAlreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) !== -1;
    const isCurrentNode = bitcoin.currentNodeUrl === networkNodeUrl;
    if (!nodeAlreadyPresent && !isCurrentNode) { bitcoin.networkNodes.push(networkNodeUrl); }
  });
  res.json({ note: 'Bulk registration successful.' });
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});