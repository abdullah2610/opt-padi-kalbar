FROM ghcr.io/developmentseed/titiler:latest
# Official image already CMD-s uvicorn on $PORT (default 8000).
# Override only env (default GDAL/COG behavior).
ENV PORT=8000 \
    GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR \
    CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.tif,.TIF,.tiff,.cog \
    GDAL_CACHEMAX=512
EXPOSE 8000
