import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * Debug endpoint to verify environment variables are properly configured
 * This helps diagnose authentication issues related to missing or incorrect env vars
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const envVars = {
    NEXT_PUBLIC_IS_PLATFORM: process.env.NEXT_PUBLIC_IS_PLATFORM,
    NEXT_PUBLIC_GOTRUE_URL: process.env.NEXT_PUBLIC_GOTRUE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '***SET***' : undefined,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  }

  res.status(200).json({
    message: 'Environment variables check',
    timestamp: new Date().toISOString(),
    env: envVars,
  })
}
