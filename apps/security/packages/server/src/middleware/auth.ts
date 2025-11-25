import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthContext {
  userId: string;
  deviceId?: string;
  role?: string;
}

/**
 * Verify JWT token (user or service_role)
 */
export async function authMiddleware(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const token = authHeader.slice(7);

  try {
    return jwt.verify(token, env.JWT_SECRET) as AuthContext;
  } catch {
    throw new Error('Unauthorized');
  }
}

/**
 * Verify service_role JWT token (admin access)
 */
export async function serviceRoleMiddleware(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Service role token required');
  }

  const token = authHeader.slice(7);

  // Check if token matches service key
  if (token === env.SUPABASE_SERVICE_KEY) {
    return {
      userId: 'service',
      role: 'service_role',
    };
  }

  // Otherwise verify JWT and check role
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthContext;
    if (decoded.role !== 'service_role') {
      throw new Error('Forbidden: Service role required');
    }
    return decoded;
  } catch (error) {
    throw new Error('Unauthorized: Invalid service role token');
  }
}

/**
 * Extract token from request without verifying
 */
export function extractToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

export function generateToken(userId: string, deviceId: string): string {
  return jwt.sign({ userId, deviceId }, env.JWT_SECRET, { expiresIn: '24h' });
}
