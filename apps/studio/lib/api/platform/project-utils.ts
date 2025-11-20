import crypto from 'crypto'

/**
 * Generates a unique project reference (slug)
 * Similar to Supabase cloud project refs (e.g., "abcdefghijklmnop")
 * @param length Length of the ref (default 16)
 * @returns Lowercase alphanumeric string
 */
export function generateProjectRef(length: number = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.randomBytes(length)

  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length]
  }

  return result
}

/**
 * Generates a slug from a name
 * Converts to lowercase, replaces spaces with hyphens, removes special characters
 * @param name The name to convert to a slug
 * @returns Slugified string
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

/**
 * Validates a project reference format
 * Must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric
 * @param ref Project reference to validate
 * @returns true if valid, false otherwise
 */
export function isValidProjectRef(ref: string): boolean {
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(ref) && ref.length >= 2
}

/**
 * Validates database connection details
 * @param host Database host
 * @param port Database port
 * @param name Database name
 * @param user Database user
 * @param password Database password
 * @returns Object with isValid boolean and optional error message
 */
export function validateDatabaseConnection(
  host: string,
  port: number,
  name: string,
  user: string,
  password: string
): { isValid: boolean; error?: string } {
  if (!host || host.trim().length === 0) {
    return { isValid: false, error: 'Database host is required' }
  }

  if (port <= 0 || port >= 65536) {
    return { isValid: false, error: 'Database port must be between 1 and 65535' }
  }

  if (!name || name.trim().length === 0) {
    return { isValid: false, error: 'Database name is required' }
  }

  if (!user || user.trim().length === 0) {
    return { isValid: false, error: 'Database user is required' }
  }

  if (!password || password.trim().length === 0) {
    return { isValid: false, error: 'Database password is required' }
  }

  return { isValid: true }
}

/**
 * Validates a URL format
 * @param url URL to validate
 * @param required Whether the URL is required
 * @returns Object with isValid boolean and optional error message
 */
export function validateURL(url: string, required: boolean = true): { isValid: boolean; error?: string } {
  if (!url || url.trim().length === 0) {
    if (required) {
      return { isValid: false, error: 'URL is required' }
    }
    return { isValid: true }
  }

  try {
    const parsedUrl = new URL(url)
    if (!parsedUrl.protocol.startsWith('http')) {
      return { isValid: false, error: 'URL must use HTTP or HTTPS protocol' }
    }
    return { isValid: true }
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' }
  }
}
