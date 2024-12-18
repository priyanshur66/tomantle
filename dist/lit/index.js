import * as ethers from "ethers";
import { LitContracts } from "@lit-protocol/contracts-sdk";
import { LIT_NETWORK, LIT_RPC, LIT_ABILITY } from "@lit-protocol/constants";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LitActionResource, LitPKPResource, createSiweMessageWithRecaps, generateAuthSig } from "@lit-protocol/auth-helpers";
import { getChainInfo, getEnv } from "./utils.js";
import { litActionCode } from "./litAction.js";
// Environment variables
const ETHEREUM_PRIVATE_KEY = getEnv("ETHEREUM_PRIVATE_KEY");
const SELECTED_LIT_NETWORK = LIT_NETWORK.Datil;
const LIT_CAPACITY_CREDIT_TOKEN_ID = getEnv("LIT_CAPACITY_CREDIT_TOKEN_ID");
const LIT_PKP_PUBLIC_KEY = getEnv("LIT_PKP_PUBLIC_KEY");
const CHAIN_TO_SEND_TX_ON = getEnv("CHAIN_TO_SEND_TX_ON");
// Validation function for required environment variables
const validateEnvironment = () => {
    const required = [
        'ETHEREUM_PRIVATE_KEY',
        'CHAIN_TO_SEND_TX_ON'
    ];
    const missing = required.filter(key => !getEnv(key));
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
};
// create contract transaction
const createContractTransaction = async (contract, functionName, params, pkpAddress, chainInfo, value = "0") => {
    try {
        // Encode function data
        const functionData = contract.interface.encodeFunctionData(functionName, params);
        // Get gas price
        const gasPrice = await contract.provider.getGasPrice();
        const estimatedGas = await contract.estimateGas[functionName](...params, {
            from: pkpAddress,
            value: ethers.utils.parseEther(value)
        });
        const gasLimit = estimatedGas.mul(12).div(10);
        // Get nonce
        const nonce = await contract.provider.getTransactionCount(pkpAddress);
        const unsignedTransaction = {
            to: contract.address,
            data: functionData,
            value: ethers.utils.parseEther(value).toHexString(),
            gasLimit: gasLimit.toHexString(),
            gasPrice: gasPrice.toHexString(),
            nonce: nonce,
            chainId: chainInfo.chainId
        };
        console.log("Created unsigned transaction:", {
            ...unsignedTransaction,
            value: ethers.utils.formatEther(unsignedTransaction.value),
            gasLimit: ethers.utils.formatUnits(unsignedTransaction.gasLimit, 0),
            gasPrice: ethers.utils.formatUnits(unsignedTransaction.gasPrice, "gwei")
        });
        return unsignedTransaction;
    }
    catch (error) {
        console.error('Error creating contract transaction:', error);
        throw error;
    }
};
export const signAndExecuteContractTx = async (contractAddress, contractABI, functionName, functionParams, valueInEther = "0") => {
    let litNodeClient;
    let pkpInfo = {
        publicKey: LIT_PKP_PUBLIC_KEY,
    };
    try {
        // Validate environment
        validateEnvironment();
        // Get chain information
        const chainInfo = getChainInfo(CHAIN_TO_SEND_TX_ON);
        if (!chainInfo) {
            throw new Error(`Invalid chain configuration for ${CHAIN_TO_SEND_TX_ON}`);
        }
        // Initialize providers and wallets
        const ethersProvider = new ethers.providers.JsonRpcProvider(chainInfo.rpcUrl);
        const ethersWallet = new ethers.Wallet(ETHEREUM_PRIVATE_KEY, ethersProvider);
        const yellowstoneEthersWallet = new ethers.Wallet(ETHEREUM_PRIVATE_KEY, new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE));
        // Initialize contract instance
        const contract = new ethers.Contract(contractAddress, contractABI, ethersProvider);
        // Connect to Lit Contracts
        console.log("🔄 Connecting LitContracts client to network...");
        const litContracts = new LitContracts({
            signer: yellowstoneEthersWallet,
            network: SELECTED_LIT_NETWORK,
        });
        await litContracts.connect();
        console.log("✅ Connected LitContracts client to network");
        // Handle PKP setup
        if (!LIT_PKP_PUBLIC_KEY) {
            console.log("🔄 PKP wasn't provided, minting a new one...");
            const mintResult = await litContracts.pkpNftContractUtils.write.mint();
            pkpInfo = mintResult.pkp;
            console.log("✅ PKP successfully minted");
        }
        else {
            console.log(`ℹ️  Using provided PKP: ${LIT_PKP_PUBLIC_KEY}`);
            pkpInfo = {
                publicKey: LIT_PKP_PUBLIC_KEY,
                ethAddress: ethers.utils.computeAddress(`0x${LIT_PKP_PUBLIC_KEY}`)
            };
        }
        // Check and handle PKP balance
        console.log(`🔄 Checking PKP balance...`);
        const bal = await ethersProvider.getBalance(pkpInfo.ethAddress);
        const formattedBal = ethers.utils.formatEther(bal);
        if (Number(formattedBal) < Number(ethers.utils.formatEther(25000))) {
            console.log(`🔄 Funding PKP...`);
            const fundingTx = {
                to: pkpInfo.ethAddress,
                value: ethers.utils.parseEther("0.001"),
                gasLimit: ethers.BigNumber.from(21000).toHexString(),
                gasPrice: (await ethersWallet.getGasPrice()).toHexString(),
                nonce: await ethersProvider.getTransactionCount(ethersWallet.address),
                chainId: chainInfo.chainId,
            };
            const fundingTxPromise = await ethersWallet.sendTransaction(fundingTx);
            await fundingTxPromise.wait();
            console.log(`✅ PKP funded`);
        }
        // Initialize Lit Node Client
        console.log("🔄 Initializing connection to the Lit network...");
        litNodeClient = new LitNodeClient({
            litNetwork: SELECTED_LIT_NETWORK,
            debug: process.env.NODE_ENV === 'development',
        });
        await litNodeClient.connect();
        console.log("✅ Connected to the Lit network");
        // Create contract transaction
        console.log("🔄 Creating contract transaction...");
        const unsignedTransaction = await createContractTransaction(contract, functionName, functionParams, pkpInfo.ethAddress, chainInfo, valueInEther);
        const unsignedTransactionHash = ethers.utils.keccak256(ethers.utils.serializeTransaction(unsignedTransaction));
        console.log("✅ Contract transaction created");
        // Handle Capacity Credits
        let capacityTokenId = LIT_CAPACITY_CREDIT_TOKEN_ID;
        if (!capacityTokenId) {
            console.log("🔄 Minting new Capacity Credit...");
            const mintResult = await litContracts.mintCapacityCreditsNFT({
                requestsPerKilosecond: 10,
                daysUntilUTCMidnightExpiration: 1,
            });
            capacityTokenId = mintResult.capacityTokenIdStr;
        }
        // Create capacity delegation auth signature
        const { capacityDelegationAuthSig } = await litNodeClient.createCapacityDelegationAuthSig({
            dAppOwnerWallet: ethersWallet,
            capacityTokenId,
            delegateeAddresses: [ethersWallet.address],
            uses: "1",
        });
        console.log("🔄 Executing Lit Action...");
        const result = await litNodeClient.executeJs({
            sessionSigs: await litNodeClient.getSessionSigs({
                chain: CHAIN_TO_SEND_TX_ON,
                capabilityAuthSigs: [capacityDelegationAuthSig],
                expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
                resourceAbilityRequests: [
                    {
                        resource: new LitPKPResource("*"),
                        ability: LIT_ABILITY.PKPSigning,
                    },
                    {
                        resource: new LitActionResource("*"),
                        ability: LIT_ABILITY.LitActionExecution,
                    },
                ],
                authNeededCallback: async ({ resourceAbilityRequests, expiration, uri }) => {
                    const toSign = await createSiweMessageWithRecaps({
                        uri: uri,
                        expiration: expiration,
                        resources: resourceAbilityRequests,
                        walletAddress: ethersWallet.address,
                        nonce: await litNodeClient.getLatestBlockhash(),
                        litNodeClient,
                    });
                    return await generateAuthSig({
                        signer: ethersWallet,
                        toSign,
                    });
                },
            }),
            code: litActionCode,
            jsParams: {
                toSign: ethers.utils.arrayify(unsignedTransactionHash),
                publicKey: pkpInfo.publicKey,
                sigName: "signedTransaction",
                chain: CHAIN_TO_SEND_TX_ON,
                unsignedTransaction,
            },
        });
        console.log("✅ Lit Action executed successfully");
        return result;
    }
    catch (error) {
        console.error('Contract Transaction Error:', error);
        throw error;
    }
    finally {
        if (litNodeClient) {
            try {
                await litNodeClient.disconnect();
                console.log("✅ Disconnected from Lit network");
            }
            catch (error) {
                console.error('Error disconnecting from Lit network:', error);
            }
        }
    }
};
//# sourceMappingURL=index.js.map