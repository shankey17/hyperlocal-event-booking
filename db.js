const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),

  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: false
  },

  connectTimeout: 30000
});

module.exports = pool;
