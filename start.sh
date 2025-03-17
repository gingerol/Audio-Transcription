#!/bin/bash

# Delete existing PM2 processes
pm2 delete all

# Start backend
cd /var/www/whisper-app/backend
pm2 start "node src/index.js" --name whisper-backend

# Build and serve frontend
cd /var/www/whisper-app/frontend
npm run build
pm2 start "npx serve -s dist -l 4000" --name whisper-frontend

# Save PM2 configuration
pm2 save
