const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');

const app = express();
const port = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/var/www/whisper-app/backend/uploads';
const MAX_CONCURRENT_JOBS = 1; // Limit to 1 concurrent job to prevent memory issues
const USE_FASTER_WHISPER = process.env.USE_FASTER_WHISPER === 'true' || false; // Flag to use faster-whisper if available

// Enable CORS
app.use(cors());
app.use(express.json());

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
let activeJobs = 0;

// Available models
const AVAILABLE_MODELS = [
    { id: 'tiny', name: 'Tiny', description: 'Fastest, least accurate' },
    { id: 'base', name: 'Base', description: 'Fast, reasonable accuracy' },
    { id: 'small', name: 'Small', description: 'Good balance of speed and accuracy' },
    { id: 'medium', name: 'Medium', description: 'High accuracy, slower' },
    { id: 'large', name: 'Large', description: 'Highest accuracy, slowest' }
];

// Function to get system memory info
function getMemoryInfo() {
    const totalMem = os.totalmem() / (1024 * 1024); // MB
    const freeMem = os.freemem() / (1024 * 1024); // MB
    const usedMem = totalMem - freeMem;
    const memoryUsage = process.memoryUsage();
    
    return {
        totalMemoryMB: totalMem.toFixed(2),
        freeMemoryMB: freeMem.toFixed(2),
        usedMemoryMB: usedMem.toFixed(2),
        memoryUsagePercent: ((usedMem / totalMem) * 100).toFixed(2),
        processMemoryMB: (memoryUsage.rss / (1024 * 1024)).toFixed(2)
    };
}

async function processQueue() {
    if (isProcessing || transcriptionQueue.length === 0 || activeJobs >= MAX_CONCURRENT_JOBS) {
        return;
    }
    
    isProcessing = true;
    const { filePath, jobId, model = 'medium', language = 'en' } = transcriptionQueue.shift();
    
    try {
        activeJobs++;
        await transcribeAudio(filePath, jobId, model, language);
        activeJobs--;
    } catch (error) {
        activeJobs--;
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

async function transcribeAudio(inputPath, jobId, model = 'medium', language = 'en') {
    console.log(`[${Date.now()}] Starting transcription for: ${inputPath} using model: ${model}, language: ${language}`);
    
    // Check if file exists
    if (!fs.existsSync(inputPath)) {
        transcriptions.set(jobId, { status: 'error', error: `Input file not found: ${inputPath}` });
        return;
    }

    // Get absolute path
    const absolutePath = path.resolve(inputPath);
    const memInfoBefore = getMemoryInfo();
    console.log(`[${Date.now()}] Memory before transcription:`, memInfoBefore);

    try {
        return new Promise((resolve, reject) => {
            // Validate model
            const validModel = AVAILABLE_MODELS.find(m => m.id === model) ? model : 'medium';
            
            // Build whisper command with parameters
            let whisperCmd, whisperArgs;
            
            if (USE_FASTER_WHISPER) {
                // Using faster-whisper for better performance
                whisperCmd = 'faster-whisper';
                whisperArgs = [
                    '--model', validModel,
                    '--output_dir', UPLOAD_DIR,
                    '--output_format', 'all',
                    '--threads', process.env.WHISPER_THREADS || '4', // Use more threads for faster processing
                    '--beam_size', '5',
                    '--best_of', '5',
                    '--temperature', '0'
                ];
                
                // Add language if specified and not auto-detect
                if (language && language !== 'auto') {
                    whisperArgs.push('--language', language);
                }
                
                whisperArgs.push(absolutePath);
            } else {
                // Using original whisper
                whisperCmd = 'whisper';
                whisperArgs = [
                    absolutePath,
                    '--model', validModel,
                    '--output_dir', UPLOAD_DIR,
                    '--device', 'cpu',
                    '--threads', process.env.WHISPER_THREADS || '2'
                ];
                
                // Add language if specified and not auto-detect
                if (language && language !== 'auto') {
                    whisperArgs.push('--language', language);
                }
            }
            
            console.log(`[${Date.now()}] Running command: ${whisperCmd} ${whisperArgs.join(' ')}`);
            
            const transcriptionProcess = spawn(whisperCmd, whisperArgs);

            let output = '';
            let errorOutput = '';

            transcriptionProcess.stdout.on('data', (data) => {
                const message = data.toString();
                output += message;
                
                // Look for progress indicators in the output
                const progressMatch = message.match(/(\d+)%/);
                if (progressMatch) {
                    const progressPercent = parseInt(progressMatch[1], 10);
                    transcriptions.set(jobId, { 
                        status: 'processing', 
                        progress: progressPercent,
                        details: output
                    });
                } else {
                    transcriptions.set(jobId, { 
                        status: 'processing', 
                        details: output
                    });
                }
                
                console.log(`[${Date.now()}] Whisper output:`, message);
            });

            transcriptionProcess.stderr.on('data', (data) => {
                const message = data.toString();
                errorOutput += message;
                console.error(`[${Date.now()}] Whisper stderr:`, message);
            });

            transcriptionProcess.on('close', async (code) => {
                console.log(`[${Date.now()}] Whisper process exited with code ${code}`);
                
                const memInfoAfter = getMemoryInfo();
                console.log(`[${Date.now()}] Memory after transcription:`, memInfoAfter);
                
                // Even if code is null (process terminated), try to find the output file
                const baseName = path.basename(inputPath, path.extname(inputPath));
                const txtFile = path.join(UPLOAD_DIR, baseName + '.txt');
                const jsonFile = path.join(UPLOAD_DIR, baseName + '.json');
                console.log(`[${Date.now()}] Looking for transcript at: ${txtFile}`);
                
                if (fs.existsSync(txtFile)) {
                    const transcription = fs.readFileSync(txtFile, 'utf8');
                    
                    // Parse JSON if available to get segments
                    let segments = [];
                    if (fs.existsSync(jsonFile)) {
                        try {
                            const jsonData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
                            segments = jsonData.segments || [];
                        } catch (err) {
                            console.error(`[${Date.now()}] Error parsing JSON:`, err);
                        }
                    }
                    
                    transcriptions.set(jobId, { 
                        status: 'completed', 
                        transcription,
                        segments,
                        model: validModel,
                        language: language || 'auto',
                        inputFile: path.basename(inputPath),
                        outputFiles: {
                            txt: path.basename(txtFile),
                            json: fs.existsSync(jsonFile) ? path.basename(jsonFile) : null
                        },
                        completedAt: new Date().toISOString()
                    });
                    console.log(`[${Date.now()}] Transcription found and saved`);
                    resolve();
                } else {
                    console.log(`[${Date.now()}] No transcription file found, marking as error`);
                    transcriptions.set(jobId, { 
                        status: 'error', 
                        error: 'Failed to generate transcription output',
                        details: errorOutput || 'Unknown error during transcription process'
                    });
                    reject(new Error('Transcription file not found'));
                }
            });

            transcriptionProcess.on('error', (err) => {
                console.error(`[${Date.now()}] Whisper process error:`, err);
                transcriptions.set(jobId, { status: 'error', error: err.message });
                reject(err);
            });
        });
    } catch (error) {
        console.error(`[${Date.now()}] Error during transcription:`, error);
        transcriptions.set(jobId, { status: 'error', error: error.message });
        throw error;
    }
}

// Function to extract YouTube video ID from URL
function extractYoutubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Function to get YouTube video details
async function getYoutubeVideoDetails(videoId) {
    try {
        const info = await ytdl.getInfo(videoId);
        return {
            title: info.videoDetails.title,
            duration: parseInt(info.videoDetails.lengthSeconds),
            author: info.videoDetails.author.name,
            thumbnailUrl: info.videoDetails.thumbnails[0].url
        };
    } catch (error) {
        console.error(`[${Date.now()}] Error getting YouTube video details:`, error);
        throw error;
    }
}

// Function to download YouTube video and convert to audio
async function downloadYoutubeAudio(videoId, jobId) {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(UPLOAD_DIR, `${Date.now()}-youtube-${videoId}.mp3`);
        
        try {
            console.log(`[${Date.now()}] Downloading YouTube video: ${videoId}`);
            
            transcriptions.set(jobId, { 
                status: 'processing', 
                progress: 0,
                details: 'Downloading audio from YouTube...'
            });
            
            // Download video and pipe to ffmpeg to extract audio
            const videoStream = ytdl(videoId, { 
                quality: 'highestaudio',
                filter: 'audioonly'
            });
            
            // Track download progress
            let downloadedBytes = 0;
            let totalBytes = 0;
            
            videoStream.on('progress', (_, downloaded, total) => {
                downloadedBytes = downloaded;
                totalBytes = total;
                
                if (total > 0) {
                    const progressPercent = Math.round((downloaded / total) * 100);
                    transcriptions.set(jobId, { 
                        status: 'processing', 
                        progress: progressPercent,
                        details: `Downloading audio from YouTube... ${progressPercent}%`
                    });
                }
            });
            
            // Convert to MP3 using ffmpeg
            const ffmpegCommand = ffmpeg(videoStream)
                .audioCodec('libmp3lame')
                .audioBitrate(128)
                .format('mp3')
                .on('error', (err) => {
                    console.error(`[${Date.now()}] FFmpeg error:`, err);
                    reject(err);
                })
                .on('progress', (progress) => {
                    if (progress.percent) {
                        const progressPercent = Math.round(progress.percent);
                        transcriptions.set(jobId, { 
                            status: 'processing', 
                            progress: progressPercent,
                            details: `Converting video to audio... ${progressPercent}%`
                        });
                    }
                })
                .on('end', () => {
                    console.log(`[${Date.now()}] YouTube audio download completed: ${outputPath}`);
                    resolve(outputPath);
                })
                .save(outputPath);
                
        } catch (error) {
            console.error(`[${Date.now()}] Error downloading YouTube audio:`, error);
            reject(error);
        }
    });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    const memInfo = getMemoryInfo();
    
    res.json({ 
        status: 'ok',
        uploadDir: UPLOAD_DIR,
        uploadDirExists: fs.existsSync(UPLOAD_DIR),
        queueLength: transcriptionQueue.length,
        activeJobs,
        memory: memInfo,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        useFasterWhisper: USE_FASTER_WHISPER
    });
});

// Upload endpoint - returns job ID immediately
app.post('/api/transcribe', upload.single('files'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
    }

    try {
        console.log(`[${Date.now()}] File received:`, req.file);
        const jobId = Date.now().toString();
        
        // Get model and language from form data
        const model = req.body.model || 'medium';
        const language = req.body.language || 'en';
        
        // Store initial job status
        transcriptions.set(jobId, { 
            status: 'started',
            filename: req.file.originalname,
            filesize: req.file.size,
            model,
            language,
            startedAt: new Date().toISOString()
        });
        
        // Add to processing queue instead of starting immediately
        transcriptionQueue.push({
            filePath: req.file.path,
            jobId,
            model,
            language
        });
        
        // Start processing if not already running
        processQueue();
        
        // Return job ID immediately
        res.json({ 
            jobId,
            position: transcriptionQueue.length,
            estimatedStartTime: transcriptionQueue.length > 0 
                ? 'Queue position: ' + transcriptionQueue.length
                : 'Processing will begin shortly'
        });
    } catch (error) {
        console.error(`[${Date.now()}] Error handling upload:`, error);
        res.status(500).json({ error: error.message });
    }
});

// YouTube transcription endpoint
app.post('/api/transcribe-youtube', async (req, res) => {
    try {
        const { youtubeUrl, model = 'medium', language = 'en' } = req.body;
        
        if (!youtubeUrl) {
            return res.status(400).json({ error: 'No YouTube URL provided' });
        }
        
        // Extract video ID from URL
        const videoId = extractYoutubeVideoId(youtubeUrl);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }
        
        console.log(`[${Date.now()}] YouTube transcription request for video ID: ${videoId}`);
        
        // Get video details
        let videoDetails;
        try {
            videoDetails = await getYoutubeVideoDetails(videoId);
            console.log(`[${Date.now()}] Video details:`, videoDetails);
            
            // Check if video is too long (limit to 30 minutes)
            if (videoDetails.duration > 1800) {
                return res.status(400).json({ 
                    error: 'Video is too long. Maximum duration is 30 minutes.',
                    duration: videoDetails.duration
                });
            }
        } catch (error) {
            console.error(`[${Date.now()}] Error fetching video details:`, error);
            return res.status(400).json({ error: 'Unable to fetch video details. The video might be private or not exist.' });
        }
        
        const jobId = Date.now().toString();
        
        // Store initial job status with video details
        transcriptions.set(jobId, { 
            status: 'started',
            filename: `YouTube: ${videoDetails.title}`,
            videoId,
            videoDetails,
            model,
            language,
            startedAt: new Date().toISOString(),
            sourceType: 'youtube'
        });
        
        // Return job ID immediately
        res.json({ 
            jobId,
            videoDetails,
            position: transcriptionQueue.length,
            estimatedStartTime: transcriptionQueue.length > 0 
                ? 'Queue position: ' + transcriptionQueue.length
                : 'Processing will begin shortly'
        });
        
        // Start download and processing
        try {
            // Download audio
            const audioPath = await downloadYoutubeAudio(videoId, jobId);
            
            // Add to processing queue
            transcriptionQueue.push({
                filePath: audioPath,
                jobId,
                model,
                language
            });
            
            // Start processing if not already running
            processQueue();
        } catch (error) {
            console.error(`[${Date.now()}] Error processing YouTube video:`, error);
            transcriptions.set(jobId, { 
                status: 'error', 
                error: 'Failed to process YouTube video',
                details: error.message
            });
        }
        
    } catch (error) {
        console.error(`[${Date.now()}] Error handling YouTube transcription:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Get available models endpoint
app.get('/api/models', (req, res) => {
    res.json({ models: AVAILABLE_MODELS });
});

// Get available languages endpoint
app.get('/api/languages', (req, res) => {
    // Return a subset of languages supported by Whisper
    res.json({
        languages: [
            { code: 'auto', name: 'Auto-detect' },
            { code: 'en', name: 'English' },
            { code: 'fr', name: 'French' },
            { code: 'de', name: 'German' },
            { code: 'es', name: 'Spanish' },
            { code: 'it', name: 'Italian' },
            { code: 'pt', name: 'Portuguese' },
            { code: 'nl', name: 'Dutch' },
            { code: 'ru', name: 'Russian' },
            { code: 'zh', name: 'Chinese' },
            { code: 'ar', name: 'Arabic' },
            { code: 'ja', name: 'Japanese' },
            { code: 'ko', name: 'Korean' },
            { code: 'hi', name: 'Hindi' },
            { code: 'yo', name: 'Yoruba' },
            { code: 'ha', name: 'Hausa' },
            { code: 'ig', name: 'Igbo' }
        ]
    });
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
        isProcessing,
        activeJobs,
        activeTranscriptions: Array.from(transcriptions.entries()).length,
        memory: getMemoryInfo()
    });
});

// Serve files from the upload directory
app.get('/api/files/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(UPLOAD_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    res.sendFile(path.resolve(filepath));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(`[${Date.now()}] Unhandled error:`, err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Upload directory:', UPLOAD_DIR);
    console.log('Using faster-whisper:', USE_FASTER_WHISPER);
});
