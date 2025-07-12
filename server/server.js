require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const proxyRoutes = require("./routes/proxyRoutes");
const { fetchContractDetails } = require("./services/blockchainService");
const { analyzeWithML } = require("./services/mlService");
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({ 
  origin: process.env.FRONTEND_URL || "http://localhost:5173", 
  credentials: true 
}));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/proxy', proxyRoutes);

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('analyzeContract', async (contractAddress) => {
    try {
      socket.emit('progress', { message: 'Fetching contract', progress: 20 })
      const contractDetails = await fetchContractDetails(contractAddress);
      socket.emit('progress', { message: 'Processing source code', progress: 50 });
      const mlAnalysis = await analyzeWithML(contractDetails.sourceCode);
      socket.emit('progress', { message: 'Finalizing analysis', progress: 80 });
      
      const results = {
        status: 'success',
        contractAddress,
        contractName: contractDetails.contractName || 'Unknown',
        hasSourceCode: !!contractDetails.sourceCode,
        riskScore: contractDetails.riskScore,
        mlAnalysis
      };
      
      socket.emit('progress', { message: 'Analysis complete', progress: 100 });
      socket.emit('analysisComplete', results);
    } catch (error) {
      socket.emit('error', error.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    status: 'error', 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Server Start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));