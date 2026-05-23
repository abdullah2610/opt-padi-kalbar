import { ok, fail, preflight, getQuery } from './_lib/response.js';
import { getKabupaten } from './_lib/kabupaten.js';
import { dummyIndicesSeries } from './_lib/dummy.js';
import { hasSupabase, fetchIndicesSeries } from './_lib/data.js';
import { indexNameSchema, kabupatenIdSchema, isoDateSchema } from './_lib/validate.js';

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 180);
  return d.toISOString().slice(0, 10);
}

export function OPTIONS() {
  return preflight();
}

export async function GET(request) {
  try {
    const q = getQuery(request);
    const kabupatenId = kabupatenIdSchema.parse(q.kabupaten);
    const indexName = indexNameSchema.parse(q.index ?? 'ndvi');
    const from = isoDateSchema.parse(q.from ?? defaultFrom());
    const to = isoDateSchema.parse(q.to ?? new Date().toISOString().slice(0, 10));

    const kab = getKabupaten(kabupatenId);
    if (!kab) return fail(404, `kabupaten not found: ${kabupatenId}`);

    let series;
    let source = 'dummy';

    if (hasSupabase()) {
      try {
        const rows = await fetchIndicesSeries(kabupatenId, indexName, from, to);
        if (rows.length > 0) {
          series = rows;
          source = 'sentinel';
        }
      } catch (err) {
        console.error('indices supabase:', err);
      }
    }

    if (!series) {
      series = dummyIndicesSeries(kabupatenId, indexName, from, to);
    }

    return ok(series, {
      meta: { kabupaten: kab.nama, index: indexName, from, to, count: series.length, source },
      headers: { 'Cache-Control': 'public, max-age=600, s-maxage=3600' }
    });
  } catch (err) {
    return fail(400, err);
  }
}
