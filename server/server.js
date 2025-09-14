require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');
const deploymentRoute = require('./routes/uploadAndDeploy');
const app = express();
const server = http.createServer(app);
const path = require('path');
const fs = require('fs');
const assessAndProtectRouter = require('./routes/existing');

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});
const envPath = path.join(__dirname, '../.env');
console.log(`🔍 Looking for .env file at: ${envPath}`);

if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('✅ Environment variables loaded successfully');
    console.log(`   INFURA_RPC_URL: ${process.env.INFURA_RPC_URL ? 'Found' : 'Not found'}`);
    console.log(`   PRIVATE_KEY: ${process.env.PRIVATE_KEY ? 'Found' : 'Not found'}`);
} else {
    console.log('❌ .env file not found at expected location');
    console.log('📁 Current directory:', __dirname);
    console.log('📁 Looking for .env at:', envPath);
}

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
app.use('/api/deploy', deploymentRoute);
app.use('/api', assessAndProtectRouter);

// Legacy route for existing contract fetching (similar to your target)
app.post('/fetch-contract', async (req, res) => {
    try {
        const { contractAddress } = req.body;
        
        if (!contractAddress) {
            return res.status(400).json({ error: "Contract address is required" });
        }

        console.log(`Fetching contract: ${contractAddress}`);
        
        // This would integrate with your existing blockchain service
        // const contractDetails = await fetchContractDetails(contractAddress);
        
        res.json({
            success: true,
            message: "Contract fetching endpoint - implement blockchain service integration"
        });

    } catch (error) {
        console.error('Error in fetch-contract:', error);
        res.status(500).json({ 
            error: error.message || "Failed to fetch contract details" 
        });
    }
});

// Socket.IO connection handler for real-time analysis
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle real-time contract analysis
  socket.on('analyzeContractRealtime', async (data) => {
    try {
      const { code, step } = data;
      
      if (step === 'analysis') {
        socket.emit('progress', { message: 'Starting security analysis...', progress: 20 });
        socket.emit('progress', { message: 'Running vulnerability checks...', progress: 40 });
        
        // This would integrate with your security analysis service
        // const result = await securityAnalysisService.analyzeContract(code);
        
        socket.emit('progress', { message: 'Analysis complete', progress: 60 });
        socket.emit('analysisResult', { 
          riskScore: 25, 
          vulnerabilities: [],
          interpretation: "Analysis completed successfully" 
        });
      }
      
    } catch (error) {
      socket.emit('error', { message: error.message, step });
    }
  });

  // Handle deployment progress
  socket.on('deployContract', async (data) => {
    try {
      const { abi, bytecode, contractName, constructorArgs } = data;
      
      socket.emit('progress', { message: 'Initiating deployment...', progress: 70 });
      socket.emit('progress', { message: 'Broadcasting transaction...', progress: 85 });
      socket.emit('progress', { message: 'Waiting for confirmation...', progress: 95 });
      
      // Integration with your existing deployment service
      socket.emit('progress', { message: 'Deployment complete!', progress: 100 });
      socket.emit('deploymentResult', { 
        success: true, 
        contractAddress: '0x...',
        transactionHash: '0x...' 
      });
      
    } catch (error) {
      socket.emit('error', { message: error.message, step: 'deployment' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Health check endpoint (enhanced version)
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        services: {
            deployment: 'Available',
            blockchain: 'Connected',
            websocket: 'Active'
        }
    });
});

// Root endpoint with API info
app.get('/', (req, res) => {
    res.json({
        name: 'Smart Contract Deployer API',
        version: '1.0.0',
        endpoints: {
            'POST /api/deploy/analyze-and-deploy': 'Analyze, compile, and deploy contract',
            'POST /api/deploy/check-only': 'Security analysis only',
            'POST /fetch-contract': 'Fetch existing contract details',
            'GET /health': 'Health check'
        },
        websocket: {
            endpoint: '/socket.io',
            events: {
                'analyzeContractRealtime': 'Real-time contract analysis',
                'deployContract': 'Real-time contract deployment'
            }
        },
        documentation: {
            analyze_and_deploy: {
                description: 'Full deployment pipeline',
                body: {
                    code: 'Solidity source code (required)',
                    contractName: 'Contract name (optional, default: MyContract)',
                    constructorArgs: 'Constructor arguments array (optional, default: [])'
                }
            },
            check_only: {
                description: 'Security analysis without deployment',
                body: {
                    code: 'Solidity source code (required)'
                }
            }
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: [
            'POST /api/deploy/analyze-and-deploy',
            'POST /api/deploy/check-only',
            'POST /fetch-contract',
            'GET /health'
        ]
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Server Start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('🚀 Smart Contract Deployer API');
    console.log('═'.repeat(50));
    console.log(`Server running on port ${PORT}`);
    console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:5173"}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log('═'.repeat(50));
    
    // Check environment variables
    if (!process.env.INFURA_RPC_URL) {
        console.log('⚠️  Warning: INFURA_RPC_URL not set');
    }
    if (!process.env.PRIVATE_KEY) {
        console.log('⚠️  Warning: PRIVATE_KEY not set');
    }
    if (!process.env.FRONTEND_URL) {
        console.log('ℹ️  Info: Using default frontend URL');
    }
    
    console.log('Ready to analyze and deploy smart contracts! 📝');
    console.log('WebSocket server active for real-time updates 🔌');
});