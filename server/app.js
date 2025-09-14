require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { fetchContractDetails, saveSolidityCode, extractSolidityCode } = require("./fetchContract");

// Import route files
const deployRoutes = require("./routes/uploadAndDeploy"); // consisting of endpoints for compiling and deploying a new smart contract
const riskAssessmentRoutes = require("./routes/existing"); //assessing an already existing contract and deploying security proxy if needed

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

// Mount route modules
app.use("/api/deploy", deployRoutes);           // Your main endpoints
app.use("/api/risk", riskAssessmentRoutes);     // Additional risk assessment endpoints

// Keep legacy endpoint for backward compatibility
app.post("/fetch-contract", async (req, res) => {
    const { contractAddress } = req.body;

    if (!contractAddress) {
        return res.status(400).json({ error: "Contract address is required" });
    }

    try {
        console.log(`Fetching contract details for: ${contractAddress}`);
        const details = await fetchContractDetails(contractAddress);

        if (details && details.rawSourceCode) {
            const extractedCode = extractSolidityCode(details.rawSourceCode);

            if (!extractedCode) {
                return res.status(400).json({ error: "No Solidity contract code found" });
            }

            await saveSolidityCode({ ...details, extractedCode });

            console.log("Sending Solidity code to ML model...");
            const mlResponse = await axios.post(
                "http://localhost:8000/predict",
                { code: extractedCode }
            );

            if (mlResponse.data && mlResponse.data.risk_score) {
                res.json({
                    message: "Contract fetched successfully!",
                    sourceCode: extractedCode,
                    risk_score: mlResponse.data.risk_score,
                    interpretation: mlResponse.data.interpretation,
                    note: "For automated protection, use POST /api/deploy/analyze-and-deploy"
                });
            } else {
                res.status(500).json({ error: "ML model did not return a valid risk grade" });
            }

        } else {
            res.status(404).json({ error: "No verified contract found at this address" });
        }
    } catch (error) {
        console.error("Error fetching contract:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Health check endpoint with available endpoints
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        availableEndpoints: [
            "POST /api/deploy/analyze-and-deploy",  // Main complete flow
            "POST /api/deploy/check-only",          // Risk check without deployment
            "POST /fetch-contract",                 // Legacy endpoint
            "GET /health"                           // This endpoint
        ],
        flow: "Contract Address → Fetch → ML Analysis → Risk Assessment → Auto Protection"
    });
});

// Handle undefined routes
app.use("*", (req, res) => {
    res.status(404).json({
        success: false,
        error: "Endpoint not found",
        availableEndpoints: [
            "POST /api/deploy/analyze-and-deploy",
            "POST /api/deploy/check-only", 
            "POST /fetch-contract",
            "GET /health"
        ]
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`\n📋 Available Endpoints:`);
    console.log(`   🎯 POST /api/deploy/analyze-and-deploy  - Complete automated flow`);
    console.log(`   🔍 POST /api/deploy/check-only          - Risk check without deployment`);
    console.log(`   📜 POST /fetch-contract                 - Legacy contract fetching`);
    console.log(`   💚 GET  /health                         - Health check\n`);
    console.log(`🔄 Flow: Contract Address → Fetch → ML Analysis → Risk Assessment → Protection`);
});