import { env } from '../config/env';

/**
 * Postgres Meta client for database introspection
 * Proxies requests to postgres-meta.railway.internal
 */

interface MetaRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

async function metaRequest<T = any>(
  endpoint: string,
  options: MetaRequestOptions = {}
): Promise<T> {
  const url = `${env.META_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Meta API error: ${response.status} - ${error}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(
      `Meta API request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get all tables from the database
 */
export async function getTables(options?: { includeSystemSchemas?: boolean }) {
  return metaRequest('/tables', {
    method: 'GET',
  });
}

/**
 * Get table details including columns
 */
export async function getTable(schema: string, table: string) {
  return metaRequest(`/tables/${schema}.${table}`);
}

/**
 * Get all columns for a table
 */
export async function getColumns(schema: string, table: string) {
  return metaRequest(`/columns?table=${schema}.${table}`);
}

/**
 * Get all schemas
 */
export async function getSchemas() {
  return metaRequest('/schemas');
}

/**
 * Get functions/stored procedures
 */
export async function getFunctions() {
  return metaRequest('/functions');
}

/**
 * Get database extensions
 */
export async function getExtensions() {
  return metaRequest('/extensions');
}

/**
 * Check Meta service health
 */
export async function checkHealth() {
  try {
    const startTime = Date.now();
    await metaRequest('/health');
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
