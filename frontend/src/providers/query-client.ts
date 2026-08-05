import { QueryClient } from "@tanstack/react-query";

const ONE_MINUTE = 60_000;

function isNonRetryableClientError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
  );
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 10 * ONE_MINUTE,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isNonRetryableClientError(error)) {
            return false;
          }

          return failureCount < 3;
        },
        staleTime: ONE_MINUTE,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
