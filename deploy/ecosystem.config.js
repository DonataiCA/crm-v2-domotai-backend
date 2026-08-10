// PM2 Ecosystem config for DomotaiCRM Backend
module.exports = {
  apps: [{
    name: 'domotai-api',
    script: 'dist/server.js',
    cwd: '/opt/domotai/backend',
    instances: 2,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    env_file: '/opt/domotai/backend/.env',
    error_file: '/var/log/domotai/api-error.log',
    out_file: '/var/log/domotai/api-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  }],
};
