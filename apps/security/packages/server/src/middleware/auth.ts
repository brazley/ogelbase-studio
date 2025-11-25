import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthContext {
  userId: string;
  deviceId: string;
}

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

export function generateToken(userId: string, deviceId: string): string {
  return jwt.sign({ userId, deviceId }, env.JWT_SECRET, { expiresIn: '24h' });
}
