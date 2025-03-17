const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;
const UPLOAD_DIR = '/var/www/whisper-app/backend/uploads';

// Enable CORS
app.use(cors());

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer for handling file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit
    }
});

// Store ongoing transcriptions
const transcriptions = new Map();

// Queue for processing files sequentially
const transcriptionQueue = [];
let isProcessing = false;

async function processQueue() {
    if (isProcessing || transcriptionQueue.length === 0) {
        return;
    }
    
    isProcessing = true;
    const { filePath, jobId } = transcriptionQueue.shift();
    
    try {
        await transcribeAudio(filePath, jobId);
    } catch (error) {
        console.error(`[${Date.now()}] Error processing file in queue:`, error);
        transcriptions.set(jobId, { 
            status: 'error', 
            error: 'Failed to process file in queue', 
            details: error.message 
        });
    }
    
    isProcessing = false;
    // Process next item in queue
    processQueue();
}

async function transcribeAudio(inputPath, jobId) {
    console.log('[' + Date.now() + '] Starting transcription for:', inputPath);
    
    // Check if file exists
    if (!fs.existsSync(inputPath)) {
        transcriptions.set(jobId, { status: 'error', error: `Input file not found: ${inputPath}` });
        return;
    }

    // Get absolute path
    const absolutePath = path.resolve(inputPath);
    console.log('[' + Date.now() + '] Absolute path:', absolutePath);

    // Check available memory before starting
    const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const availableMemMatch = memInfo.match(/MemAvailable:\s+(\d+)/);
    if (availableMemMatch) {
        const availableMem = parseInt(availableMemMatch[1]) / 1024; // Convert to MB
        console.log(`[${Date.now()}] Available memory before transcription: ${availableMem.toFixed(2)} MB`);
    }

    try {
        return new Promise((resolve, reject) => {
            // Use medium model for better quality but with optimized parameters
            const transcriptionProcess = spawn('whisper', [
                absolutePath,
                '--model', 'medium',
                '--language', 'en',
                '--output_dir', UPLOAD_DIR,
                '--device', 'cpu',      // Force CPU usage
                '--threads', '2'        // Limit threads to reduce memory usage
            ]);

            let output = '';
            let errorOutput = '';

            transcriptionProcess.stdout.on('data', (data) => {
                const message = data.toString();
                output += message;
                console.log('[' + Date.now() + '] Whisper output:', message);
                // Update progress
                transcriptions.set(jobId, { status: 'processing', progress: output });
            });

            transcriptionProcess.stderr.on('data', (data) => {
                const message = data.toString();
                errorOutput += message;
                console.error('[' + Date.now() + '] Whisper stderr:', message);
            });

            transcriptionProcess.on('close', (code) => {
                console.log('[' + Date.now() + '] Whisper process exited with code', code);
                
                // Even if code is null (process terminated), try to find the output file
                const baseName = path.basename(inputPath, path.extname(inputPath));
                const txtFile = path.join(UPLOAD_DIR, baseName + '.txt');
                console.log('[' + Date.now() + '] Looking for transcript at:', txtFile);
                
                if (fs.existsSync(txtFile)) {
                    const transcription = fs.readFileSync(txtFile, 'utf8');
                    transcriptions.set(jobId, { status: 'completed', transcription });
                    console.log('[' + Date.now() + '] Transcription found and saved');
                    resolve();
                } else {
                    // If the process was terminated but no output file, try a direct command
                    console.log('[' + Date.now() + '] No transcription file found, trying direct command');
                    
                    // Execute whisper directly as a synchronous process with medium model
                    const { exec } = require('child_process');
                    exec(`cd ${UPLOAD_DIR} && whisper "${absolutePath}" --model medium --language en --device cpu --threads 2`, (error, stdout, stderr) => {
                        if (error) {
                            console.error('[' + Date.now() + '] Direct command error:', error);
                            transcriptions.set(jobId, { 
                                status: 'error', 
                                error: 'Failed to transcribe audio', 
                                details: error.message 
                            });
                            reject(error);
                            return;
                        }
                        
                        // Check again for the output file
                        if (fs.existsSync(txtFile)) {
                            const transcription = fs.readFileSync(txtFile, 'utf8');
                            transcriptions.set(jobId, { status: 'completed', transcription });
                            console.log('[' + Date.now() + '] Transcription found after direct command');
                            resolve();
                        } else {
                            const err = new Error('Transcription file not found after direct command');
                            transcriptions.set(jobId, { 
                                status: 'error', 
                                error: err.message 
                            });
                            reject(err);
                        }
                    });
                }
            });

            transcriptionProcess.on('error', (err) => {
                console.error('[' + Date.now() + '] Whisper process error:', err);
                transcriptions.set(jobId, { status: 'error', error: err.message });
                reject(err);
            });
        });
    } catch (error) {
        console.error('[' + Date.now() + '] Error during transcription:', error);
        transcriptions.set(jobId, { status: 'error', error: error.message });
        throw error;
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        uploadDir: UPLOAD_DIR,
        uploadDirExists: fs.existsSync(UPLOAD_DIR)
    });
});

// Upload endpoint - returns job ID immediately
app.post('/api/transcribe', upload.single('files'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
    }

    try {
        console.log('[' + Date.now() + '] File received:', req.file);
        const jobId = Date.now().toString();
        
        // Store initial job status
        transcriptions.set(jobId, { status: 'started' });
        
        // Add to processing queue instead of starting immediately
        transcriptionQueue.push({
            filePath: req.file.path,
            jobId: jobId
        });
        
        // Start processing if not already running
        processQueue();
        
        // Return job ID immediately
        res.json({ jobId });
    } catch (error) {
        console.error('[' + Date.now() + '] Error handling upload:', error);
        res.status(500).json({ error: error.message });
    }
});

// Status check endpoint
app.get('/api/status/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const status = transcriptions.get(jobId);
    
    if (!status) {
        return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(status);
});

// Queue status endpoint (for debugging)
app.get('/api/queue', (req, res) => {
    res.json({
        queueLength: transcriptionQueue.length,
        isProcessing: isProcessing,
        activeTranscriptions: Array.from(transcriptions.entries()).length
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[' + Date.now() + '] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Upload directory:', UPLOAD_DIR);
});
