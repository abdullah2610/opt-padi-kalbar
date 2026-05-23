const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${path}`);
  }
  const envelope = (await res.json()) as ApiEnvelope<T>;
  if (!envelope.success || envelope.data === undefined) {
    throw new Error(envelope.error ?? 'Unknown API error');
  }
  return envelope.data;
}
