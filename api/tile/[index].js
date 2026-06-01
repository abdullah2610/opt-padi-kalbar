// Tile proxy — TiTiler when configured, else transparent PNG placeholder.

import { preflight } from '../_lib/response.js';

const TITILER = process.env.TITILER_BASE_URL?.replace(/\/$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');

const TRANSPARENT_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

const CROP_ENABLED = process.env.VITE_DISPLAY_CROPLAND_DEFAULT === 'true'
  || process.env.DISPLAY_CROPLAND_DEFAULT === 'true';

const BASE_RESCALE = {
  ndvi: '-0.2,0.9',
  ndwi: '-0.5,0.5',
  mndwi: '-0.5,0.8',
  ndmi: '-0.5,0.5',
  msi: '0.0,2.0',
  evi: '-0.2,0.9'
};
// _crop variants use same rescale
const RESCALE = {
  ...BASE_RESCALE,
  ...Object.fromEntries(Object.entries(BASE_RESCALE).map(([k, v]) => [`${k}_crop`, v])),
};

const BASE_COLORMAP = {
  ndvi: 'rdylgn',
  ndwi: 'brbg',
  mndwi: 'blues',
  ndmi: 'rdbu',
  msi: 'viridis',
  evi: 'rdylgn'
};
const COLORMAP = {
  ...BASE_COLORMAP,
  ...Object.fromEntries(Object.entries(BASE_COLORMAP).map(([k, v]) => [`${k}_crop`, v])),
};

function transparentPng() {
  const bin = atob(TRANSPARENT_PNG_B64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

export function OPTIONS() {
  return preflight();
}

export async function GET(request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const index = (pathParts[pathParts.length - 1] ?? 'ndvi').replace(/\.png$/i, '');
  const date = url.searchParams.get('date');
  const kabupaten = url.searchParams.get('kabupaten');
  const z = url.searchParams.get('z');
  const x = url.searchParams.get('x');
  const y = url.searchParams.get('y');

  if (!TITILER || !SUPABASE_URL || !date || !kabupaten || z == null || x == null || y == null) {
    return new Response(transparentPng(), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300',
        'X-Tile-Source': 'placeholder',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // When cropland display enabled, resolve to _crop COG; fall back to raw if _crop not yet available.
  // Frontend passes base index name (e.g. "ndvi"); tile API appends _crop suffix.
  const resolvedIndex = CROP_ENABLED && !index.endsWith('_crop') ? `${index}_crop` : index;
  const baseIndex = resolvedIndex.replace(/_crop$/, '');
  const rescale = RESCALE[resolvedIndex] ?? RESCALE[baseIndex] ?? RESCALE.ndvi;
  const colormap = COLORMAP[resolvedIndex] ?? COLORMAP[baseIndex] ?? COLORMAP.ndvi;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'composites';
  const cogUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/composites/${kabupaten}/${date}/${resolvedIndex}.tif`;
  const titilerUrl =
    `${TITILER}/cog/tiles/WebMercatorQuad/${z}/${x}/${y}.png` +
    `?url=${encodeURIComponent(cogUrl)}&rescale=${rescale}&colormap_name=${colormap}`;

  try {
    const res = await fetch(titilerUrl);
    if (!res.ok) {
      return new Response(transparentPng(), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'X-Tile-Source': 'titiler-error',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Tile-Source': 'titiler',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch {
    return new Response(transparentPng(), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'X-Tile-Source': 'titiler-unavailable',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
