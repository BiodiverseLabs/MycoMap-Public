import { useQuery } from "@tanstack/react-query";
import type { Observation } from "@shared/schema";

interface UseObservationsOptions {
  startDate?: string;
  endDate?: string;
  state?: string;
}

export function useObservations(options: UseObservationsOptions = {}) {
  const queryParams = new URLSearchParams();
  
  if (options.startDate) queryParams.set('startDate', options.startDate);
  if (options.endDate) queryParams.set('endDate', options.endDate);
  if (options.state) queryParams.set('state', options.state);

  const queryString = queryParams.toString();
  const url = `/api/observations${queryString ? `?${queryString}` : ''}`;

  return useQuery<Observation[]>({
    queryKey: [url],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useObservationMetrics() {
  return useQuery({
    queryKey: ["/api/metrics"],
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useTemporalTrends(groupBy: 'month' | 'quarter' | 'year' = 'month') {
  return useQuery({
    queryKey: ["/api/temporal-trends", { groupBy }],
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

export function useTaxonomicDistribution() {
  return useQuery({
    queryKey: ["/api/taxonomic-distribution"],
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}
