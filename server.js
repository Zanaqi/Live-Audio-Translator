const wss = require('./lib/server/wsServer');

console.log('WebSocket server running on port 3002...');

// Keep the process running
process.on('SIGINT', () => {
  console.log('Closing WebSocket server...');
  wss.close(() => {
    console.log('WebSocket server closed');
    process.exit(0);
  });
});

// For development, log all errors to console
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // Keep the server running even if there's an error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Keep the server running even if there's a promise rejection
});