require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { fetchContractDetails, saveSolidityCode, extractSolidityCode } = require("./services/blockchainService");
const securityAnalysisService = require("./services/securityAnalysisService");
const deployRoutes = require('./routes/uploadAndDeploy');      // New contracts
const existingContractRoutes = require('./routes/existing');   // Existing contracts

const app = express();
const server = http.createServer(app);

// Environment validation
const envPath = path.join(__dirname, '../.env');
console.log(`🔍 Looking for .env file at: ${envPath}`);

if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('✅ Environment variables loaded successfully');
    console.log(`   INFURA_RPC_URL: ${process.env.INFURA_RPC_URL ? 'Found' : 'Not found'}`);
    console.log(`   PRIVATE_KEY: ${process.env.PRIVATE_KEY ? 'Found' : 'Not found'}`);
    console.log(`   ETHERSCAN_API_KEY: ${process.env.ETHERSCAN_API_KEY ? 'Found' : 'Not found'}`);
} else {
    console.log('❌ .env file not found at expected location');
    console.log('📁 Current directory:', __dirname);
    console.log('📁 Looking for .env at:', envPath);
}

// Socket.IO setup with enhanced configuration
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Middleware
app.use(helmet());
app.use(cors({ 
    origin: process.env.FRONTEND_URL || "http://localhost:5173", 
    credentials: true 
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use('/api/deploy', deployRoutes);           // New contract endpoints
app.use('/api/risk', existingContractRoutes);   // Existing contract endpoints

// Legacy endpoint for backward compatibility (from app.js)
app.post('/fetch-contract', async (req, res) => {
    try {
        const { contractAddress } = req.body;
        
        if (!contractAddress) {
            return res.status(400).json({ error: "Contract address is required" });
        }

        console.log(`Fetching contract: ${contractAddress}`);
        
        // Emit progress to connected clients
        io.emit('fetchProgress', { 
            message: 'Fetching contract from blockchain...', 
            progress: 20,
            contractAddress 
        });

        const details = await fetchContractDetails(contractAddress);

        if (details && details.rawSourceCode) {
            const extractedCode = extractSolidityCode(details.rawSourceCode);

            if (!extractedCode) {
                return res.status(400).json({ error: "No Solidity contract code found" });
            }

            await saveSolidityCode({ ...details, extractedCode });

            io.emit('fetchProgress', { 
                message: 'Running security analysis...', 
                progress: 60,
                contractAddress 
            });

            const analysisResult = await securityAnalysisService.analyzeContract(extractedCode);

            io.emit('fetchProgress', { 
                message: 'Analysis complete!', 
                progress: 100,
                contractAddress 
            });

            if (analysisResult.success) {
                res.json({
                    message: "Contract fetched successfully!",
                    sourceCode: extractedCode,
                    risk_score: analysisResult.riskScore,
                    interpretation: analysisResult.interpretation,
                    vulnerabilities: analysisResult.vulnerabilities,
                    summary: analysisResult.summary,
                    slitherUsed: analysisResult.slitherUsed,
                    note: "For automated protection, use POST /api/risk/analyze-and-deploy"
                });
            } else {
                res.status(500).json({ 
                    error: "Security analysis failed",
                    details: analysisResult.error 
                });
            }

        } else {
            res.status(404).json({ error: "No verified contract found at this address" });
        }
    } catch (error) {
        console.error('Error in fetch-contract:', error);
        io.emit('fetchProgress', { 
            message: 'Error occurred during fetch', 
            progress: 0,
            error: error.message 
        });
        res.status(500).json({ 
            error: error.message || "Failed to fetch contract details" 
        });
    }
});

// Socket.IO connection handler for real-time analysis
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Real-time contract analysis for new contracts
    socket.on('analyzeContractRealtime', async (data) => {
        try {
            const { code, step } = data;
            
            if (step === 'analysis') {
                socket.emit('progress', { message: 'Starting enhanced security analysis...', progress: 10 });
                
                const analysisResult = await securityAnalysisService.analyzeContract(code);
                
                socket.emit('progress', { message: 'Running vulnerability detection...', progress: 40 });
                
                if (analysisResult.slitherUsed) {
                    socket.emit('progress', { message: 'Slither analysis completed', progress: 60 });
                }
                
                socket.emit('progress', { message: 'Security analysis complete', progress: 80 });
                
                socket.emit('analysisResult', {
                    success: analysisResult.success,
                    riskScore: analysisResult.riskScore,
                    interpretation: analysisResult.interpretation,
                    vulnerabilities: analysisResult.vulnerabilities,
                    summary: analysisResult.summary,
                    slitherUsed: analysisResult.slitherUsed
                });
            }
            
        } catch (error) {
            socket.emit('error', { message: error.message, step });
        }
    });

    // Real-time existing contract analysis
    socket.on('analyzeExistingContract', async (data) => {
        try {
            const { contractAddress } = data;
            
            socket.emit('progress', { message: 'Fetching contract from blockchain...', progress: 15 });
            
            const details = await fetchContractDetails(contractAddress);
            
            if (!details?.rawSourceCode) {
                socket.emit('error', { message: 'Contract not found or not verified' });
                return;
            }
            
            socket.emit('progress', { message: 'Extracting source code...', progress: 35 });
            
            const extractedCode = extractSolidityCode(details.rawSourceCode);
            
            if (!extractedCode) {
                socket.emit('error', { message: 'No valid Solidity code found' });
                return;
            }
            
            socket.emit('progress', { message: 'Running security analysis...', progress: 55 });
            
            const analysisResult = await securityAnalysisService.analyzeContract(extractedCode);
            
            socket.emit('progress', { message: 'Analysis complete!', progress: 100 });
            
            socket.emit('existingContractResult', {
                contractAddress,
                sourceCode: extractedCode,
                analysis: analysisResult
            });
            
        } catch (error) {
            socket.emit('error', { message: error.message, step: 'existing_analysis' });
        }
    });

    // Handle deployment progress
    socket.on('deployContract', async (data) => {
        try {
            const { abi, bytecode, contractName, constructorArgs } = data;
            
            socket.emit('progress', { message: 'Initiating deployment...', progress: 70 });
            socket.emit('progress', { message: 'Broadcasting transaction...', progress: 85 });
            socket.emit('progress', { message: 'Waiting for confirmation...', progress: 95 });
            const deploymentService = require('./services/deploymentService');
            const result = await deploymentService.deployContract({
                abi,
                bytecode,
                contractName,
                constructorArgs
            });
            
            socket.emit('progress', { message: 'Deployment complete!', progress: 100 });
            socket.emit('deploymentResult', result);
            
        } catch (error) {
            socket.emit('error', { message: error.message, step: 'deployment' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// Enhanced health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        services: {
            deployment: 'Available',
            blockchain: process.env.INFURA_RPC_URL ? 'Connected' : 'Not configured',
            websocket: 'Active',
            securityAnalysis: 'Available'
        },
        features: {
            newContracts: "Analyze, compile and deploy new smart contracts",
            existingContracts: "Assess risk and deploy security proxies for existing contracts",
            realTimeUpdates: "WebSocket support for live progress tracking"
        },
        endpoints: {
            newContracts: [
                "POST /api/deploy/analyze-and-deploy",
                "POST /api/deploy/check-only", 
                "POST /api/deploy/force-deploy"
            ],
            existingContracts: [
                "POST /api/risk/analyze-and-deploy",
                "POST /api/risk/check-only"
            ],
            legacy: [
                "POST /fetch-contract",
                "GET /health"
            ]
        },
        websocket: {
            endpoint: '/socket.io',
            events: {
                'analyzeContractRealtime': 'Real-time new contract analysis',
                'analyzeExistingContract': 'Real-time existing contract analysis',
                'deployContract': 'Real-time contract deployment'
            }
        }
    });
});

// Root endpoint with comprehensive documentation
app.get('/', (req, res) => {
    res.json({
        name: 'Smart Contract Security & Deployment Platform',
        version: '2.0.0',
        description: 'Complete platform with real-time updates for smart contract security analysis and deployment',
        features: {
            newContracts: {
                description: 'Upload, analyze, and deploy new smart contracts',
                realTime: 'Live progress updates via WebSocket',
                security: 'Enhanced security analysis with Slither integration',
                deployment: 'Automated compilation and deployment to testnet'
            },
            existingContracts: {
                description: 'Analyze existing deployed contracts and add protection',
                realTime: 'Live analysis progress via WebSocket', 
                riskAssessment: 'Comprehensive vulnerability detection',
                autoProtection: 'Automatic SecurityProxy deployment for high-risk contracts'
            }
        },
        endpoints: {
            newContracts: {
                'POST /api/deploy/analyze-and-deploy': 'Complete deployment pipeline',
                'POST /api/deploy/check-only': 'Security analysis only',
                'POST /api/deploy/force-deploy': 'Emergency override deployment'
            },
            existingContracts: {
                'POST /api/risk/analyze-and-deploy': 'Complete protection pipeline',
                'POST /api/risk/check-only': 'Risk assessment only'
            },
            legacy: {
                'POST /fetch-contract': 'Legacy contract analysis',
                'GET /health': 'System health check',
                'GET /': 'This documentation'
            }
        },
        websocket: {
            url: `ws://localhost:${process.env.PORT || 3000}/socket.io`,
            events: {
                client_to_server: [
                    'analyzeContractRealtime',
                    'analyzeExistingContract', 
                    'deployContract'
                ],
                server_to_client: [
                    'progress',
                    'analysisResult',
                    'existingContractResult',
                    'deploymentResult',
                    'error'
                ]
            }
        },
        usage: {
            newContract: 'Send Solidity code → Get real-time analysis → Deploy if secure',
            existingContract: 'Send address → Fetch & analyze → Auto-protect if risky'
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        suggestion: 'Check GET / for API documentation',
        availableEndpoints: {
            newContracts: ['POST /api/deploy/*'],
            existingContracts: ['POST /api/risk/*'],
            utility: ['GET /health', 'GET /']
        }
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Server Start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('🚀 Smart Contract Security & Deployment Platform v2.0');
    console.log('═'.repeat(70));
    console.log(`🌐 Server: http://localhost:${PORT}`);
    console.log(`🔗 Frontend: ${process.env.FRONTEND_URL || "http://localhost:5173"}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📚 API Docs: http://localhost:${PORT}/`);
    console.log(`💚 Health: http://localhost:${PORT}/health`);
    console.log('═'.repeat(70));
    
    console.log('\n🆕 NEW CONTRACTS:');
    console.log(`   🎯 POST /api/deploy/analyze-and-deploy  - Full pipeline`);
    console.log(`   🔍 POST /api/deploy/check-only          - Analysis only`);
    console.log(`   ⚠️  POST /api/deploy/force-deploy       - Override deployment`);
    
    console.log('\n🔍 EXISTING CONTRACTS:');
    console.log(`   🛡️ POST /api/risk/analyze-and-deploy    - Auto-protect pipeline`);
    console.log(`   📊 POST /api/risk/check-only            - Risk assessment only`);
    
    console.log('\n📡 REAL-TIME FEATURES:');
    console.log(`   🔌 WebSocket: ws://localhost:${PORT}/socket.io`);
    console.log(`   📈 Live progress updates for all operations`);
    console.log(`   🔄 Real-time security analysis feedback`);
    
    // Environment validation
    console.log('\n⚙️  CONFIGURATION STATUS:');
    const configs = [
        ['INFURA_RPC_URL', process.env.INFURA_RPC_URL],
        ['PRIVATE_KEY', process.env.PRIVATE_KEY], 
        ['ETHERSCAN_API_KEY', process.env.ETHERSCAN_API_KEY],
        ['RISK_THRESHOLD', process.env.RISK_THRESHOLD || '7.0']
    ];
    
    configs.forEach(([key, value]) => {
        console.log(`   ${value ? '✅' : '❌'} ${key}: ${value ? 'Configured' : 'Missing'}`);
    });
    
    if (!process.env.INFURA_RPC_URL || !process.env.PRIVATE_KEY) {
        console.log('\n⚠️  WARNING: Missing required environment variables!');
        console.log('   Create a .env file with:');
        console.log('   INFURA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID');
        console.log('   PRIVATE_KEY=your_private_key_here');
        console.log('   ETHERSCAN_API_KEY=your_etherscan_api_key');
    }
    
    console.log('\n🎉 Platform ready! Real-time smart contract security at your service! 🔐');
});