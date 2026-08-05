import { useQuery } from "@tanstack/react-query";

import { healthService } from "@/services";

export const healthQueryKeys = {
  all: ["health"] as const,
  status: () => [...healthQueryKeys.all, "status"] as const,
};

export function useHealthQuery() {
  return useQuery({
    queryFn: ({ signal }) => healthService.getStatus({ signal }),
    queryKey: healthQueryKeys.status(),
  });
}
