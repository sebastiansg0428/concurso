require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const configuracionDb = require('../src/configuracion-db');

(async () => {
  const configuracion = configuracionDb();
  const dbName = configuracion.database;
  let sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  sql = sql.replaceAll('concurso_cafes', dbName);

  const conn = await mysql.createConnection({
    ...configuracion,
    database: undefined,
    multipleStatements: true,
  });
  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
  console.log(`Base de datos "${dbName}" lista.`);
})().catch((err) => {
  console.error('Error inicializando la base de datos:', err.message);
  process.exit(1);
});
