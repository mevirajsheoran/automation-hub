// src/catalogLoader.ts
// ─────────────────────────────────────────────────────────────────────
// Reads the automation catalog from the GitHub repository.
//
// What this file does:
//   - Fetches catalog.json from a configurable URL
//   - Parses the JSON
//   - Returns the list of automations
//   - Caches the result so we do not re-fetch on every action
//
// Why this matters:
//   - Both the sidebar and the chat participant need to know
//     what automations exist.
//   - The catalog is the single source of truth (per Document 3,
//     Principle P2: Single Source of Truth).
//   - The catalog is regenerated automatically by GitHub Actions
//     whenever a manifest.yaml changes.
// ─────────────────────────────────────────────────────────────────────

// Shape of a single automation in the catalog.
// This matches the manifest.yaml structure.
export interface Automation {
  identity: {
    name: string;
    display_name: string;
    description: string;
    version: string;
    owner: string;
    tags?: string[];
  };
  parameters: Array<{
    name: string;
    display_name?: string;
    description?: string;
    type: string;
    required: boolean;
    example?: string;
    default?: string;
    allowed_values?: string[];
  }>;
  execution: {
    workflow: string;
    estimated_duration?: string;
    async?: boolean;
    timeout?: string;
  };
  permissions?: {
    roles?: string[];
    requires_approval?: boolean;
  };
  outputs?: Array<{
    name: string;
    type: string;
    filename?: string;
    description?: string;
  }>;
  discovery?: {
    keywords?: string[];
    category?: string;
  };
}

// Shape of the full catalog file.
export interface Catalog {
  generated_at: string;
  version: string;
  total: number;
  automations: Automation[];
  errors: string[];
}

// In-memory cache so we do not fetch on every action.
let cachedCatalog: Catalog | null = null;
let cacheTime: number = 0;

// Cache is valid for 60 seconds.
// After that, we re-fetch.
const CACHE_TTL_MS = 60 * 1000;

// ─────────────────────────────────────────────────────────────────────
// Fetch the catalog from the configured URL.
// ─────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────
// Fetch the catalog from the configured URL.
// ─────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────
// Fetch the catalog from the configured URL.
// ─────────────────────────────────────────────────────────────────────
export async function loadCatalog(catalogUrl: string): Promise<Catalog> {

  // Log what we are about to do (helps with debugging)
  // console.log('[Automation Hub] Loading catalog from:', catalogUrl);

  // Check that the URL is not empty
  if (!catalogUrl || catalogUrl.trim().length === 0) {
    throw new Error(
      'Catalog URL is not configured.\n\n' +
      'Please set the "Automation Hub: Catalog URL" setting in VS Code.\n' +
      'Default value: https://raw.githubusercontent.com/mevirajsheoran/automation-hub/main/catalog.json'
    );
  }

  // Check cache first
  const now = Date.now();
  if (cachedCatalog && (now - cacheTime) < CACHE_TTL_MS) {
    // console.log('[Automation Hub] Using cached catalog');
    return cachedCatalog;
  }

  try {
    const response = await fetch(catalogUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    // console.log('[Automation Hub] Fetch response status:', response.status);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Catalog not found at ${catalogUrl}\n\n` +
          'Possible causes:\n' +
          '1. The repository does not exist or is private\n' +
          '2. catalog.json has not been generated yet\n' +
          '3. The URL is incorrect\n\n' +
          'Check that the workflow "generate-catalog.yml" has run successfully.'
        );
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const catalog = await response.json() as Catalog;
    // console.log('[Automation Hub] Catalog loaded. Automations:', catalog.automations?.length || 0);

    cachedCatalog = catalog;
    cacheTime = now;
    return catalog;

  } catch (err: any) {
    // If we have a stale cache, return it rather than failing
    if (cachedCatalog) {
      return cachedCatalog;
    }
    if (err.message && err.message.startsWith('Catalog')) {
      throw err;
    }
    throw new Error(
      `Failed to load catalog from: ${catalogUrl}\n\n` +
      `Error: ${err.message}\n\n` +
      'Check your internet connection and the catalog URL setting.'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Find a specific automation by name.
// ─────────────────────────────────────────────────────────────────────
export function findAutomation(
  catalog: Catalog,
  name: string
): Automation | null {
  return catalog.automations.find(a => a.identity.name === name) || null;
}

// ─────────────────────────────────────────────────────────────────────
// Invalidate the cache. Call this when the user clicks "Refresh".
// ─────────────────────────────────────────────────────────────────────
export function invalidateCatalogCache(): void {
  cachedCatalog = null;
  cacheTime = 0;
}