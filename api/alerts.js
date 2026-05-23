import { ok, fail, preflight, getQuery } from './_lib/response.js';
import { listKabupatenSummary, getKabupaten } from './_lib/kabupaten.js';
import { dummyAlerts } from './_lib/dummy.js';
import { hasSupabase, fetchAlerts } from './_lib/data.js';
import { kabupatenIdSchema, alertTypeSchema, alertSeveritySchema } from './_lib/validate.js';

export function OPTIONS() {
  return preflight();
}

export async function GET(request) {
  try {
    const q = getQuery(request);
    let alerts;
    let source = 'dummy';

    if (hasSupabase()) {
      try {
        const kabId = q.kabupaten ? kabupatenIdSchema.parse(q.kabupaten) : undefined;
        if (kabId) {
          const kab = getKabupaten(kabId);
          if (!kab) return fail(404, `kabupaten not found: ${kabId}`);
        }
        const type = q.type ? alertTypeSchema.parse(q.type) : undefined;
        const severity = q.severity ? alertSeveritySchema.parse(q.severity) : undefined;
        const rows = await fetchAlerts({ kabupatenId: kabId, type, severity });
        if (rows.length > 0 || kabId) {
          alerts = rows;
          source = 'postgres';
        }
      } catch (err) {
        console.error('alerts supabase:', err);
      }
    }

    if (!alerts) {
      if (q.kabupaten) {
        const id = kabupatenIdSchema.parse(q.kabupaten);
        const kab = getKabupaten(id);
        if (!kab) return fail(404, `kabupaten not found: ${id}`);
        alerts = dummyAlerts(id);
      } else {
        alerts = listKabupatenSummary().flatMap((k) => dummyAlerts(k.id));
      }
      if (q.type) {
        const t = alertTypeSchema.parse(q.type);
        alerts = alerts.filter((a) => a.type === t);
      }
      if (q.severity) {
        const s = alertSeveritySchema.parse(q.severity);
        alerts = alerts.filter((a) => a.severity === s);
      }
    }

    alerts.sort((a, b) => b.started_at.localeCompare(a.started_at));
    return ok(alerts, {
      meta: { count: alerts.length, source },
      headers: { 'Cache-Control': 'public, max-age=120, s-maxage=600' }
    });
  } catch (err) {
    return fail(400, err);
  }
}
