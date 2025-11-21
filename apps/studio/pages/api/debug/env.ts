import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Debug endpoint to verify Railway environment variables are properly configured
 * This helps diagnose platform database and authentication issues
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const config = {
    // Database Configuration
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrlFormat: process.env.DATABASE_URL
      ? process.env.DATABASE_URL.substring(0, 20) + '...'
      : 'not set',

    // Platform Configuration
    hasEncryptionKey: !!process.env.PG_META_CRYPTO_KEY,
    encryptionKeyLength: process.env.PG_META_CRYPTO_KEY?.length || 0,
    pgMetaUrl: process.env.STUDIO_PG_META_URL || 'not set',
    isPlatform: process.env.NEXT_PUBLIC_IS_PLATFORM === 'true',

    // Environment
    nodeEnv: process.env.NODE_ENV,
    railwayEnv: process.env.RAILWAY_ENVIRONMENT_NAME || 'not set',
    railwayRegion: process.env.RAILWAY_REGION || 'not set',

    // Auth Configuration
    hasGotrueUrl: !!process.env.NEXT_PUBLIC_GOTRUE_URL,
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,

    // Status Summary
    allRequiredVarsSet: !!(
      process.env.DATABASE_URL &&
      process.env.PG_META_CRYPTO_KEY &&
      process.env.STUDIO_PG_META_URL &&
      process.env.NEXT_PUBLIC_IS_PLATFORM
    ),
  }

  return res.status(200).json({
    message: 'Railway environment configuration check',
    timestamp: new Date().toISOString(),
    config,
  })
}
