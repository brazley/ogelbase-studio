import postgres from 'postgres';
import { env } from '../config/env';

// Connection pool singleton
let sql: ReturnType<typeof postgres> | null = null;

/**
 * Get or create Postgres connection pool
 */
export function getPostgresClient() {
  if (!sql) {
    sql = postgres(env.DATABASE_URL, {
      max: 10, // Connection pool size
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {}, // Suppress notice logs
    });
  }
  return sql;
}

/**
 * Execute a raw SQL query
 */
export async function query<T = any>(sqlQuery: string, params?: any[]) {
  const client = getPostgresClient();

  try {
    const startTime = Date.now();
    const result = params
      ? await client.unsafe(sqlQuery, params)
      : await client.unsafe(sqlQuery);

    return {
      rows: result as T[],
      rowCount: result.length,
      latency: Date.now() - startTime,
    };
  } catch (error) {
    throw new Error(
      `Database query failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Execute a migration within a transaction
 */
export async function migrate(name: string, sqlQuery: string) {
  const client = getPostgresClient();

  try {
    // Start transaction
    await client.begin(async (sql) => {
      // Execute migration SQL
      await sql.unsafe(sqlQuery);

      // Record migration in migrations table (if exists)
      try {
        await sql`
          INSERT INTO migrations (name, executed_at)
          VALUES (${name}, NOW())
          ON CONFLICT (name) DO NOTHING
        `;
      } catch {
        // migrations table might not exist yet
      }
    });

    return {
      success: true,
      name,
      executedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(
      `Migration failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get all tables from specified schemas
 */
export async function getTables(schemas: string[] = ['public']) {
  const client = getPostgresClient();

  try {
    const result = await client`
      SELECT
        schemaname as schema,
        tablename as name,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables
      WHERE schemaname = ANY(${schemas})
      ORDER BY schemaname, tablename
    `;

    return result.map((row) => ({
      schema: row.schema,
      name: row.name,
      size: row.size,
    }));
  } catch (error) {
    throw new Error(
      `Failed to get tables: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check database health
 */
export async function checkHealth() {
  const client = getPostgresClient();

  try {
    const startTime = Date.now();
    await client`SELECT 1`;
    const latency = Date.now() - startTime;

    return {
      connected: true,
      latency,
    };
  } catch (error) {
    return {
      connected: false,
      latency: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Close the database connection pool
 * (useful for graceful shutdown)
 */
export async function closeConnection() {
  if (sql) {
    await sql.end();
    sql = null;
  }
}
