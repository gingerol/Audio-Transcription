# Audio Transcription Web App

A web application for transcribing audio files using OpenAI's Whisper model.

## Features

- Upload multiple audio files (MP3, WAV, M4A, OGG)
- Transcribe audio using Whisper's medium model for high accuracy
- View and download transcriptions
- Modern, responsive UI

## Architecture

- **Frontend**: React with Tailwind CSS
- **Backend**: Node.js with Express
- **Transcription**: OpenAI Whisper (medium model)
- **Web Server**: NGINX with SSL
- **Process Management**: PM2

## Recent Optimizations

- Implemented sequential processing to prevent Out of Memory (OOM) errors
- Added swap space for additional memory buffer
- Optimized Whisper parameters for better resource usage
- Added detailed logging and error handling

## Server Requirements

- 8GB RAM
- 4 CPU cores
- 40GB disk space
- Ubuntu 22.04 or later
