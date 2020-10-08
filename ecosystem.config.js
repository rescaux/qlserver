module.exports = {
  apps: [
    {
      script: 'build/src/bundle.js',
    },
  ],
  deploy: {
    production: {
      ...require('./deploy.json'),
      ref: 'origin/master',
      repo: 'https://github.com/rescaux/qlserver.git',
      path: '/srv/qlserver',
      'pre-setup':
        'apt-get -y install nodejs git python3 python3-pip && npm install --global npm pm2 && python3 -m pip install --upgrade pip brother_ql',
      'post-deploy':
        'npm install && npm run compile && pm2 startOrRestart ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
