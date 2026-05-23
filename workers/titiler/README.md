# TiTiler — COG tile server

Deploy ke Fly.io untuk render COG dari Supabase Storage sebagai XYZ PNG.

```bash
cd workers/titiler
fly launch --no-deploy
fly secrets set AWS_NO_SIGN_REQUEST=YES
fly deploy
# URL: https://opt-padi-titiler.fly.dev
```

Set `TITILER_BASE_URL` di Vercel env ke URL deploy.
