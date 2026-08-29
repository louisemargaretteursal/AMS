const app = require('./api/server');
const { initDb } = require('./api/db');

const port = Number(process.env.PORT) || 3002;
initDb().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`SSS dashboard running at http://localhost:${port}`);
  });
}).catch((err) => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
