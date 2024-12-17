import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import explorerRoutes from './explorers/baseSepolia/index.js';
import mantleExplorerRoutes from './explorers/mantle/index.js';
import { signAndExecuteContractTx } from './lit/index.js';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Test contract configuration
const TEST_CONTRACT = {
  address: "0x20e305f7113fc50546D60d6d7588948Ae8f41bA2",
  abi: [
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "num",
          "type": "uint256"
        }
      ],
      "name": "store",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "retrieve",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]
};

// Input validation middleware
const validateContractInput = (req, res, next) => {
  const { contractAddress, contractABI, functionName, functionParams } = req.body;

  // Check if required fields are present
  if (!contractAddress || !contractABI || !functionName || !functionParams) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields. Please provide contractAddress, contractABI, functionName, and functionParams',
      timestamp: new Date().toISOString()
    });
  }

  // Validate contract address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid contract address format',
      timestamp: new Date().toISOString()
    });
  }

  // Validate ABI is an array
  if (!Array.isArray(contractABI)) {
    return res.status(400).json({
      success: false,
      error: 'Contract ABI must be an array',
      timestamp: new Date().toISOString()
    });
  }

  // Validate functionParams is an array
  if (!Array.isArray(functionParams)) {
    return res.status(400).json({
      success: false,
      error: 'Function parameters must be an array',
      timestamp: new Date().toISOString()
    });
  }

  next();
};

// Middleware setup
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get('/', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});


// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Mantle contract interaction endpoint
app.post('/execute-contract', validateContractInput, async (req, res) => {
  try {
    const {
      contractAddress,
      contractABI,
      functionName,
      functionParams,
      value = "0"
    } = req.body;

    console.log(`📝 Executing contract interaction:
            - Contract: ${contractAddress}
            - Function: ${functionName}
            - Params: ${JSON.stringify(functionParams)}
            - Value: ${value} ETH
        `);

    const result = await signAndExecuteContractTx(
      contractAddress,
      contractABI,
      functionName,
      functionParams,
      value
    );

    if (!result) {
      return res.status(500).json({
        success: false,
        error: 'Contract interaction failed',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result,
      metadata: {
        contractAddress,
        functionName,
        functionParams,
        value,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Contract Interaction Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// Test contract endpoint
app.get('/test-contract', async (req, res) => {
  try {
    console.log(`📝 Executing test contract interaction:
            - Contract: ${TEST_CONTRACT.address}
            - Function: store
            - Value: 56
        `);

    // Fixed parameters for the store function
    const functionName = "store";
    const functionParams = [56];

    const result = await signAndExecuteContractTx(
      TEST_CONTRACT.address,
      TEST_CONTRACT.abi,
      functionName,
      functionParams,
      "0"
    );

    if (!result) {
      return res.status(500).json({
        success: false,
        error: 'Test contract interaction failed',
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result,
      metadata: {
        contractAddress: TEST_CONTRACT.address,
        functionName: functionName,
        functionParams: functionParams,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Test Contract Interaction Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Something broke!',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    timestamp: new Date().toISOString()
  });
});

app.use('/explorer/baseSepolia', explorerRoutes);
app.use('/explorer/mantle', mantleExplorerRoutes);

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});