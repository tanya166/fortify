require("dotenv").config({ path: '../../.env' });
const axios = require("axios");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const INFURA_RPC_URL = process.env.INFURA_RPC_URL;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;

const CONTRACT_ADDRESS = "0x4E95B942633b77372fFeafDf9A8105C23B17D91B";
const PREDEFINED_CONTRACT_NAME = "FetchedContract.sol";

async function fetchContractDetails(contractAddress) {
    try {
        const provider = new ethers.JsonRpcProvider(INFURA_RPC_URL);
        await provider.ready; 
        console.log("Connected to network:", (await provider.getNetwork()).name);

        const bytecode = await provider.getCode(contractAddress);
        if (bytecode === "0x") {
            console.log("❌ No contract found at this address!");
            return;
        }
        console.log("✅ Contract bytecode retrieved!");
        
        console.log("🔍 Checking if contract is verified on Etherscan...");
        
        const sourceUrl = `https://api-sepolia.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${ETHERSCAN_API_KEY}`;
        const sourceResponse = await axios.get(sourceUrl);
        
        let rawSourceCode = null;
        
        if (sourceResponse.data.status === "1" && sourceResponse.data.result.length > 0) {
            rawSourceCode = sourceResponse.data.result[0].SourceCode;
            console.log("✅ Contract source code retrieved from Etherscan!");
        } else {
            console.log("❌ Contract source code retrieval failed.");
        }
        
        return { rawSourceCode };
    } catch (error) {
        console.error("Error fetching contract details:", error);
    }
}

function extractSolidityCode(sourceCode) {
    if (!sourceCode) return null;
    
    try {
        if (sourceCode.startsWith('{{') && sourceCode.endsWith('}}')) {
            const jsonContent = sourceCode.substring(1, sourceCode.length - 1);
            const parsedJson = JSON.parse(jsonContent);
            if (parsedJson.sources) {
                const firstSourceFile = Object.values(parsedJson.sources)[0];
                if (firstSourceFile && firstSourceFile.content) {
                    return firstSourceFile.content;
                }
            }
        } else if (sourceCode.startsWith('{') && sourceCode.endsWith('}')) {
            try {
                const parsedJson = JSON.parse(sourceCode);
                if (parsedJson.sources) {
                    const firstSourceFile = Object.values(parsedJson.sources)[0];
                    if (firstSourceFile && firstSourceFile.content) {
                        return firstSourceFile.content;
                    }
                }
            } catch (e) {
                console.log("Not valid JSON, might be direct code");
            }
        }
        return sourceCode;
    } catch (error) {
        console.error("Error extracting Solidity code:", error);
        return sourceCode;
    }
}

async function saveSolidityCode(details) {
    if (!details || !details.rawSourceCode) return;
    
    const outputDir = path.join(__dirname, '../contracts/fetched');
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const solidityCode = extractSolidityCode(details.rawSourceCode);
    if (solidityCode) {
        const sourceFile = path.join(outputDir, PREDEFINED_CONTRACT_NAME);
        fs.writeFileSync(sourceFile, solidityCode);
        console.log(`✅ Solidity code saved to: ${sourceFile}`);
    }
}

console.log(`Fetching contract details for: ${CONTRACT_ADDRESS}`);

fetchContractDetails(CONTRACT_ADDRESS)
    .then(async details => {
        console.log("\n=== Contract Details ===");
        if (details) {
            console.log("Saving as:", PREDEFINED_CONTRACT_NAME);
            await saveSolidityCode(details);
        }
    })
    .catch(console.error);


module.exports = { fetchContractDetails, saveSolidityCode };
