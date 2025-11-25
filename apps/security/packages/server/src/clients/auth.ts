import { env } from '../config/env';

/**
 * GoTrue Auth client
 * Proxies requests to supabase-auth.railway.internal
 */

interface AuthRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  token?: string; // User JWT token
  useServiceRole?: boolean; // Use service_role key instead of user token
}

async function authRequest<T = any>(
  endpoint: string,
  options: AuthRequestOptions = {}
): Promise<Response> {
  const url = `${env.AUTH_URL}${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': env.SUPABASE_SERVICE_KEY, // Always include apikey
    ...options.headers,
  };

  // Add authorization header
  if (options.useServiceRole) {
    headers['Authorization'] = `Bearer ${env.SUPABASE_SERVICE_KEY}`;
  } else if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    return response;
  } catch (error) {
    throw new Error(
      `Auth API request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Sign up a new user
 */
export async function signup(email: string, password: string, metadata?: any) {
  const response = await authRequest('/signup', {
    method: 'POST',
    body: { email, password, data: metadata },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || error.msg || 'Signup failed');
  }

  return await response.json();
}

/**
 * Sign in with email and password
 */
export async function signin(email: string, password: string) {
  const response = await authRequest('/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || error.msg || 'Sign in failed');
  }

  return await response.json();
}

/**
 * Sign out (revoke token)
 */
export async function signout(token: string) {
  const response = await authRequest('/logout', {
    method: 'POST',
    token,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || error.msg || 'Sign out failed');
  }

  return { success: true };
}

/**
 * Get current user from token
 */
export async function getUser(token: string) {
  const response = await authRequest('/user', {
    method: 'GET',
    token,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || error.msg || 'Get user failed');
  }

  return await response.json();
}

/**
 * Admin: List all users
 */
export async function listUsers(params?: { page?: number; perPage?: number }) {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.set('page', params.page.toString());
  if (params?.perPage) queryParams.set('per_page', params.perPage.toString());

  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  const response = await authRequest(`/admin/users${query}`, {
    method: 'GET',
    useServiceRole: true,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || error.msg || 'List users failed');
  }

  return await response.json();
}

/**
 * Admin: Create a new user
 */
export async function createUser(userData: {
  email: string;
  password: string;
  email_confirm?: boolean;
  user_metadata?: any;
}) {
  const response = await authRequest('/admin/users', {
    method: 'POST',
    useServiceRole: true,
    body: userData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || error.msg || 'Create user failed');
  }

  return await response.json();
}

/**
 * Admin: Delete a user
 */
export async function deleteUser(userId: string) {
  const response = await authRequest(`/admin/users/${userId}`, {
    method: 'DELETE',
    useServiceRole: true,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || error.msg || 'Delete user failed');
  }

  return { success: true };
}

/**
 * Check Auth service health
 */
export async function checkHealth() {
  try {
    const startTime = Date.now();
    const response = await authRequest('/health');
    const latency = Date.now() - startTime;

    return {
      connected: response.ok,
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
