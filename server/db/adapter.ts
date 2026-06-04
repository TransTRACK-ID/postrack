import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Runtime detection for desktop mode
const isDesktop = !!process.env.ELECTRON_DESKTOP;

// PostgreSQL setup (existing)
let pgPool: Pool | null = null;
let pgDb: any = null;

// SQLite setup (new)
let sqlite: Database.Database | null = null;
let sqliteDb: any = null;

if (isDesktop) {
  console.log('[Database] Running in DESKTOP mode - using SQLite');
  
  // Determine database path
  const dbPath = process.env.DATABASE_URL && process.env.DATABASE_URL !== 'sqlite' 
    ? process.env.DATABASE_URL 
    : join(process.cwd(), 'postrack.db');
  
  // Ensure directory exists for the database file
  const dbDir = join(dbPath, '..');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  console.log(`[Database] SQLite database path: ${dbPath}`);
  
  sqlite = new Database(dbPath);
  
  // Enable WAL mode for better concurrency
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  
  // Import SQLite schema dynamically
  const sqliteSchema = await import('./schema-sqlite');
  sqliteDb = drizzleSqlite(sqlite, { schema: sqliteSchema });
} else {
  console.log('[Database] Running in WEB mode - using PostgreSQL');
  
  // Use environment variable for database URL
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('[Database] ERROR: DATABASE_URL environment variable is not set');
    console.error('[Database] Please set DATABASE_URL in your .env file');
    console.error('[Database] Example: DATABASE_URL=postgresql://user:password@localhost:5432/mock_service');
    process.exit(1);
  }
  
  console.log(`[Database] Using PostgreSQL database`);
  
  // Optimized connection pool configuration for remote PostgreSQL
  pgPool = new Pool({
    connectionString: databaseUrl,
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
    allowExitOnIdle: false,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000
  });
  
  // Import PostgreSQL schema dynamically
  const pgSchema = await import('./schema');
  pgDb = drizzlePg(pgPool, { schema: pgSchema });
  
  // Monitor pool health
  const enablePoolLogging = process.env.LOG_DB_POOL_STATS === 'true';
  
  if (enablePoolLogging) {
    pgPool.on('connect', () => {
      console.log('[Database] New connection established');
    });
    
    pgPool.on('remove', () => {
      console.log('[Database] Connection removed from pool');
    });
  }
  
  pgPool.on('error', (err) => {
    console.error('[Database] Unexpected error on idle client', err);
  });
  
  if (enablePoolLogging) {
    const poolStatsInterval = setInterval(() => {
      const stats = {
        total: pgPool!.totalCount,
        idle: pgPool!.idleCount,
        waiting: pgPool!.waitingCount
      };
      console.log('[Database Pool Stats]', stats);
    }, 30000);
    
    poolStatsInterval.unref();
  }
  
  // Graceful shutdown handler
  if (process.env.NODE_ENV === 'production') {
    const gracefulShutdown = async () => {
      console.log('[Database] Graceful shutdown initiated, closing pool...');
      try {
        await pgPool!.end();
        console.log('[Database] Pool closed successfully');
      } catch (err) {
        console.error('[Database] Error closing pool:', err);
      }
      process.exit(0);
    };
    
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }
}

// Export the appropriate database instance
export const db = isDesktop ? sqliteDb : pgDb;

// Export the appropriate schema
export const schema = isDesktop 
  ? await import('./schema-sqlite') 
  : await import('./schema');

// Export raw database instances for advanced use
export { sqlite, pgPool };
