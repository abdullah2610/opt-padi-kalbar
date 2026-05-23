import { ok, fail, preflight, getQuery } from './_lib/response.js';
import { getKabupaten } from './_lib/kabupaten.js';
import { dummyYield } from './_lib/dummy.js';
import { hasSupabase, fetchYieldEstimate } from './_lib/data.js';
import { kabupatenIdSchema } from './_lib/validate.js';

const SEASON_RE = /^\d{4}-MT[12]$/;

function defaultSeason() {
  const d = new Date();
  return `${d.getFullYear()}-MT${d.getMonth() < 6 ? 1 : 2}`;
}

export function OPTIONS() {
  return preflight();
}

export async function GET(request) {
  try {
    const q = getQuery(request);
    const id = kabupatenIdSchema.parse(q.kabupaten);
    const season = q.season ?? defaultSeason();
    if (!SEASON_RE.test(season)) return fail(400, 'season format: YYYY-MT1 | YYYY-MT2');

    const kab = getKabupaten(id);
    if (!kab) return fail(404, `kabupaten not found: ${id}`);

    let estimate;
    let source = 'dummy';

    if (hasSupabase()) {
      try {
        const row = await fetchYieldEstimate(id, season);
        if (row) {
          estimate = {
            kabupaten_id: row.kabupaten_id,
            season: row.season,
            ton_estimated: row.ton_estimated,
            ton_per_ha: row.ton_per_ha,
            area_sawah_ha: row.area_sawah_ha,
            model_version: row.model_version,
            confidence: row.confidence,
            features_used: row.features_used,
            computed_at: row.computed_at
          };
          source = 'linreg-v0';
        }
      } catch (err) {
        console.error('yield supabase:', err);
      }
    }

    if (!estimate) {
      estimate = dummyYield(id, season);
    }

    return ok(estimate, {
      meta: { kabupaten: kab.nama, source },
      headers: { 'Cache-Control': 'public, max-age=600, s-maxage=3600' }
    });
  } catch (err) {
    return fail(400, err);
  }
}
