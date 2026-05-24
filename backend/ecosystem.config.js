module.exports = {
  apps: [{
    name: 'sandav-backend',
    script: 'dist/index.js',
    cwd: __dirname,
    env: { NODE_ENV: 'production' }
  }]
}
