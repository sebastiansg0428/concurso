require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const dbName = process.env.DB_NAME || 'concurso_cafes';
  let sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  sql = sql.replaceAll('concurso_cafes', dbName);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  await conn.query(sql);
  await conn.end();
  console.log(`Base de datos "${dbName}" lista.`);
})().catch((err) => {
  console.error('Error inicializando la base de datos:', err.message);
  process.exit(1);
});
