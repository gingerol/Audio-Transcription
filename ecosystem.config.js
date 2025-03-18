module.exports = {
  apps: [
    {
      name: 'whisper-backend',
      cwd: '/var/www/whisper-app/backend',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4001,
        UPLOAD_DIR: '/var/www/whisper-app/backend/uploads',
        MAX_CONCURRENT_JOBS: 1,
        WHISPER_THREADS: 4,
        USE_FASTER_WHISPER: 'true'
      },
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 100,
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'whisper-frontend',
      script: '/usr/bin/python3',
      args: '-m http.server 4000',
      cwd: '/var/www/whisper-app/frontend/dist',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
