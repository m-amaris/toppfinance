/**
 * API Versioning utilities.
 * Provides version negotiation, deprecation headers, and version management.
 */

export interface ApiVersionConfig {
  /** Current API version (e.g., 'v1') */
  current: string
  /** Supported versions in order of preference (newest first) */
  supported: string[]
  /** Deprecated versions with sunset dates */
  deprecated: Record<string, { sunsetDate: string; alternative: string }>
  /** Default version when none specified */
  default: string
  /** Header name for version negotiation */
  headerName: string
}

/**
 * Default API version configuration.
 * Update when adding new versions.
 */
export const API_VERSION_CONFIG: ApiVersionConfig = {
  current: 'v1',
  supported: ['v1'],
  deprecated: {},
  default: 'v1',
  headerName: 'Accept-Version',
}

/**
 * API version prefix for routes.
 */
export const API_VERSION_PREFIX = '/api'

/**
 * Extracts the version from the API prefix.
 * @param prefix - API prefix (e.g., '/api/v1')
 * @returns Version string (e.g., 'v1')
 */
export function getVersionFromPrefix(prefix: string): string {
  const match = prefix.match(/\/v(\d+)$/)
  return match ? `v${match[1]}` : API_VERSION_CONFIG.default
}

/**
 * Normalizes a version string to standard format.
 * @param version - Version string (e.g., 'v1', '1', 'V1')
 * @returns Normalized version (e.g., 'v1')
 */
export function normalizeVersion(version: string): string {
  const trimmed = version.trim().toLowerCase()
  if (!trimmed.startsWith('v')) return `v${trimmed}`
  return trimmed
}

/**
 * Checks if a version is supported.
 * @param version - Version to check
 * @param config - Version configuration
 * @returns True if version is supported
 */
export function isVersionSupported(version: string, config: ApiVersionConfig = API_VERSION_CONFIG): boolean {
  return config.supported.includes(normalizeVersion(version))
}

/**
 * Gets the best matching version based on client preference.
 * @param requestedVersion - Version requested by client (from header)
 * @param config - Version configuration
 * @returns Best matching supported version, or null if none match
 */
export function negotiateVersion(
  requestedVersion: string | undefined,
  config: ApiVersionConfig = API_VERSION_CONFIG
): string {
  if (!requestedVersion) return config.default

  const normalized = normalizeVersion(requestedVersion)

  // Exact match
  if (config.supported.includes(normalized)) return normalized

  // Try prefix match (e.g., 'v1.2' matches 'v1')
  for (const supported of config.supported) {
    if (normalized.startsWith(supported)) return supported
  }

  return config.default
}

/**
 * Gets deprecation info for a version.
 * @param version - Version to check
 * @param config - Version configuration
 * @returns Deprecation info or null if not deprecated
 */
export function getDeprecationInfo(
  version: string,
  config: ApiVersionConfig = API_VERSION_CONFIG
): { sunsetDate: string; alternative: string } | null {
  const normalized = normalizeVersion(version)
  return config.deprecated[normalized] ?? null
}

/**
 * Adds API version headers to the response.
 * @param reply - Fastify reply object
 * @param config - Version configuration
 * @param requestedVersion - Version requested by client (optional)
 */
export function setVersionHeaders(
  reply: { header: (name: string, value: string) => void },
  config: ApiVersionConfig = API_VERSION_CONFIG,
  requestedVersion?: string
): void {
  const currentVersion = config.current
  const negotiatedVersion = negotiateVersion(requestedVersion, config)

  // Standard API version header
  reply.header('X-API-Version', currentVersion)

  // Deprecation warning if applicable
  const deprecationInfo = getDeprecationInfo(negotiatedVersion, config)
  if (deprecationInfo) {
    reply.header('Deprecation', 'true')
    reply.header('Sunset', deprecationInfo.sunsetDate)
    reply.header('Link', `<${API_VERSION_PREFIX}/${deprecationInfo.alternative}>; rel="successor-version"`)
  }

  // Supported versions
  reply.header('X-API-Supported-Versions', config.supported.join(', '))
}

/**
 * Fastify hook for API version negotiation.
 * Adds version to request and sets response headers.
 * @param config - Version configuration
 * @returns Fastify preHandler hook
 */
export function createVersionNegotiationHook(config: ApiVersionConfig = API_VERSION_CONFIG) {
  return async function versionNegotiationHook(
    request: { headers: Record<string, string | string[] | undefined>; apiVersion?: string },
    reply: { header: (name: string, value: string) => void }
  ): Promise<void> {
    // Get version from header
    const headerValue = request.headers[config.headerName.toLowerCase()]
    const requestedVersion = Array.isArray(headerValue) ? headerValue[0] : headerValue

    // Negotiate version
    const negotiatedVersion = negotiateVersion(requestedVersion, config)

    // Attach version to request for route handlers
    request.apiVersion = negotiatedVersion

    // Set response headers
    setVersionHeaders(reply, config, negotiatedVersion)

    // Warn if requested version is deprecated
    if (requestedVersion) {
      const deprecationInfo = getDeprecationInfo(requestedVersion, config)
      if (deprecationInfo) {
        reply.header('Warning', `299 - "API version ${normalizeVersion(requestedVersion)} is deprecated. Use ${deprecationInfo.alternative} instead. Sunset: ${deprecationInfo.sunsetDate}"`)
      }
    }
  }
}

/**
 * Creates versioned route prefix.
 * @param version - API version (e.g., 'v1')
 * @returns Versioned prefix (e.g., '/api/v1')
 */
export function createVersionedPrefix(version: string): string {
  return `${API_VERSION_PREFIX}/${normalizeVersion(version)}`
}

/**
 * Current versioned API prefix.
 */
export const API_PREFIX = createVersionedPrefix(API_VERSION_CONFIG.current)