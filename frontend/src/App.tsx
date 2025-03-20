import { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import './App.css';

interface TranscriptionJob {
  id: string;
  fileName: string;
  status: 'waiting' | 'processing' | 'completed' | 'error';
  transcription?: string;
  error?: string;
  progress?: number;
  isYouTube?: boolean;
  youtubeDetails?: {
    title: string;
    author: string;
    duration: number;
  };
  model?: string; // Added model property
  language?: string; // Added language property
}

interface WhisperModel {
  id: string;
  name: string;
}

interface Language {
  code: string;
  name: string;
}

interface SystemHealth {
  queueLength: number;
  activeJobs: number;
  memory: {
    memoryUsagePercent: number;
  };
  uptime: number;
}

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [models, setModels] = useState<WhisperModel[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('medium'); // Default model
  const [selectedLanguage, setSelectedLanguage] = useState<string>('auto'); // Default language
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null); // Added systemHealth state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropAreaRef = useRef<HTMLDivElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [isYoutubeValid, setIsYoutubeValid] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'file' | 'youtube'>('file');

  // Fetch available models and languages on component mount
  useEffect(() => {
    async function fetchModelAndLanguages() {
      try {
        const [modelsResponse, languagesResponse] = await Promise.all([
          axios.get('/api/models'),
          axios.get('/api/languages'),
        ]);
        
        setModels(modelsResponse.data.models);
        setLanguages(languagesResponse.data.languages);
      } catch (error) {
        console.error('Error fetching models or languages:', error);
      }
    }
    
    fetchModelAndLanguages();
  }, []);

  // Fetch system health data
  useEffect(() => {
    async function fetchSystemHealth() {
      try {
        const response = await axios.get('/api/system-health');
        setSystemHealth(response.data);
      } catch (error) {
        console.error('Error fetching system health:', error);
      }
    }

    fetchSystemHealth();
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      setFiles(Array.from(selectedFiles));
      setError('');
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles(Array.from(e.dataTransfer.files));
      setError('');
    }
    
    if (dropAreaRef.current) {
      dropAreaRef.current.classList.remove('border-blue-500', 'bg-blue-50');
      dropAreaRef.current.classList.add('border-gray-200', 'bg-gray-50');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dropAreaRef.current) {
      dropAreaRef.current.classList.remove('border-gray-200', 'bg-gray-50');
      dropAreaRef.current.classList.add('border-blue-500', 'bg-blue-50');
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (dropAreaRef.current) {
      dropAreaRef.current.classList.remove('border-blue-500', 'bg-blue-50');
      dropAreaRef.current.classList.add('border-gray-200', 'bg-gray-50');
    }
  }, []);

  const checkStatus = async (jobId: string, index: number) => {
    try {
      const response = await axios.get(`/api/status/${jobId}`);
      console.log('Status check response:', response.data);
      
      setJobs(prevJobs => 
        prevJobs.map((job, idx) => {
          if (idx === index) {
            if (response.data.status === 'completed') {
              return { 
                ...job, 
                status: 'completed', 
                transcription: response.data.transcription,
                segments: response.data.segments
              };
            } else if (response.data.status === 'error') {
              return { ...job, status: 'error', error: response.data.error };
            } else {
              return { 
                ...job, 
                status: 'processing',
                progress: response.data.progress
              };
            }
          }
          return job;
        })
      );

      // If still processing, check again in 2 seconds
      if (response.data.status !== 'completed' && response.data.status !== 'error') {
        setTimeout(() => checkStatus(jobId, index), 2000);
      } else {
        // Check if all jobs are completed
        setJobs(prevJobs => {
          const allDone = prevJobs.every(job => 
            job.status === 'completed' || job.status === 'error'
          );
          
          if (allDone) {
            setIsProcessing(false);
          }
          
          return prevJobs;
        });
      }
    } catch (err: any) {
      console.error('Error checking status:', err);
      setJobs(prevJobs => 
        prevJobs.map((job, idx) => 
          idx === index 
            ? { ...job, status: 'error', error: 'Error checking transcription status' } 
            : job
        )
      );
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setIsProcessing(true);
    setError('');
    
    // Create initial job entries
    const initialJobs = files.map(file => ({
      id: `temp-${Date.now()}-${file.name}`,
      fileName: file.name,
      status: 'waiting' as const,
      model: selectedModel, // Use selected model
      language: selectedLanguage // Use selected language
    }));
    
    setJobs(initialJobs);

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('files', file);
      formData.append('model', selectedModel); // Include selected model
      formData.append('language', selectedLanguage); // Include selected language

      try {
        console.log(`Uploading file: ${file.name}`);
        const response = await axios.post('/api/transcribe', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        console.log('Response received:', response.data);
        
        if (response.data.jobId) {
          // Update job with real ID and position info
          setJobs(prevJobs => 
            prevJobs.map((job, index) => 
              index === i ? { 
                ...job, 
                id: response.data.jobId, 
                status: 'processing'
              } : job
            )
          );
          
          // Start polling for status
          setTimeout(() => checkStatus(response.data.jobId, i), 2000);
        }
      } catch (err: any) {
        console.error('Error uploading:', err);
        setJobs(prevJobs => 
          prevJobs.map((job, index) => 
            index === i ? { ...job, status: 'error', error: 'Error uploading file' } : job
          )
        );
      }
    }
  };

  const handleYoutubeSubmit = async () => {
    // Implement the YouTube submit logic here
  };

  const handleYoutubeUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const url = event.target.value;
    setYoutubeUrl(url);
    // Validate the YouTube URL here
    setIsYoutubeValid(true); // Update based on validation
  };

  const renderJobStatus = (job: TranscriptionJob) => {
    // Implement the rendering logic for job status here
    return <div>{job.status}</div>; // Placeholder implementation
  };

  const clearAll = () => {
    setFiles([]);
    setJobs([]);
    setIsProcessing(false);
    setError('');
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <nav className="bg-black bg-opacity-90 text-white py-3 px-6 backdrop-blur-md">
        <div className="container mx-auto flex justify-between items-center">
          <div className="text-2xl font-medium">Audio Transcription</div>
          <div className="text-sm">Connected Spaces Scribe</div>
        </div>
      </nav>
      
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-semibold mb-4 tracking-tight">Audio Transcription</h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            Transcribe your audio files or YouTube videos with precision and ease. 
            Powered by OpenAI's Whisper technology.
          </p>
        </div>
        
        <div className="max-w-3xl mx-auto mb-16">
          {/* Model and Language Selection */}
          <div className="flex justify-between mb-4">
            <div className="w-1/2 pr-2">
              <label htmlFor="model-select" className="block text-sm font-medium text-gray-700 mb-2">Select Model</label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                disabled={isProcessing}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
            </div>

            <div className="w-1/2 pl-2">
              <label htmlFor="language-select" className="block text-sm font-medium text-gray-700 mb-2">Select Language</label>
              <select
                id="language-select"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="block w-full border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                disabled={isProcessing}
              >
                {languages.map((language) => (
                  <option key={language.code} value={language.code}>{language.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-8 border-b border-gray-200">
            <nav className="flex -mb-px">
              <button 
                onClick={() => setActiveTab('file')}
                className={`py-4 px-6 font-medium text-sm border-b-2 ${
                  activeTab === 'file' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                disabled={isProcessing}
              >
                <span className="flex items-center">
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path>
                  </svg>
                  Upload Audio File
                </span>
              </button>
              
              <button 
                onClick={() => setActiveTab('youtube')}
                className={`py-4 px-6 font-medium text-sm border-b-2 ${
                  activeTab === 'youtube' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                disabled={isProcessing}
              >
                <span className="flex items-center">
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                  </svg>
                  YouTube URL
                </span>
              </button>
            </nav>
          </div>
          
          {/* Audio Upload Section */}
          {activeTab === 'file' ? (
            <form onSubmit={handleSubmit}>
              <div 
                ref={dropAreaRef}
                className="border-2 border-dashed border-gray-200 rounded-2xl p-10 mb-8 text-center bg-gray-50 transition-all duration-300"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="audio/*"
                  onChange={handleFileChange}
                  className="hidden"
                  multiple
                  disabled={isProcessing}
                />
                
                <div className="mb-6">
                  <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                  </svg>
                </div>
                
                <p className="text-xl font-medium mb-3">Drag and drop audio files here</p>
                <p className="text-gray-500 mb-5">or</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none transition-colors duration-300"
                  disabled={isProcessing}
                >
                  Select Files
                </button>
              </div>
              
              {files.length > 0 && (
                <div className="mb-8 bg-gray-50 p-6 rounded-2xl">
                  <h3 className="text-lg font-semibold mb-4">Selected Files:</h3>
                  <ul className="space-y-2">
                    {files.map((file, index) => (
                      <li key={index} className="flex items-center text-gray-700">
                        <svg className="h-5 w-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
                        </svg>
                        {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-center space-x-4">
                <button
                  type="submit"
                  disabled={files.length === 0 || isProcessing}
                  className={`px-8 py-4 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 focus:outline-none transition-colors duration-300 ${
                    (files.length === 0 || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isProcessing ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Transcribing...
                    </span>
                  ) : 'Transcribe'}
                </button>
                
                <button
                  type="button"
                  onClick={clearAll}
                  className="px-8 py-4 bg-gray-200 text-gray-700 rounded-full font-medium hover:bg-gray-300 focus:outline-none transition-colors duration-300"
                >
                  Clear All
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleYoutubeSubmit}>
              <div className="mb-8">
                <label htmlFor="youtube-url" className="block text-sm font-medium text-gray-700 mb-2">
                  YouTube Video URL
                </label>
                <input
                  type="text"
                  id="youtube-url"
                  className={`w-full px-4 py-2 border ${!isYoutubeValid ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:ring-blue-500 focus:border-blue-500`}
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={handleYoutubeUrlChange}
                  disabled={isProcessing}
                />
                {!isYoutubeValid && youtubeUrl !== '' && (
                  <p className="mt-2 text-sm text-red-600">
                    Please enter a valid YouTube URL
                  </p>
                )}
                <p className="mt-2 text-sm text-gray-500">
                  Enter a YouTube video URL to transcribe its audio content
                </p>
              </div>
              
              <div className="flex justify-center space-x-4">
                <button
                  type="submit"
                  disabled={!youtubeUrl || !isYoutubeValid || isProcessing}
                  className={`px-8 py-4 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 focus:outline-none transition-colors duration-300 ${
                    (!youtubeUrl || !isYoutubeValid || isProcessing) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isProcessing ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </span>
                  ) : 'Transcribe YouTube Video'}
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setYoutubeUrl('');
                    setIsYoutubeValid(true);
                    setError('');
                  }}
                  className="px-8 py-4 bg-gray-200 text-gray-700 rounded-full font-medium hover:bg-gray-300 focus:outline-none transition-colors duration-300"
                  disabled={isProcessing}
                >
                  Clear
                </button>
              </div>
            </form>
          )}
        </div>
        
        {error && (
          <div className="max-w-3xl mx-auto mb-8 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        
        {jobs.length > 0 && (
          <div className="max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-semibold mb-8 text-center">Transcriptions</h2>
            
            <div className="space-y-8">
              {jobs.map((job, index) => (
                <div key={index} className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                  <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                    <div>
                      <h3 className="font-medium">{job.fileName}</h3>
                      {job.model && job.language && ( // Check for model and language
                        <p className="text-xs text-gray-500">Model: {job.model}, Language: {job.language === 'auto' ? 'Auto-detect' : job.language}</p>
                      )}
                    </div>
                    <div>
                      {job.status === 'waiting' && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-200 text-gray-800">
                          Waiting
                        </span>
                      )}
                      {job.status === 'processing' && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                          <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Transcribing...
                        </span>
                      )}
                      {job.status === 'completed' && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                          Completed
                        </span>
                      )}
                      {job.status === 'error' && (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                          Error
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-6">
                    {renderJobStatus(job)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* System status */}
        {systemHealth && (
          <div className="max-w-3xl mx-auto mb-16 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-lg font-medium mb-2">System Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-white p-3 rounded border border-gray-100">
                <p className="text-gray-500">Queue Length</p>
                <p className="font-medium">{systemHealth.queueLength || 0}</p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-100">
                <p className="text-gray-500">Active Jobs</p>
                <p className="font-medium">{systemHealth.activeJobs || 0}</p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-100">
                <p className="text-gray-500">Memory Usage</p>
                <p className="font-medium">
                  {systemHealth.memory?.memoryUsagePercent || 0}%
                </p>
              </div>
              <div className="bg-white p-3 rounded border border-gray-100">
                <p className="text-gray-500">Uptime</p>
                <p className="font-medium">
                  {Math.floor((systemHealth.uptime || 0) / 60)} min
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Footer */}
        <footer className="border-t border-gray-200 py-8 mt-16">
          <div className="container mx-auto px-4">
            <div className="text-center text-gray-500 text-sm">
              <p>© Connected Spaces</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
