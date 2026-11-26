import mysql from 'mysql2/promise';
import { logger } from './logger.js';

let pool: mysql.Pool | null = null;

export function getMysqlPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || '127.0.0.1',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'bgs_app',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'buyanja_grammar_db',
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0,
      namedPlaceholders: false,
    });
    logger.info('MySQL connection pool initialized');
  }
  return pool;
}

export async function testMysqlConnection(): Promise<boolean> {
  try {
    const p = getMysqlPool();
    await p.query('SELECT 1');
    return true;
  } catch (err) {
    logger.error({ err }, 'MySQL connection check failed');
    return false;
  }
}
