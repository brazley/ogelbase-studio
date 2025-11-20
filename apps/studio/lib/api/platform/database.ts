import { PG_META_URL } from 'lib/constants/index'
import { constructHeaders } from '../apiHelpers'
import { PgMetaDatabaseError, databaseErrorSchema, WrappedResult } from '../self-hosted/types'
import crypto from 'crypto-js'

// Platform database connection configuration
const PLATFORM_DATABASE_URL = process.env.DATABASE_URL || ''
const ENCRYPTION_KEY = process.env.PG_META_CRYPTO_KEY || 'SAMPLE_KEY'

/**
 * Encrypts a string using the configured encryption key
 */
function encryptString(stringToEncrypt: string): string {
  return crypto.AES.encrypt(stringToEncrypt, ENCRYPTION_KEY).toString()
}

export type PlatformQueryOptions = {
  query: string
  parameters?: unknown[]
  headers?: HeadersInit
}

/**
 * Executes a SQL query against the platform database via pg-meta service.
 * The platform database contains organizations, projects, and credentials tables.
 */
export async function queryPlatformDatabase<T = unknown>({
  query,
  parameters,
  headers,
}: PlatformQueryOptions): Promise<WrappedResult<T[]>> {
  if (!PLATFORM_DATABASE_URL) {
    return {
      data: undefined,
      error: new Error('DATABASE_URL environment variable is not configured'),
    }
  }

  const connectionStringEncrypted = encryptString(PLATFORM_DATABASE_URL)

  const requestBody: { query: string; parameters?: unknown[] } = { query }
  if (parameters !== undefined) {
    requestBody.parameters = parameters
  }

  try {
    const response = await fetch(`${PG_META_URL}/query`, {
      method: 'POST',
      headers: constructHeaders({
        ...headers,
        'Content-Type': 'application/json',
        'x-connection-encrypted': connectionStringEncrypted,
      }),
      body: JSON.stringify(requestBody),
    })

    const result = await response.json()

    if (!response.ok) {
      const { message, code, formattedError } = databaseErrorSchema.parse(result)
      const error = new PgMetaDatabaseError(message, code, response.status, formattedError)
      return { data: undefined, error }
    }

    return { data: result, error: undefined }
  } catch (error) {
    if (error instanceof Error) {
      return { data: undefined, error }
    }
    throw error
  }
}

/**
 * Type definitions for platform database tables
 */
export type PlatformOrganization = {
  id: string
  name: string
  slug: string
  created_at?: string
  updated_at?: string
  billing_email?: string
}

export type PlatformProject = {
  id: string
  organization_id: string
  name: string
  slug: string
  ref: string
  database_host: string
  database_port: number
  database_name: string
  database_user: string
  database_password: string
  postgres_meta_url: string
  supabase_url: string
  status: string
  created_at?: string
  updated_at?: string
}

export type PlatformCredentials = {
  id: string
  project_id: string
  anon_key: string
  service_role_key: string
  jwt_secret: string
}
