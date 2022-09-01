const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const rq = require('request-promise');
const requestPromise = require('request-promise');
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
  const newTransaction = req.body;
  const blockIndex = bitcoin.addTransactionToPendingTransactions(newTransaction);
  res.json({ note: `Transaction will be added in block ${blockIndex}` });
});

app.post('/transaction/broadcast', (req, res) => {
  const newTransaction = bitcoin.createNewTransaction(
    req.body.amount,
    req.body.sender,
    req.body.recipient,
  );
  bitcoin.addTransactionToPendingTransactions(newTransaction);

  // broadcast the new transaction
  const requestPromises = [];
  bitcoin.networkNodes.forEach((networkNodeUrl) => {
    const requestOptions = {
      uri: `${networkNodeUrl}/transaction`,
      method: 'POST',
      body: newTransaction,
      json: true,
    };
    requestPromises.push(rq(requestOptions));
  });
  Promise.all(requestPromises)
    .then((data) => {
      res.json({ note: 'Transaction created and broadcasted successfully.' });
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

  // bitcoin.createNewTransaction(12.5, '00', nodeAddress);

  // block finality
  const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, blockHash);

  // broadcast new block
  const requestPromises = [];
  bitcoin.networkNodes.forEach((networkNodeUrl) => {
    const requestOptions = {
      uri: `${networkNodeUrl}/receive-new-block`,
      method: 'POST',
      body: { newBlock },
      json: true,
    };
    requestPromises.push(rq(requestOptions));
  });

  Promise.all(requestPromises)
    .then((data) => {
      // reward miner who solved PoW puzzle
      const requestOptions = {
        uri: `${bitcoin.currentNodeUrl}/transaction/broadcast`,
        method: 'POST',
        body: {
          amount: 12.5,
          sender: '00',
          recipient: nodeAddress,
        },
        json: true,
      };
      return rq(requestOptions);
    });

  res.json({
    note: 'New block mined and broadcasted successfully',
    block: newBlock,
  });
});

app.post('/receive-new-block', (req, res) => {
  const { newBlock } = req.body;
  const lastBlock = bitcoin.getLastBlock();
  const isCorrectHash = lastBlock.hash === newBlock.previousBlockHash;
  const isCorrectIndex = lastBlock.index + 1 === newBlock.index;
  if (isCorrectHash && isCorrectIndex) {
    bitcoin.chain.push(newBlock);
    bitcoin.pendingTransactions = [];
    res.json({
      note: 'New block received and accepted.',
      newBlock,
    });
  } else {
    res.json({
      note: 'New block rejected',
      newBlock,
    });
  }
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

app.get('/consensus', (req, res) => {
  const requestPromises = [];
  bitcoin.networkNodes.forEach((networkNodeUrl) => {
    const requestOptions = {
      uri: `${networkNodeUrl}/blockchain`,
      method: 'GET',
      json: true,
    };
    requestPromises.push(rq(requestOptions));
  });
  Promise.all(requestPromises)
    .then((blockchains) => {
      const currentChainLength = bitcoin.chain.length;
      let maxChainLegnth = currentChainLength;
      let newLongestChain = null;
      let newPendingTransactions = null;
      blockchains.forEach((blockchain) => {
        if (blockchain.chain.length > maxChainLegnth) {
          maxChainLegnth = blockchain.chain.length;
          newLongestChain = blockchain.chain;
          newPendingTransactions = blockchain.pendingTransactions;
        }
      });
      if (!newLongestChain || (newLongestChain && !bitcoin.isValidChain(newLongestChain))) {
        res.json({
          note: 'Current chain has not been replaced.',
          chain: bitcoin.chain,
        });
      } else {
        bitcoin.chain = newLongestChain;
        bitcoin.pendingTransactions = newPendingTransactions;
        res.json({
          note: 'This chain has been replaced.',
          chain: bitcoin.chain,
        });
      }
    });
});

app.get('/block/:blockHash', (req, res) => {
  const { blockHash } = req.params;
  const correctBlock = bitcoin.getBlock(blockHash);
  res.json({
    block: correctBlock,
  });
});

app.get('/transaction/:transactionId', (req, res) => {
  const { transactionId } = req.params;
  const transactionData = bitcoin.getTransaction(transactionId);
  res.json({
    transaction: transactionData.transaction,
    block: transactionData.block,
  });
});

app.get('/address/:address', (req, res) => {
  const { address } = req.params;
  const addressData = bitcoin.getAddressData(address);
  res.json({
    addressData,
  });
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
