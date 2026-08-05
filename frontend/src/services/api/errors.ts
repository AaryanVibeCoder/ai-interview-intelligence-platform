type ApiErrorOptions = {
  body: unknown;
  status: number;
  statusText: string;
  url: string;
};

export class ApiError extends Error {
  body: unknown;
  status: number;
  statusText: string;
  url: string;

  constructor({ body, status, statusText, url }: ApiErrorOptions) {
    super(`Request failed with ${status} ${statusText}`);
    this.name = "ApiError";
    this.body = body;
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
}
