/**
 * FITMOD — Connexion MySQL (pool)
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'fitmod',
    password: process.env.DB_PASSWORD || 'fitmod123',
    database: process.env.DB_NAME || 'fitmod_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
