import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useKabupatenGeoJSON } from '@/hooks/useKabupaten';
import { useMapStore } from '@/store/mapStore';

const OSM_STYLE = {
  version: 8 as const,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19
    }
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }]
};

const KALBAR_BOUNDS: [[number, number], [number, number]] = [
  [108.0, -3.1],
  [114.5, 2.6]
];

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const { data: fc } = useKabupatenGeoJSON();
  const { selectedKabupatenId, activeIndex, compositeDate, setSelectedKabupaten } = useMapStore();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      bounds: KALBAR_BOUNDS,
      fitBoundsOptions: { padding: 40 }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Add kabupaten layers + tile overlay once map + data ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fc) return;

    const setup = () => {
      if (!map.getSource('kabupaten')) {
        map.addSource('kabupaten', { type: 'geojson', data: fc });
      } else {
        (map.getSource('kabupaten') as maplibregl.GeoJSONSource).setData(fc);
      }

      if (!map.getLayer('kabupaten-fill')) {
        map.addLayer({
          id: 'kabupaten-fill',
          type: 'fill',
          source: 'kabupaten',
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'id'], ['literal', selectedKabupatenId ?? '___none___']],
              '#22c55e',
              '#14532d'
            ],
            'fill-opacity': 0.25
          }
        });
      }

      if (!map.getLayer('kabupaten-outline')) {
        map.addLayer({
          id: 'kabupaten-outline',
          type: 'line',
          source: 'kabupaten',
          paint: {
            'line-color': '#4ade80',
            'line-width': [
              'case',
              ['==', ['get', 'id'], ['literal', selectedKabupatenId ?? '___none___']],
              3,
              1
            ],
            'line-opacity': 0.9
          }
        });
      }

      if (!map.getLayer('kabupaten-labels')) {
        map.addLayer({
          id: 'kabupaten-labels',
          type: 'symbol',
          source: 'kabupaten',
          layout: {
            'text-field': ['get', 'nama'],
            'text-size': 11,
            'text-anchor': 'center'
          },
          paint: {
            'text-color': '#f0fdf4',
            'text-halo-color': '#0f172a',
            'text-halo-width': 1.5
          }
        });
      }

      map.on('click', 'kabupaten-fill', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties?.id as string;
        setSelectedKabupaten(id);
      });
      map.on('mouseenter', 'kabupaten-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'kabupaten-fill', () => {
        map.getCanvas().style.cursor = '';
      });
    };

    if (map.loaded()) setup();
    else map.once('load', setup);
  }, [fc, selectedKabupatenId, setSelectedKabupaten]);

  // Update selection highlight
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getLayer('kabupaten-fill')) return;
    map.setPaintProperty('kabupaten-fill', 'fill-color', [
      'case',
      ['==', ['get', 'id'], ['literal', selectedKabupatenId ?? '___none___']],
      '#22c55e',
      '#14532d'
    ]);
    map.setPaintProperty('kabupaten-outline', 'line-width', [
      'case',
      ['==', ['get', 'id'], ['literal', selectedKabupatenId ?? '___none___']],
      3,
      1
    ]);
  }, [selectedKabupatenId]);

  // Tile overlay layer (NDVI / NDWI / ...)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !compositeDate) return;

    const setup = () => {
      const sourceId = 'sentinel-tiles';
      const kab = selectedKabupatenId ?? 'pontianak';
      const tileUrl = `/api/tile/${activeIndex}?kabupaten=${kab}&date=${compositeDate}&z={z}&x={x}&y={y}`;

      if (map.getSource(sourceId)) {
        map.removeLayer('sentinel-overlay');
        map.removeSource(sourceId);
      }
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        minzoom: 5,
        maxzoom: 14
      });
      map.addLayer(
        {
          id: 'sentinel-overlay',
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': 0.75 }
        },
        'kabupaten-labels'
      );
    };

    if (map.loaded()) setup();
    else map.once('load', setup);
  }, [activeIndex, compositeDate, selectedKabupatenId]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
