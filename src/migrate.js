const fs = require('fs');
const path = require('path');
const { db } = require('./db');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

db.exec(schema, (err) => {
  if (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
  console.log('Migration complete');
  process.exit(0);
});
