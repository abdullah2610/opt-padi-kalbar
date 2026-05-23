import { createClient } from '@supabase/supabase-js';

let cachedAnon = null;
let cachedService = null;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function supabaseAnon() {
  if (cachedAnon) return cachedAnon;
  cachedAnon = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false }
  });
  return cachedAnon;
}

export function supabaseService() {
  if (cachedService) return cachedService;
  cachedService = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false }
  });
  return cachedService;
}
