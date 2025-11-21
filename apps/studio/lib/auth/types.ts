/**
 * Production Auth Types
 * Type definitions for the authentication system
 */

export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  username?: string | null
  avatar_url?: string | null
  created_at: string
}

export interface Session {
  token: string
  expiresAt: string
}

export interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<User>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
  isAuthenticated: boolean
}

// API Response Types
export interface SignInResponse {
  token: string
  user: User
  expires_at: string
}

export interface RefreshResponse {
  token: string
  expires_at: string
}

export interface ValidateResponse {
  user: User
  expires_at: string
}

export interface SignOutResponse {
  success: boolean
  message: string
}

// Error Types
export interface AuthError {
  error: string
  code: string
  details?: Record<string, string[]>
}
