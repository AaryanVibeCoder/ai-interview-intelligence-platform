const DEFAULT_DEVELOPMENT_API_URL = "http://127.0.0.1:8500";

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl);
  }

  return DEFAULT_DEVELOPMENT_API_URL;
}

export const apiConfig = {
  baseUrl: getApiBaseUrl(),
  timeoutMs: 15_000,
} as const;
