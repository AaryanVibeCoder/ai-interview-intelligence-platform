export type ApiQueryValue = boolean | number | string | null | undefined;

export type ApiQueryParams = Record<
  string,
  ApiQueryValue | readonly ApiQueryValue[]
>;

export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export type ApiRequestOptions<TBody = unknown> = {
  body?: TBody;
  cache?: RequestCache;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  method?: HttpMethod;
  query?: ApiQueryParams;
  signal?: AbortSignal;
};

export type ApiClientOptions = {
  baseUrl: string;
  credentials?: RequestCredentials;
  defaultHeaders?: HeadersInit;
  timeoutMs?: number;
};
