const DEFAULT_DEVELOPMENT_API_URL = "http://127.0.0.1:8000";

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl);
  }

  if (process.env.NODE_ENV === "development") {
    return DEFAULT_DEVELOPMENT_API_URL;
  }

  return "";
}

export const apiConfig = {
  baseUrl: getApiBaseUrl(),
  timeoutMs: 15_000,
} as const;
