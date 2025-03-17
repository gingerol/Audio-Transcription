import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import './App.css';

interface TranscriptionJob {
  id: string;
  fileName: string;
  status: 'waiting' | 'processing' | 'completed' | 'error';
  transcription?: string;
  error?: string;
}

function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<TranscriptionJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropAreaRef = useRef<HTMLDivElement>(null);

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
              return { ...job, status: 'completed', transcription: response.data.transcription };
            } else if (response.data.status === 'error') {
              return { ...job, status: 'error', error: response.data.error };
            } else {
              return { ...job, status: 'processing' };
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
      status: 'waiting' as const
    }));
    
    setJobs(initialJobs);

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('files', file);

      try {
        console.log('Uploading file:', file.name);
        const response = await axios.post('/api/transcribe', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        console.log('Response received:', response.data);
        
        if (response.data.jobId) {
          // Update job with real ID
          setJobs(prevJobs => 
            prevJobs.map((job, index) => 
              index === i ? { ...job, id: response.data.jobId, status: 'processing' } : job
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

  const downloadTranscription = (job: TranscriptionJob) => {
    if (!job.transcription) return;
    
    const element = document.createElement('a');
    const file = new Blob([job.transcription], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${job.fileName.replace(/\.[^/.]+$/, '')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
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
      {/* Navigation bar similar to Apple's */}
      <nav className="bg-black bg-opacity-90 text-white py-3 px-6 backdrop-blur-md">
        <div className="container mx-auto flex justify-between items-center">
          <div className="text-2xl font-medium">Audio Transcription</div>
          <div className="text-sm">Ẹkàárọ̀ Deborah and Taiwo!</div>
        </div>
      </nav>
      
      <div className="container mx-auto px-4 py-12">
        {/* Hero section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-semibold mb-4 tracking-tight">Audio Transcription</h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            Transcribe your audio files with precision and ease. 
            Built with advanced technology for accurate results.
          </p>
        </div>
        
        {/* Main content */}
        <div className="max-w-3xl mx-auto mb-16">
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
                      {file.name}
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
                    Processing...
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
                    <h3 className="font-medium">{job.fileName}</h3>
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
                          Processing
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
                    {job.status === 'waiting' && (
                      <div className="text-center py-8 text-gray-500">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p className="mt-4">Waiting for transcription to start...</p>
                      </div>
                    )}
                    
                    {job.status === 'processing' && (
                      <div className="text-center py-8">
                        <div className="flex justify-center space-x-2">
                          <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '600ms' }}></div>
                        </div>
                        <p className="mt-4 text-blue-600 font-medium">Transcribing your audio...</p>
                        <p className="mt-2 text-gray-500 text-sm">This may take a few minutes for longer files</p>
                      </div>
                    )}
                    
                    {job.status === 'error' && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
                        <div className="flex">
                          <svg className="h-6 w-6 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                          <p>{job.error || 'An error occurred during transcription'}</p>
                        </div>
                      </div>
                    )}
                    
                    {job.status === 'completed' && job.transcription && (
                      <div>
                        <div className="mb-6 flex justify-end">
                          <button
                            onClick={() => downloadTranscription(job)}
                            className="inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 bg-white rounded-full hover:bg-blue-50 focus:outline-none transition-colors duration-300"
                          >
                            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                            </svg>
                            Download
                          </button>
                        </div>
                        <div className="bg-gray-50 p-6 rounded-lg whitespace-pre-wrap max-h-80 overflow-y-auto text-gray-700 border border-gray-200">
                          {job.transcription}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Footer */}
        <footer className="border-t border-gray-200 py-8 mt-16">
          <div className="container mx-auto px-4">
            <div className="text-center text-gray-500 text-sm">
              <p>© ginger</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
