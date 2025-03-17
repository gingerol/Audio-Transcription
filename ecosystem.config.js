module.exports = {
  apps: [
    {
      name: 'whisper-backend',
      cwd: '/var/www/whisper-app/backend',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 4001
      }
    },
    {
      name: 'whisper-frontend',
      script: '/usr/bin/python3',
      args: '-m http.server 4000',
      cwd: '/var/www/whisper-app/frontend/dist'
    }
  ]
};
