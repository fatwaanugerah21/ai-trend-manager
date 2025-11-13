module.exports = {
  apps: [
    {
      name: 'ai-trend-manager-backend',
      script: 'npm start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '3G',
      error_file: './logs/ai-trend-manager-backend-err.log',
      out_file: './logs/ai-trend-manager-backend-out.log',
      log_file: './logs/ai-trend-manager-backend.log',
      time: true
    },
  ]
};
