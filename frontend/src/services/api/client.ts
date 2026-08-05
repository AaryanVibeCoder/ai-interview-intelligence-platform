import { apiConfig } from "@/services/api/config";
import { ApiError } from "@/services/api/errors";
import type {
  ApiClientOptions,
  ApiQueryParams,
  ApiQueryValue,
  ApiRequestOptions,
} from "@/services/api/types";

type RequestOptions<TBody = unknown> = Omit<
  ApiRequestOptions<TBody>,
  "method"
>;

const JSON_CONTENT_TYPE = "application/json";

function appendQueryParam(
  searchParams: URLSearchParams,
  key: string,
  value: ApiQueryValue,
) {
  if (value === null || value === undefined) {
    return;
  }

  searchParams.append(key, String(value));
}

function buildUrl(baseUrl: string, path: string, query?: ApiQueryParams) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`, window.location.origin);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => appendQueryParam(url.searchParams, key, item));
        return;
      }

      appendQueryParam(url.searchParams, key, value as ApiQueryValue);
    });
  }

  return url.toString();
}

function isJsonBody(body: unknown) {
  return (
    typeof body === "object" &&
    body !== null &&
    !(body instanceof Blob) &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams)
  );
}

async function parseResponse(response: Response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type");

  if (contentType?.includes(JSON_CONTENT_TYPE)) {
    return response.json();
  }

  return response.text();
}

function createAbortSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    try {
      controller.abort(new DOMException("The request timed out.", "TimeoutError"));
    } catch (e) {
      controller.abort();
    }
  }, timeoutMs);

  if (signal) {
    signal.addEventListener("abort", () => {
      try {
        controller.abort(signal.reason || new DOMException("The user aborted a request.", "AbortError"));
      } catch (e) {
        controller.abort();
      }
    }, { once: true });
  }

  return {
    cleanup: () => window.clearTimeout(timeoutId),
    signal: controller.signal,
  };
}

export class ApiClient {
  private baseUrl: string;
  private credentials: RequestCredentials | undefined;
  private defaultHeaders: HeadersInit;
  private timeoutMs: number;

  constructor({
    baseUrl,
    credentials,
    defaultHeaders,
    timeoutMs = 15_000,
  }: ApiClientOptions) {
    this.baseUrl = baseUrl;
    this.credentials = credentials;
    this.defaultHeaders = defaultHeaders ?? {};
    this.timeoutMs = timeoutMs;
  }

  async request<TResponse, TBody = unknown>({
    body,
    cache,
    credentials,
    headers,
    method = "GET",
    path,
    query,
    signal,
  }: ApiRequestOptions<TBody> & { path: string }): Promise<TResponse> {
    const url = buildUrl(this.baseUrl, path, query);
    const abort = createAbortSignal(signal, this.timeoutMs);
    const requestHeaders = new Headers(this.defaultHeaders);

    if (headers) {
      new Headers(headers).forEach((value, key) => requestHeaders.set(key, value));
    }

    let requestBody: BodyInit | undefined;

    if (body !== undefined) {
      if (isJsonBody(body)) {
        requestHeaders.set("content-type", JSON_CONTENT_TYPE);
        requestBody = JSON.stringify(body);
      } else {
        requestBody = body as BodyInit;
      }
    }

    try {
      const response = await fetch(url, {
        body: requestBody,
        cache,
        credentials: credentials ?? this.credentials,
        headers: requestHeaders,
        method,
        signal: abort.signal,
      });
      const responseBody = await parseResponse(response);

      if (!response.ok) {
        throw new ApiError({
          body: responseBody,
          status: response.status,
          statusText: response.statusText,
          url,
        });
      }

      return responseBody as TResponse;
    } finally {
      abort.cleanup();
    }
  }

  delete<TResponse>(path: string, options?: RequestOptions) {
    return this.request<TResponse>({ ...options, method: "DELETE", path });
  }

  get<TResponse>(path: string, options?: RequestOptions) {
    return this.request<TResponse>({ ...options, method: "GET", path });
  }

  patch<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: RequestOptions<TBody>,
  ) {
    return this.request<TResponse, TBody>({
      ...options,
      body,
      method: "PATCH",
      path,
    });
  }

  post<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: RequestOptions<TBody>,
  ) {
    return this.request<TResponse, TBody>({
      ...options,
      body,
      method: "POST",
      path,
    });
  }

  put<TResponse, TBody = unknown>(
    path: string,
    body?: TBody,
    options?: RequestOptions<TBody>,
  ) {
    return this.request<TResponse, TBody>({
      ...options,
      body,
      method: "PUT",
      path,
    });
  }
}

export const apiClient = new ApiClient(apiConfig);
