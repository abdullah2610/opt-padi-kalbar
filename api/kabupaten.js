import { ok, fail, preflight, getQuery } from './_lib/response.js';
import { listKabupatenSummary, getKabupaten, getGeoJSONFeatureCollection } from './_lib/kabupaten.js';

export function OPTIONS() {
  return preflight();
}

export function GET(request) {
  try {
    const { id, format } = getQuery(request);

    if (id) {
      const kab = getKabupaten(id);
      if (!kab) return fail(404, `kabupaten not found: ${id}`);
      return ok(kab);
    }

    if (format === 'geojson') {
      const fc = getGeoJSONFeatureCollection();
      return ok(fc, {
        meta: { count: fc.features.length },
        headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' }
      });
    }

    const list = listKabupatenSummary();
    return ok(list, {
      meta: { total: list.length },
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' }
    });
  } catch (err) {
    return fail(500, err);
  }
}
