import express from 'express';
import axios from 'axios';

const router = express.Router();
const BASE_URL = process.env.MANTLE_EXPLORER_API_BASE_URL;
const API_KEY = process.env.MANTLE_EXPLORER_API_KEY;

// function for making API requests
async function makeRequest(params) {
  try {
    if (!API_KEY) {
      throw new Error('MANTLE_EXPLORER_API_KEY environment variable is not set');
    }

    const response = await axios.get(BASE_URL, {
      params: {
        ...params,
        apikey: API_KEY
      }
    });

    if (response.data.status === '0') {
      throw new Error(response.data.result || 'API request failed');
    }

    return response.data.result;
  } catch (error) {
    throw new Error(`Mantle Explorer API Error: ${error.message}`);
  }
}

// Input validation middleware
const validateAddress = (req, res, next) => {
  const address = req.params.address;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid address format',
      timestamp: new Date().toISOString()
    });
  }
  next();
};

const validateTxHash = (req, res, next) => {
  const txhash = req.params.txhash;
  if (!/^0x[a-fA-F0-9]{64}$/.test(txhash)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid transaction hash format',
      timestamp: new Date().toISOString()
    });
  }
  next();
};

// Account Routes
router.get('/balance/:address', validateAddress, async (req, res) => {
  try {
    const result = await makeRequest({
      module: 'account',
      action: 'balance',
      address: req.params.address,
      tag: 'latest'
    });
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

router.post('/balances', async (req, res) => {
  try {
    const { addresses } = req.body;
    if (!Array.isArray(addresses) || addresses.length === 0 || addresses.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Invalid addresses array. Must contain 1-20 addresses.',
        timestamp: new Date().toISOString()
      });
    }
    const result = await makeRequest({
      module: 'account',
      action: 'balancemulti',
      address: addresses.join(','),
      tag: 'latest'
    });
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

// Transaction Routes
router.get('/transactions/:address', validateAddress, async (req, res) => {
  try {
    const result = await makeRequest({
      module: 'account',
      action: 'txlist',
      address: req.params.address,
      startblock: req.query.startblock || '0',
      endblock: req.query.endblock || 'latest',
      page: req.query.page || '1',
      offset: req.query.offset || '10',
      sort: req.query.sort || 'desc'
    });
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

router.get('/internal-transactions/:address', validateAddress, async (req, res) => {
  try {
    const result = await makeRequest({
      module: 'account',
      action: 'txlistinternal',
      address: req.params.address,
      startblock: req.query.startblock || '0',
      endblock: req.query.endblock || 'latest',
      page: req.query.page || '1',
      offset: req.query.offset || '10',
      sort: req.query.sort || 'desc'
    });
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

router.get('/internal-tx/:txhash', validateTxHash, async (req, res) => {
  try {
    const result = await makeRequest({
      module: 'account',
      action: 'txlistinternal',
      txhash: req.params.txhash
    });
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

// Token Routes
router.get('/token-transfers/:address', validateAddress, async (req, res) => {
  try {
    const params = {
      module: 'account',
      action: 'tokentx',
      address: req.params.address,
      page: req.query.page || '1',
      offset: req.query.offset || '10',
      startblock: req.query.startblock || '0',
      endblock: req.query.endblock || 'latest',
      sort: req.query.sort || 'desc'
    };
    if (req.query.contractaddress) {
      params.contractaddress = req.query.contractaddress;
    }
    const result = await makeRequest(params);
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

router.get('/nft-transfers/:address', validateAddress, async (req, res) => {
  try {
    const params = {
      module: 'account',
      action: 'tokennfttx',
      address: req.params.address,
      page: req.query.page || '1',
      offset: req.query.offset || '10',
      startblock: req.query.startblock || '0',
      endblock: req.query.endblock || 'latest',
      sort: req.query.sort || 'desc'
    };
    if (req.query.contractaddress) {
      params.contractaddress = req.query.contractaddress;
    }
    const result = await makeRequest(params);
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

// Token Supply and Balance Routes
router.get('/token/supply/:contractaddress', validateAddress, async (req, res) => {
  try {
    const result = await makeRequest({
      module: 'stats',
      action: 'tokensupply',
      contractaddress: req.params.contractaddress
    });
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

router.get('/token/balance/:contractaddress/:address', validateAddress, async (req, res) => {
  try {
    const result = await makeRequest({
      module: 'account',
      action: 'tokenbalance',
      contractaddress: req.params.contractaddress,
      address: req.params.address,
      tag: 'latest'
    });
    res.json({ success: true, data: result, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

export default router;