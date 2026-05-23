import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
                name: 'Opt Padi Kalbar',
                short_name: 'PadiKalbar',
                description: 'Pemantauan kesehatan padi Kalimantan Barat dgn Sentinel-2',
                theme_color: '#15803d',
                background_color: '#0f172a',
                display: 'standalone',
                orientation: 'portrait',
                scope: '/',
                start_url: '/',
                icons: [
                    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                    { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
                runtimeCaching: [
                    {
                        urlPattern: ({ url }) => url.pathname.startsWith('/api/tile/'),
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'tile-cache',
                            expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
                            cacheableResponse: { statuses: [0, 200] }
                        }
                    },
                    {
                        urlPattern: ({ url }) => url.pathname.startsWith('/api/kabupaten'),
                        handler: 'StaleWhileRevalidate',
                        options: { cacheName: 'kabupaten-cache' }
                    },
                    {
                        urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'api-cache',
                            networkTimeoutSeconds: 5,
                            expiration: { maxAgeSeconds: 60 * 5 }
                        }
                    }
                ]
            }
        })
    ],
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') }
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: process.env.VITE_API_PROXY ?? 'http://localhost:3000',
                changeOrigin: true
            }
        }
    },
    build: {
        target: 'es2022',
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    maplibre: ['maplibre-gl'],
                    chart: ['chart.js', 'react-chartjs-2'],
                    react: ['react', 'react-dom', 'react-router-dom']
                }
            }
        }
    }
});
