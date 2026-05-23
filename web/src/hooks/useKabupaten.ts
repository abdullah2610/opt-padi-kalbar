import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type { KabupatenSummary } from '@/lib/types';

export function useKabupatenList() {
  return useQuery({
    queryKey: ['kabupaten'],
    queryFn: () => apiGet<KabupatenSummary[]>('/api/kabupaten'),
    staleTime: 60 * 60 * 1000
  });
}

export function useKabupatenGeoJSON() {
  return useQuery({
    queryKey: ['kabupaten', 'geojson'],
    queryFn: () =>
      apiGet<GeoJSON.FeatureCollection>('/api/kabupaten?format=geojson'),
    staleTime: 60 * 60 * 1000
  });
}
