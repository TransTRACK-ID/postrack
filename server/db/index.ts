import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { dirname, resolve, join } from 'path';
import { fileURLToPath } from 'url';

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
const pool = new Pool({
  connectionString: databaseUrl,
  max: 50,                        // Increased pool size for concurrent requests
  idleTimeoutMillis: 30000,       // Close idle connections after 30 seconds
  connectionTimeoutMillis: 30000, // Increased to 30s for remote DB network latency
  allowExitOnIdle: false,         // Keep pool active even when idle
  keepAlive: true,                // Enable TCP keepalive to prevent connection drops
  keepAliveInitialDelayMillis: 10000 // Check connection health every 10s
});

// Monitor pool health - only enable verbose logging when explicitly requested
const enablePoolLogging = process.env.LOG_DB_POOL_STATS === 'true';

if (enablePoolLogging) {
  pool.on('connect', () => {
    console.log('[Database] New connection established');
  });

  pool.on('remove', () => {
    console.log('[Database] Connection removed from pool');
  });
}

// Always log pool errors as they indicate real issues
pool.on('error', (err) => {
  console.error('[Database] Unexpected error on idle client', err);
});

// Log pool statistics every 30 seconds for monitoring (only when enabled)
if (enablePoolLogging) {
  const poolStatsInterval = setInterval(() => {
    const stats = {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    };
    console.log('[Database Pool Stats]', stats);
  }, 30000);
  
  // Unref the interval so it doesn't keep the event loop active in one-off contexts
  poolStatsInterval.unref();
}

// Graceful shutdown handler
if (process.env.NODE_ENV === 'production') {
  const gracefulShutdown = async () => {
    console.log('[Database] Graceful shutdown initiated, closing pool...');
    try {
      await pool.end();
      console.log('[Database] Pool closed successfully');
    } catch (err) {
      console.error('[Database] Error closing pool:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

export const db = drizzle(pool, { schema });

// Function to find drizzle migrations directory
function findMigrationsPath(): string | null {
  // Get current file directory in ESM
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFilePath);
  
  // Try multiple possible locations
  const possiblePaths = [
    process.env.DRIZZLE_MIGRATIONS_PATH,
    // Electron packaged app stores drizzle in extraResources
    ...(typeof (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath === 'string'
      ? [resolve((process as NodeJS.Process & { resourcesPath: string }).resourcesPath, 'drizzle')]
      : []),
    resolve(process.cwd(), 'drizzle'),
    resolve(process.cwd(), '.output', 'server', 'drizzle'),
    resolve(process.cwd(), '.output', 'drizzle'),
    resolve(currentDir, '..', '..', 'drizzle'),
    resolve(currentDir, '..', '..', '..', 'drizzle'),
    '/app/drizzle',
    '/app/.output/server/drizzle',
  ];
  
  console.log('[Database] Searching for migrations in:');
  for (const path of possiblePaths) {
    if (!path) continue;
    const exists = existsSync(path);
    console.log(`  - ${path}: ${exists ? 'FOUND' : 'not found'}`);
    if (exists) {
      return path;
    }
  }
  
  return null;
}

// Always run migrations to ensure database is up to date
console.log('[Database] Checking if migrations need to run...');
console.log(`[Database] NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[Database] DATABASE_URL: ${databaseUrl ? '***configured***' : 'NOT SET'}`);

async function runMigrations() {
  try {
    const migrationsPath = findMigrationsPath();
    
    if (migrationsPath) {
      console.log(`[Database] Running migrations from: ${migrationsPath}`);
      try {
        await migrate(db, { migrationsFolder: migrationsPath });
        console.log('✅ Database migrations completed successfully');
      } catch (migrateError: any) {
        console.error('❌ Migration failed:', migrateError.message);
        console.log('[Database] Attempting fallback: creating tables from SQL files...');
        await createTablesFromSQL(migrationsPath);
      }
    } else {
      console.error('❌ Migrations folder not found in any location');
      console.log('[Database] Current working directory:', process.cwd());
      
      // List files in current directory for debugging
      try {
        const files = readdirSync(process.cwd());
        console.log('[Database] Files in CWD:', files.join(', '));
      } catch (e) {
        console.log('[Database] Could not list CWD files');
      }
    }
  } catch (error: any) {
    console.error('❌ Failed to setup database:', error.message);
  }
}

async function createTablesFromSQL(migrationsPath: string) {
  try {
    console.log(`[Database] Creating tables from SQL files in: ${migrationsPath}`);
    const files = readdirSync(migrationsPath)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();
    
    console.log(`[Database] Found SQL files: ${files.join(', ')}`);
    
    for (const file of files) {
      const sqlPath = join(migrationsPath, file);
      console.log(`[Database] Executing ${file}...`);
      const sql = readFileSync(sqlPath, 'utf-8');
      const statements = sql.split('--> statement-breakpoint');
      
      for (const statement of statements) {
        const trimmed = statement.trim();
        if (trimmed && !trimmed.startsWith('--')) {
          try {
            await pool.query(trimmed);
          } catch (e: any) {
            if (!e.message?.includes('already exists')) {
              console.warn(`[Database] Warning executing SQL from ${file}:`, e.message);
            }
          }
        }
      }
    }
    console.log('✅ Database tables created from SQL files');
  } catch (error: any) {
    console.error('❌ Failed to create tables from SQL:', error.message);
  }
}

// Run migrations
runMigrations();

// Verify tables exist
setTimeout(async () => {
  try {
    const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('[Database] Tables in database:', result.rows.map((r: any) => r.table_name).join(', '));
  } catch (e: any) {
    console.error('[Database] Could not list tables:', e.message);
  }
}, 100);

export { schema };
