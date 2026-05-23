import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type {
  IndexName, IndexPoint, Alert, YieldEstimate, LandcoverClass, DiseaseRisk, CompositeMeta
} from '@/lib/types';

export function useIndicesSeries(kabupatenId: string | null, index: IndexName, from?: string, to?: string) {
  return useQuery({
    queryKey: ['indices', kabupatenId, index, from, to],
    queryFn: () => {
      const qs = new URLSearchParams({ kabupaten: kabupatenId!, index });
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      return apiGet<IndexPoint[]>(`/api/indices?${qs}`);
    },
    enabled: !!kabupatenId,
    staleTime: 10 * 60 * 1000
  });
}

export function useAlerts(kabupatenId?: string | null) {
  return useQuery({
    queryKey: ['alerts', kabupatenId ?? 'all'],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (kabupatenId) qs.set('kabupaten', kabupatenId);
      return apiGet<Alert[]>(`/api/alerts?${qs}`);
    },
    staleTime: 2 * 60 * 1000
  });
}

export function useYield(kabupatenId: string | null, season?: string) {
  return useQuery({
    queryKey: ['yield', kabupatenId, season],
    queryFn: () => {
      const qs = new URLSearchParams({ kabupaten: kabupatenId! });
      if (season) qs.set('season', season);
      return apiGet<YieldEstimate>(`/api/yield?${qs}`);
    },
    enabled: !!kabupatenId,
    staleTime: 10 * 60 * 1000
  });
}

export function useLandcover(kabupatenId: string | null, date?: string) {
  return useQuery({
    queryKey: ['landcover', kabupatenId, date],
    queryFn: () => {
      const qs = new URLSearchParams({ kabupaten: kabupatenId! });
      if (date) qs.set('date', date);
      return apiGet<LandcoverClass[]>(`/api/landcover?${qs}`);
    },
    enabled: !!kabupatenId,
    staleTime: 30 * 60 * 1000
  });
}

export function useDiseaseRisk(kabupatenId: string | null) {
  return useQuery({
    queryKey: ['disease-risk', kabupatenId],
    queryFn: () => apiGet<DiseaseRisk>(`/api/disease-risk?kabupaten=${kabupatenId}`),
    enabled: !!kabupatenId,
    staleTime: 5 * 60 * 1000
  });
}

export function useCompositeMeta(kabupatenId: string | null) {
  return useQuery({
    queryKey: ['composite-meta', kabupatenId],
    queryFn: () => apiGet<CompositeMeta[]>(`/api/composite-meta?kabupaten=${kabupatenId}`),
    enabled: !!kabupatenId,
    staleTime: 5 * 60 * 1000
  });
}
