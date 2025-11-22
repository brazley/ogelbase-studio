/**
 * Authentication API Types
 * Type definitions for authentication endpoints
 */

// ============================================
// Request Types
// ============================================

export interface SignUpRequest {
  email: string
  password: string
  first_name: string
  last_name: string
  username?: string
}

export interface SignInRequest {
  email: string
  password: string
}

export interface RefreshTokenRequest {
  token: string
}

// ============================================
// Response Types
// ============================================

export interface UserProfile {
  id: string
  email: string
  first_name: string
  last_name: string
  username?: string
  avatar_url?: string
  created_at: string
}

export interface AuthResponse {
  token: string
  user: UserProfile
  expires_at: string
}

export interface SignOutResponse {
  success: boolean
  message: string
}

export interface RefreshTokenResponse {
  token: string
  expires_at: string
}

// ============================================
// Error Response Types
// ============================================

export interface AuthError {
  error: string
  code?: string
  details?: Record<string, unknown>
}

// ============================================
// Database Types (matching platform.users schema)
// ============================================

export interface PlatformUser {
  id: string
  email: string
  username?: string
  first_name?: string
  last_name?: string
  avatar_url?: string
  phone?: string
  password_hash?: string
  mfa_enabled: boolean
  email_confirmed_at?: string
  banned_until?: string
  deleted_at?: string
  metadata: Record<string, unknown>
  last_sign_in_at?: string
  created_at: string
  updated_at: string
}

export interface PlatformUserSession {
  id: string
  user_id: string
  token: string // Stored as SHA-256 hash
  refresh_token?: string
  ip_address?: string
  user_agent?: string
  expires_at: string
  last_activity_at: string
  created_at: string
}

// Session with user data (used when joining sessions with users table)
export interface PlatformUserSessionWithUser extends PlatformUserSession {
  email: string
  username: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  banned_until: string | null
  deleted_at: string | null
}

// ============================================
// Session Management Types
// ============================================

export interface Session {
  id: string
  userId: string
  token: string
  expiresAt: string
  lastActivityAt: string
  ipAddress?: string
  userAgent?: string
  createdAt: string
}

export interface SessionWithUser extends Session {
  email: string
  firstName: string | null
  lastName: string | null
  username: string | null
}

export interface UserContext {
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  username: string | null
  sessionId: string
}

// ============================================
// Organization Types
// ============================================

export interface UserOrganization {
  organization_id: string
  organization_slug: string
  organization_name: string
  role: 'owner' | 'admin' | 'developer' | 'billing_admin' | 'member'
  joined_at: string
}

export interface AuthenticatedUser {
  id: string
  email: string
  first_name: string
  last_name: string
  username?: string | null
  avatar_url?: string | null
  created_at: string
  activeOrgId?: string | null
  organizations?: UserOrganization[]
}
