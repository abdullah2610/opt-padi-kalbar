import { ok, fail, preflight, getQuery } from './_lib/response.js';
import { getKabupaten } from './_lib/kabupaten.js';
import { hasSupabase, fetchCompositeMeta } from './_lib/data.js';
import { kabupatenIdSchema } from './_lib/validate.js';

function dummyComposites(id) {
  const today = new Date();
  const out = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 10);
    const dateIso = d.toISOString().slice(0, 10);
    out.push({
      period_start: new Date(d.getTime() - 9 * 86400000).toISOString().slice(0, 10),
      period_end: dateIso,
      scl_clear_pct: +(40 + Math.random() * 50).toFixed(1),
      cog_paths: {
        ndvi: `composites/${id}/${dateIso}/ndvi.tif`,
        ndwi: `composites/${id}/${dateIso}/ndwi.tif`,
        mndwi: `composites/${id}/${dateIso}/mndwi.tif`,
        ndmi: `composites/${id}/${dateIso}/ndmi.tif`
      },
      status: 'completed'
    });
  }
  return out;
}

export function OPTIONS() {
  return preflight();
}

const CROP_ENABLED = process.env.VITE_DISPLAY_CROPLAND_DEFAULT === 'true'
  || process.env.DISPLAY_CROPLAND_DEFAULT === 'true';

const BASE_INDICES = ['ndvi', 'ndwi', 'mndwi', 'ndmi', 'msi', 'evi'];

function resolveCogPaths(row) {
  if (!CROP_ENABLED || !row.cog_paths) return row.cog_paths;
  // Prefer _crop paths when available; fall back to raw
  const resolved = {};
  for (const idx of BASE_INDICES) {
    resolved[idx] = row.cog_paths[`${idx}_crop`] ?? row.cog_paths[idx];
  }
  return resolved;
}

export async function GET(request) {
  try {
    const q = getQuery(request);
    const id = kabupatenIdSchema.parse(q.kabupaten);
    const kab = getKabupaten(id);
    if (!kab) return fail(404, `kabupaten not found: ${id}`);

    let out;
    let source = 'dummy';

    if (hasSupabase()) {
      try {
        const rows = await fetchCompositeMeta(id);
        if (rows.length > 0) {
          out = rows.map((row) => ({
            ...row,
            cog_paths: resolveCogPaths(row),
            cropland_area_ha: row.cropland_area_ha ?? null,
          }));
          source = 'sentinel';
        }
      } catch (err) {
        console.error('composite-meta supabase:', err);
      }
    }

    if (!out) {
      out = dummyComposites(id);
    }

    return ok(out, {
      meta: { kabupaten: kab.nama, count: out.length, source, cropland: CROP_ENABLED },
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' }
    });
  } catch (err) {
    return fail(400, err);
  }
}
