module.exports = {
  apps: [
    {
      name: 'qamarero-timetracker',
      script: 'src/server.js',
      cwd: __dirname,
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
