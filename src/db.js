const mysql = require('mysql2/promise');
const configuracionDb = require('./configuracion-db');

const pool = mysql.createPool({
  ...configuracionDb(),
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
