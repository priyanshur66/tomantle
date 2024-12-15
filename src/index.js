import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';

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

// Middleware setup
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
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
            "0" // No ETH value needed for this test
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

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});