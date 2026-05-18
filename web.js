require('dotenv').config({ override: true });
const app = require('./app');
const db = require('./db');
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`\n  🎙️  Test12 VocalPosts`);
  console.log(`  ──────────────────────────`);
  console.log(`  Web UI running at http://localhost:${PORT}`);
  const dbOk = await db.init();
  if (dbOk) {
    console.log(`  DynamoDB: connected`);
  } else {
    console.log(`  DynamoDB: NOT CONNECTED — voice posts will be disabled`);
    console.log(`           ${db.getLastError()?.message || 'unknown error'}`);
  }
  console.log(`  Ready!\n`);
});
