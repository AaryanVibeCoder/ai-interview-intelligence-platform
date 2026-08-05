import { apiClient } from "@/services/api";

export type HealthResponse = {
  message: string;
};

export const healthService = {
  getStatus: (options?: { signal?: AbortSignal }) =>
    apiClient.get<HealthResponse>("/", options),
};
