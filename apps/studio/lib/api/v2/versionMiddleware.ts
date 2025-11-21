import type { NextApiResponse } from 'next'
import type { ApiV2Request } from './types'

/**
 * Default API version (YYYY-MM-DD format)
 */
export const DEFAULT_API_VERSION = '2025-11-20'

/**
 * Supported API versions
 */
export const SUPPORTED_API_VERSIONS = [
  '2025-11-20', // Initial v2 release
] as const

export type SupportedVersion = (typeof SUPPORTED_API_VERSIONS)[number]

/**
 * API versioning middleware
 *
 * Extracts the API version from request headers and validates it.
 * Sets the version on the request object and response headers.
 *
 * Version can be specified via:
 * - API-Version header (preferred)
 * - X-API-Version header (alternative)
 *
 * If no version is specified, defaults to DEFAULT_API_VERSION
 *
 * @example
 * curl -H "API-Version: 2025-11-20" https://api.supabase.com/v2/projects
 */
export function apiVersionMiddleware(
  req: ApiV2Request,
  res: NextApiResponse,
  next: () => void
): void {
  // Extract version from headers (case-insensitive)
  const headerVersion =
    req.headers['api-version'] || req.headers['x-api-version'] || DEFAULT_API_VERSION

  // Normalize to string
  const version = Array.isArray(headerVersion) ? headerVersion[0] : headerVersion

  // Validate version format (YYYY-MM-DD)
  if (!isValidVersionFormat(version)) {
    res.status(400).json({
      type: 'https://api.supabase.com/errors/invalid-version',
      title: 'Invalid API Version',
      status: 400,
      detail: `API version must be in YYYY-MM-DD format. Received: ${version}`,
      errorCode: 'INVALID_API_VERSION',
    })
    return
  }

  // Check if version is supported
  if (!isSupportedVersion(version)) {
    res.status(400).json({
      type: 'https://api.supabase.com/errors/unsupported-version',
      title: 'Unsupported API Version',
      status: 400,
      detail: `API version ${version} is not supported. Supported versions: ${SUPPORTED_API_VERSIONS.join(', ')}`,
      errorCode: 'UNSUPPORTED_API_VERSION',
    })
    return
  }

  // Set version on request object
  req.apiVersion = version

  // Set version in response headers
  res.setHeader('API-Version', version)
  res.setHeader('X-API-Version', version)

  // Also set Sunset header if version is deprecated
  if (isDeprecatedVersion(version)) {
    const sunsetDate = getSunsetDate(version)
    if (sunsetDate) {
      res.setHeader('Sunset', sunsetDate)
      res.setHeader('Link', '<https://docs.supabase.com/api/versioning>; rel="deprecation"')
    }
  }

  next()
}

/**
 * Validates that the version string is in YYYY-MM-DD format
 */
function isValidVersionFormat(version: string): boolean {
  const versionRegex = /^\d{4}-\d{2}-\d{2}$/
  return versionRegex.test(version)
}

/**
 * Checks if the version is in the supported versions list
 */
function isSupportedVersion(version: string): boolean {
  return (SUPPORTED_API_VERSIONS as readonly string[]).includes(version)
}

/**
 * Checks if the version is deprecated
 */
function isDeprecatedVersion(version: string): boolean {
  // For now, no versions are deprecated
  // This will be updated as new versions are released
  const deprecatedVersions: string[] = []
  return deprecatedVersions.includes(version)
}

/**
 * Gets the sunset date for a deprecated version
 */
function getSunsetDate(version: string): string | null {
  // Sunset dates for deprecated versions
  const sunsetDates: Record<string, string> = {
    // Example: '2025-11-20': '2026-11-20'
  }
  return sunsetDates[version] || null
}

/**
 * Gets the current API version from the request
 */
export function getApiVersion(req: ApiV2Request): string {
  return req.apiVersion || DEFAULT_API_VERSION
}

/**
 * Type guard to check if a version is supported
 */
export function assertSupportedVersion(version: string): asserts version is SupportedVersion {
  if (!isSupportedVersion(version)) {
    throw new Error(`Unsupported API version: ${version}`)
  }
}
