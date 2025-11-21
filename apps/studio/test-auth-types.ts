/**
 * Type validation test for auth system
 * This file should compile without errors
 */

import type { User, Session, AuthContextValue, SignInResponse } from './lib/auth/types'

// Test User type
const testUser: User = {
  id: 'test-id',
  email: 'test@example.com',
  first_name: 'Test',
  last_name: 'User',
  username: 'testuser',
  avatar_url: null,
  created_at: new Date().toISOString()
}

// Test Session type
const testSession: Session = {
  token: 'test-token',
  expiresAt: new Date().toISOString()
}

// Test AuthContextValue type
const testContextValue: AuthContextValue = {
  user: testUser,
  session: testSession,
  loading: false,
  signIn: async (email: string, password: string, rememberMe?: boolean) => testUser,
  signOut: async () => {},
  refreshSession: async () => {},
  isAuthenticated: true
}

// Test SignInResponse type
const testSignInResponse: SignInResponse = {
  token: 'test-token',
  user: testUser,
  expires_at: new Date().toISOString()
}

console.log('✅ All types compile successfully')
