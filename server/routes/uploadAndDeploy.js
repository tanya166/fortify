const express = require('express');
const router = express.Router();
const securityAnalysisService = require('../services/securityAnalysisService');
const compilationService = require('../services/compilationService');
const deploymentService = require('../services/deploymentService');
const DEPLOYMENT_RISK_THRESHOLD = 50; // Lowered from 70 to be more strict
const CRITICAL_VULNERABILITY_THRESHOLD = 1; // No critical vulnerabilities allowed

// POST /api/deploy/analyze-and-deploy - Complete flow: analyze → compile → deploy
router.post('/analyze-and-deploy', async (req, res) => {
    try {
        const { code, contractName = 'MyContract', constructorArgs = [] } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'No Solidity code provided'
            });
        }

        console.log('🔍 Step 1: Enhanced Security Analysis');
        
        // Step 1: Enhanced Security Analysis
        const analysisResult = await securityAnalysisService.analyzeContract(code);
        
        if (!analysisResult.success) {
            return res.status(500).json({
                success: false,
                error: analysisResult.error,
                step: 'security_analysis'
            });
        }

        // ENHANCED blocking conditions
        const criticalVulns = analysisResult.summary.critical || 0;
        const highVulns = analysisResult.summary.high || 0;
        const riskScore = analysisResult.riskScore;

        // Block deployment for multiple reasons
        let blockReasons = [];
        
        if (criticalVulns > 0) {
            blockReasons.push(`${criticalVulns} critical vulnerabilities detected`);
        }
        
        if (riskScore >= DEPLOYMENT_RISK_THRESHOLD) {
            blockReasons.push(`Risk score ${riskScore} exceeds threshold ${DEPLOYMENT_RISK_THRESHOLD}`);
        }
        
        if (highVulns >= 3) {
            blockReasons.push(`Too many high-severity vulnerabilities (${highVulns})`);
        }

        // If Slither wasn't used and we have any high-risk patterns, be extra cautious
        if (!analysisResult.slitherUsed && (highVulns > 0 || riskScore > 20)) {
            blockReasons.push('Slither analysis unavailable and potential risks detected');
        }

        if (blockReasons.length > 0) {
            return res.status(403).json({
                success: false,
                error: 'DEPLOYMENT BLOCKED: Contract has security risks',
                riskScore: analysisResult.riskScore,
                interpretation: analysisResult.interpretation,
                vulnerabilities: analysisResult.vulnerabilities,
                summary: analysisResult.summary,
                step: 'security_check',
                blockReasons: blockReasons,
                slitherUsed: analysisResult.slitherUsed,
                message: `Deployment blocked due to: ${blockReasons.join(', ')}`
            });
        }

        // Additional warning for medium-risk contracts
        if (riskScore > 10) {
            console.log(`⚠️ Proceeding with medium-risk contract (score: ${riskScore})`);
        }

        console.log('🔧 Step 2: Compilation');
        
        // Step 2: Compilation
        const compilationResult = await compilationService.compileContract(code, `${contractName}.sol`);
        
        if (!compilationResult.success) {
            return res.status(400).json({
                success: false,
                error: compilationResult.error,
                errors: compilationResult.errors,
                step: 'compilation'
            });
        }

        console.log('🚀 Step 3: Deployment');
        
        // Step 3: Deployment
        const deploymentResult = await deploymentService.deployContract({
            abi: compilationResult.abi,
            bytecode: compilationResult.bytecode,
            contractName: compilationResult.contractName,
            constructorArgs
        });

        if (!deploymentResult.success) {
            return res.status(500).json({
                success: false,
                error: deploymentResult.error,
                step: 'deployment'
            });
        }

        // Success - return all results with enhanced security info
        res.json({
            success: true,
            message: 'Contract successfully analyzed, compiled, and deployed!',
            security: {
                riskScore: analysisResult.riskScore,
                interpretation: analysisResult.interpretation,
                vulnerabilitiesCount: analysisResult.vulnerabilities.length,
                summary: analysisResult.summary,
                slitherUsed: analysisResult.slitherUsed,
                passed: true,
                warnings: riskScore > 10 ? ['Contract has some security concerns but is within acceptable limits'] : []
            },
            compilation: {
                contractName: compilationResult.contractName,
                warningsCount: compilationResult.warnings?.length || 0
            },
            deployment: {
                contractAddress: deploymentResult.contractAddress,
                transactionHash: deploymentResult.transactionHash,
                explorerUrl: deploymentResult.explorerUrl,
                gasUsed: deploymentResult.gasUsed
            }
        });

    } catch (error) {
        console.error('Deployment flow error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            step: 'unexpected_error'
        });
    }
});

// POST /api/deploy/check-only - Enhanced security check only
router.post('/check-only', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'No Solidity code provided'
            });
        }

        const analysisResult = await securityAnalysisService.analyzeContract(code);

        if (!analysisResult.success) {
            return res.status(500).json({
                success: false,
                error: analysisResult.error
            });
        }

        // Enhanced deployment decision logic
        const criticalVulns = analysisResult.summary.critical || 0;
        const highVulns = analysisResult.summary.high || 0;
        const riskScore = analysisResult.riskScore;
        
        let deploymentStatus = 'ALLOWED';
        let deploymentMessage = 'Contract passed security check - safe to deploy';
        
        if (criticalVulns > 0) {
            deploymentStatus = 'BLOCKED';
            deploymentMessage = 'Critical vulnerabilities must be fixed before deployment';
        } else if (riskScore >= DEPLOYMENT_RISK_THRESHOLD) {
            deploymentStatus = 'BLOCKED';
            deploymentMessage = 'Risk score too high for safe deployment';
        } else if (highVulns >= 3) {
            deploymentStatus = 'BLOCKED';
            deploymentMessage = 'Too many high-severity issues for safe deployment';
        } else if (!analysisResult.slitherUsed && riskScore > 20) {
            deploymentStatus = 'WARNING';
            deploymentMessage = 'Slither analysis unavailable - manual review recommended';
        } else if (riskScore > 10) {
            deploymentStatus = 'WARNING';
            deploymentMessage = 'Contract has minor security concerns - review recommended';
        }

        res.json({
            success: true,
            riskScore: analysisResult.riskScore,
            interpretation: analysisResult.interpretation,
            deploymentStatus,
            deploymentAllowed: deploymentStatus === 'ALLOWED',
            vulnerabilities: analysisResult.vulnerabilities,
            summary: analysisResult.summary,
            slitherUsed: analysisResult.slitherUsed,
            message: deploymentMessage,
            recommendations: analysisResult.vulnerabilities.length > 0 
                ? analysisResult.vulnerabilities.map(v => v.recommendation)
                : ['Contract appears secure - no specific recommendations']
        });

    } catch (error) {
        console.error('Security check error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/deploy/force-deploy - Emergency override (requires confirmation)
router.post('/force-deploy', async (req, res) => {
    try {
        const { code, contractName = 'MyContract', constructorArgs = [], confirmOverride = false } = req.body;

        if (!confirmOverride) {
            return res.status(400).json({
                success: false,
                error: 'Force deployment requires confirmOverride: true',
                message: 'This bypasses security checks and should only be used for testing'
            });
        }

        console.log('⚠️ FORCE DEPLOYMENT - BYPASSING SECURITY CHECKS');

        // Still run analysis for logging
        const analysisResult = await securityAnalysisService.analyzeContract(code);
        
        console.log('🔧 Force Compilation');
        const compilationResult = await compilationService.compileContract(code, `${contractName}.sol`);
        
        if (!compilationResult.success) {
            return res.status(400).json({
                success: false,
                error: compilationResult.error,
                step: 'compilation'
            });
        }

        console.log('🚀 Force Deployment');
        const deploymentResult = await deploymentService.deployContract({
            abi: compilationResult.abi,
            bytecode: compilationResult.bytecode,
            contractName: compilationResult.contractName,
            constructorArgs
        });

        res.json({
            success: true,
            message: 'CONTRACT FORCE DEPLOYED - SECURITY CHECKS BYPASSED',
            warning: 'This deployment bypassed all security checks',
            security: analysisResult.success ? {
                riskScore: analysisResult.riskScore,
                vulnerabilities: analysisResult.vulnerabilities,
                bypassedSecurity: true
            } : { error: 'Security analysis failed', bypassedSecurity: true },
            deployment: deploymentResult
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;