import { ok, fail, preflight, getQuery } from './_lib/response.js';
import { getKabupaten } from './_lib/kabupaten.js';
import { dummyLandcover } from './_lib/dummy.js';
import { hasSupabase, fetchLandcover } from './_lib/data.js';
import { kabupatenIdSchema, isoDateSchema } from './_lib/validate.js';

export function OPTIONS() {
  return preflight();
}

export async function GET(request) {
  try {
    const q = getQuery(request);
    const id = kabupatenIdSchema.parse(q.kabupaten);
    const date = isoDateSchema.parse(q.date ?? new Date().toISOString().slice(0, 10));

    const kab = getKabupaten(id);
    if (!kab) return fail(404, `kabupaten not found: ${id}`);

    let classes;
    let source = 'dummy_esa_worldcover';

    if (hasSupabase()) {
      try {
        const rows = await fetchLandcover(id, date);
        if (rows.length > 0) {
          classes = rows.map((r) => ({
            class_code: r.class_code,
            class_name: r.class_name,
            area_ha: r.area_ha,
            area_pct: r.area_pct
          }));
          source = rows[0]?.source ?? 'esa_worldcover';
        }
      } catch (err) {
        console.error('landcover supabase:', err);
      }
    }

    if (!classes) {
      classes = dummyLandcover(id, date);
    }

    return ok(classes, {
      meta: { kabupaten: kab.nama, observation_date: date, source },
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' }
    });
  } catch (err) {
    return fail(400, err);
  }
}
