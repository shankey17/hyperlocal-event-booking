const mysql = require('mysql2/promise');

// Railway injects DATABASE_URL automatically when a MySQL service is linked.
// Aiven also supports connection via URI.
// SSL is required by both providers.
const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
