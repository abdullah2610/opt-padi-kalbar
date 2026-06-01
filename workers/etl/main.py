"""CLI entrypoint untuk Sentinel-2 ETL."""

from __future__ import annotations

import logging
import os
import sys
import tempfile
import time
from datetime import date, timedelta
from pathlib import Path

import click
from dotenv import load_dotenv
# tenacity removed — see _run_composite comment

load_dotenv(Path(__file__).parent / ".env")
load_dotenv(Path(__file__).parents[2] / ".env")
load_dotenv(Path(__file__).parents[2] / ".env.local")

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
)
log = logging.getLogger("etl")

MIN_CLEAR_PCT = float(os.getenv("ETL_MIN_CLEAR_PCT", "30"))
JOB_POLL_SEC = int(os.getenv("ETL_JOB_POLL_SEC", "20"))


def _parse_period(period: str) -> tuple[str, str]:
    if period == "last-10d":
        end = date.today()
        start = end - timedelta(days=9)
        return start.isoformat(), end.isoformat()
    if ":" in period:
        a, b = period.split(":", 1)
        return a.strip(), b.strip()
    raise click.BadParameter("period must be last-10d or YYYY-MM-DD:YYYY-MM-DD")


def _wait_job(job, name: str) -> str:
    """Poll batch job until finished or error. Returns final status."""
    job_id = getattr(job, "job_id", "?")
    while True:
        status = job.status()
        log.info("%s job %s: %s", name, job_id, status)
        if status in ("finished", "error", "canceled"):
            return status
        time.sleep(JOB_POLL_SEC)


@click.group()
def cli() -> None:
    """Opt Padi Kalbar — Sentinel-2 ETL."""


@cli.command()
def login() -> None:
    """Interactive CDSE openEO login (device flow). Cache refresh token utk run berikutnya."""
    from openeo_pipeline import connect

    conn = connect()
    me = conn.describe_account() if hasattr(conn, "describe_account") else None
    log.info("✓ logged in to CDSE openEO")
    if me:
        log.info("account: %s", me)


@cli.command()
@click.option("--kabupaten", required=True, help="kabupaten id (e.g. pontianak)")
@click.option("--start", required=True, help="YYYY-MM-DD")
@click.option("--end", required=True, help="YYYY-MM-DD")
@click.option("--upload/--no-upload", default=False, help="upload COG + insert DB")
@click.option("--dry-run", is_flag=True, help="hanya validate, jangan submit batch job")
def composite(kabupaten: str, start: str, end: str, upload: bool, dry_run: bool) -> None:
    """Process one kabupaten over one composite window."""
    from kabupaten import KABUPATEN_IDS, bbox_for
    from openeo_pipeline import CompositeRequest, build_composite
    from stats import compute_index_stats
    from storage import insert_composite_row, mark_composite_failed, upload_cog

    if kabupaten not in KABUPATEN_IDS:
        raise click.ClickException(f"unknown kabupaten: {kabupaten}")

    req = CompositeRequest(kabupaten_id=kabupaten, start_date=start, end_date=end)
    log.info("composite: %s window=%s..%s upload=%s dry_run=%s", kabupaten, start, end, upload, dry_run)

    if dry_run:
        bbox = bbox_for(kabupaten)
        log.info("dry-run OK — bbox=%s req=%s", bbox, req)
        return

    if upload:
        # Fail fast: validate Supabase env BEFORE submitting CDSE batch jobs (buang quota kalau gagal di tengah).
        required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
        missing = [k for k in required if not os.getenv(k)]
        if missing:
            raise click.ClickException(f"Missing env vars: {', '.join(missing)} — cek .env.local")

    _run_composite(req, upload=upload)


# No automatic retry — re-running build_composite re-submits CDSE batch jobs and burns quota.
# Failed run? Re-invoke manually; CDSE keeps recent finished jobs for ~24h (refetchable by job id).
def _run_composite(req, upload: bool) -> None:
    from openeo_pipeline import build_composite, CROPLAND_MASK_ENABLED
    from stats import compute_index_stats
    from storage import insert_composite_row, mark_composite_failed, upload_cog

    jobs = build_composite(req)
    cog_paths: dict[str, str] = {}
    indices_stats: dict[str, dict] = {}

    # Pre-load WorldCover mask once if cropland mode active
    wc_mask = wc_transform = wc_crs = None
    cropland_px_count = None
    cropland_ha = None
    if CROPLAND_MASK_ENABLED and upload:
        try:
            from worldcover import load_cropland_mask, cropland_area_ha
            wc_mask, wc_transform, wc_crs = load_cropland_mask(req.kabupaten_id)
            cropland_px_count = int(wc_mask.sum())
            cropland_ha = cropland_area_ha(req.kabupaten_id)
            log.info("WorldCover mask loaded for %s: %d px (%.0f ha)",
                     req.kabupaten_id, cropland_px_count, cropland_ha or 0)
        except Exception as exc:
            log.error("WorldCover mask load failed for %s: %s — continuing without crop mask",
                      req.kabupaten_id, exc)
            # Degrade gracefully: ETL_CROPLAND_MASK_ENABLED=true but mask unavailable → skip crop
            wc_mask = None

    try:
        for name, job in jobs:
            status = _wait_job(job, name)
            if status != "finished":
                logs = getattr(job, "describe_job", lambda: {})()
                raise RuntimeError(f"openEO job {name} failed: status={status} info={logs}")

            with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
                tmp_path = Path(tmp.name)
            try:
                job.get_results().download_file(str(tmp_path))

                # Raw stats (all-land)
                raw_stats = compute_index_stats(tmp_path)
                indices_stats[name] = raw_stats

                if upload:
                    remote = f"composites/{req.kabupaten_id}/{req.end_date}/{name}.tif"
                    cog_paths[name] = upload_cog(tmp_path, remote)

                # Cropland-masked stats + COG
                if CROPLAND_MASK_ENABLED and wc_mask is not None and upload:
                    try:
                        from mask_cropland import apply_cropland_to_file
                        crop_tmp = apply_cropland_to_file(tmp_path, wc_mask, wc_transform, wc_crs)
                        try:
                            crop_stats = compute_index_stats(crop_tmp)
                            indices_stats[f"{name}_crop"] = crop_stats
                            crop_remote = f"composites/{req.kabupaten_id}/{req.end_date}/{name}_crop.tif"
                            cog_paths[f"{name}_crop"] = upload_cog(crop_tmp, crop_remote)
                        finally:
                            crop_tmp.unlink(missing_ok=True)
                    except Exception as exc:
                        log.error("Cropland mask failed for %s %s: %s — raw only", req.kabupaten_id, name, exc)
            finally:
                tmp_path.unlink(missing_ok=True)

        ndvi_clear = (indices_stats.get("ndvi") or {}).get("area_clear_pct") or 0
        if ndvi_clear < MIN_CLEAR_PCT:
            log.warning(
                "scl_clear_pct %.1f < %.1f — skipping DB insert",
                ndvi_clear,
                MIN_CLEAR_PCT,
            )
            return

        if upload:
            wc_path = f"assets/worldcover/{req.kabupaten_id}.tif" if CROPLAND_MASK_ENABLED and wc_mask is not None else None
            insert_composite_row(
                req.kabupaten_id,
                req.start_date,
                req.end_date,
                cog_paths,
                ndvi_clear,
                indices_stats,
                cropland_mask_path=wc_path,
                cropland_pixel_count=cropland_px_count,
                cropland_area_ha=cropland_ha,
            )
            log.info("composite uploaded + inserted for %s (%d index rows)",
                     req.kabupaten_id, len(indices_stats))
    except Exception as exc:
        log.exception("composite failed: %s", exc)
        if upload:
            mark_composite_failed(req.kabupaten_id, req.start_date, req.end_date, str(exc))
        raise


@cli.command("batch-all")
@click.option("--period", default="last-10d", help="last-10d | YYYY-MM-DD:YYYY-MM-DD")
@click.option("--upload/--no-upload", default=False)
@click.option("--dry-run", is_flag=True, default=False)
def batch_all(period: str, upload: bool, dry_run: bool) -> None:
    """Process all 14 kabupaten for the period."""
    from kabupaten import KABUPATEN_IDS
    from openeo_pipeline import CompositeRequest

    start, end = _parse_period(period)
    log.info("batch-all: %s..%s upload=%s (%d kabupaten)", start, end, upload, len(KABUPATEN_IDS))

    failures: list[tuple[str, str]] = []
    for i, kid in enumerate(KABUPATEN_IDS):
        log.info("── [%d/%d] %s", i + 1, len(KABUPATEN_IDS), kid)
        ctx = click.get_current_context()
        try:
            ctx.invoke(
                composite,
                kabupaten=kid,
                start=start,
                end=end,
                upload=upload,
                dry_run=dry_run,
            )
        except Exception as exc:  # isolate per-kab failure — don't abort the remaining 13
            log.exception("kabupaten %s failed: %s — continuing", kid, exc)
            failures.append((kid, str(exc)))
        if not dry_run and i < len(KABUPATEN_IDS) - 1:
            time.sleep(int(os.getenv("ETL_KAB_DELAY_SEC", "300")))

    log.info("batch-all done: ok=%d failed=%d", len(KABUPATEN_IDS) - len(failures), len(failures))
    for kid, msg in failures:
        log.warning("  ✗ %s: %s", kid, msg[:200])


def _doy_bucket(d: date) -> int:
    """DOY bucket midpoint: 1-10 → 5, 11-20 → 15, ..., 361-366 → 365. Sync dengan SQL doy_bucket()."""
    doy = d.timetuple().tm_yday
    return ((doy - 1) // 10) * 10 + 5


@cli.command()
@click.option("--years", default="2021,2022,2023,2024,2025", help="5 tahun lengkap terbaru (default rolling)")
@click.option("--kabupaten", default=None, help="single kabupaten or all if omitted")
@click.option("--indices", default="ndvi,ndwi,mndwi,ndmi,msi,evi", help="comma-separated indices")
@click.option("--min-samples", default=2, type=int, help="minimum sampel per DOY bucket utk insert baseline")
def baseline(years: str, kabupaten: str | None, indices: str, min_samples: int) -> None:
    """Aggregate vegetation_indices → index_baselines per DOY bucket (10-day midpoint).

    Prasyarat: vegetation_indices terisi untuk tahun-tahun target (jalankan `backfill` dulu).
    Default semua 6 indeks. Output: index_baselines (kabupaten_id, index_name, doy, mean, std, sample_count).
    """
    import numpy as np
    from kabupaten import KABUPATEN_IDS
    from storage import get_supabase_client

    year_list = [int(y.strip()) for y in years.split(",") if y.strip()]
    index_list = [i.strip().lower() for i in indices.split(",") if i.strip()]
    targets = [kabupaten] if kabupaten else list(KABUPATEN_IDS)
    client = get_supabase_client()
    min_year, max_year = min(year_list), max(year_list)

    log.info("baseline: years=%s indices=%s kabupaten=%d min_samples=%d",
             year_list, index_list, len(targets), min_samples)

    grand_total = 0
    for kid in targets:
        for idx in index_list:
            rows = (
                client.table("vegetation_indices")
                .select("observation_date, mean")
                .eq("kabupaten_id", kid)
                .eq("index_name", idx)
                .gte("observation_date", f"{min_year}-01-01")
                .lte("observation_date", f"{max_year}-12-31")
                .execute()
                .data
                or []
            )

            by_bucket: dict[int, list[float]] = {}
            for row in rows:
                if row.get("mean") is None:
                    continue
                y = int(row["observation_date"][:4])
                if y not in year_list:
                    continue
                d = date.fromisoformat(row["observation_date"])
                by_bucket.setdefault(_doy_bucket(d), []).append(float(row["mean"]))

            if not by_bucket:
                log.warning("  no %s samples for %s in %s..%s", idx, kid, min_year, max_year)
                continue

            inserted = 0
            for doy_b, values in sorted(by_bucket.items()):
                if len(values) < min_samples:
                    continue
                arr = np.array(values, dtype=np.float64)
                client.table("index_baselines").upsert(
                    {
                        "kabupaten_id": kid,
                        "index_name": idx,
                        "doy": doy_b,
                        "mean": float(arr.mean()),
                        "std": float(arr.std(ddof=1)) if len(arr) > 1 else 0.05,
                        "sample_count": len(arr),
                    },
                    on_conflict="kabupaten_id,index_name,doy",
                ).execute()
                inserted += 1
            log.info("  %s %s → %d buckets (from %d rows)", kid, idx, inserted, len(rows))
            grand_total += inserted

    log.info("✓ baseline upserted %d total bucket rows", grand_total)


@cli.command()
@click.option("--years", required=True, help="comma-separated, e.g. 2021,2022,2023,2024,2025")
@click.option("--kabupaten", default=None, help="single kab or all if omitted")
@click.option("--window-days", default=30, type=int, help="composite window size (30=monthly, 10=dekadal)")
@click.option("--start-month", default=1, type=int, help="bulan awal per tahun (1-12)")
@click.option("--end-month", default=12, type=int, help="bulan akhir per tahun (1-12)")
@click.option("--delay-sec", default=120, type=int, help="sleep antar composite (hindari quota CDSE)")
@click.option("--dry-run", is_flag=True, help="hanya tampilkan plan, tidak submit")
def backfill(years: str, kabupaten: str | None, window_days: int, start_month: int, end_month: int,
             delay_sec: int, dry_run: bool) -> None:
    """Submit historical composites untuk N tahun × kabupaten — populate vegetation_indices utk baseline.

    Quota CDSE Free ~5 batch jobs/jam → 6 indices/composite × 12 windows/tahun = 72 jobs/kab/tahun
    → ~15 jam per kab per tahun. Strategi: 1 kabupaten at a time, multi-day session.

    Setelah backfill selesai, jalankan `baseline --years YEARS` untuk aggregate ke index_baselines.
    """
    from datetime import date, timedelta
    from calendar import monthrange
    from kabupaten import KABUPATEN_IDS

    year_list = [int(y.strip()) for y in years.split(",") if y.strip()]
    targets = [kabupaten] if kabupaten else list(KABUPATEN_IDS)

    if kabupaten and kabupaten not in KABUPATEN_IDS:
        raise click.ClickException(f"unknown kabupaten: {kabupaten}")

    # Build composite window list per year — split month into chunks of window_days,
    # merge sisa < 7 hari ke window sebelumnya (hindari sliver 1-day composite).
    all_windows: list[tuple[str, str, str]] = []  # (kab_id, start, end)
    for kid in targets:
        for year in year_list:
            for month in range(start_month, end_month + 1):
                _, days_in_month = monthrange(year, month)
                first = date(year, month, 1)
                month_end = date(year, month, days_in_month)
                month_wins: list[tuple[str, str]] = []
                cur = first
                while cur <= month_end:
                    win_end = min(cur + timedelta(days=window_days - 1), month_end)
                    month_wins.append((cur.isoformat(), win_end.isoformat()))
                    cur = win_end + timedelta(days=1)
                # Merge tail jika < 7 hari
                if len(month_wins) >= 2:
                    last_s, last_e = month_wins[-1]
                    span = (date.fromisoformat(last_e) - date.fromisoformat(last_s)).days + 1
                    if span < 7:
                        prev_s, _ = month_wins[-2]
                        month_wins = month_wins[:-2] + [(prev_s, last_e)]
                for ws, we in month_wins:
                    all_windows.append((kid, ws, we))

    total = len(all_windows)
    eta_hours = (total * 6) / 5  # 6 jobs/composite, 5 jobs/hour CDSE free
    log.info("backfill plan: %d composites × 6 indices = %d batch jobs (~%.0f jam CDSE free quota)",
             total, total * 6, eta_hours)
    log.info("  years=%s kab=%d windows/kab/year=%d",
             year_list, len(targets), total // (len(targets) * len(year_list)))

    if dry_run:
        for i, (kid, ws, we) in enumerate(all_windows[:10]):
            log.info("  [%d] %s %s..%s", i + 1, kid, ws, we)
        if total > 10:
            log.info("  ... %d more windows", total - 10)
        log.info("dry-run done. Re-run tanpa --dry-run untuk submit.")
        return

    if upload_required():
        log.info("upload mode aktif — verifikasi Supabase env...")

    failures: list[tuple[str, str, str, str]] = []
    for i, (kid, ws, we) in enumerate(all_windows):
        log.info("── [%d/%d] %s %s..%s", i + 1, total, kid, ws, we)
        ctx = click.get_current_context()
        try:
            ctx.invoke(composite, kabupaten=kid, start=ws, end=we, upload=True, dry_run=False)
        except Exception as exc:
            log.exception("backfill %s %s..%s failed: %s", kid, ws, we, exc)
            failures.append((kid, ws, we, str(exc)[:120]))
        if i < total - 1:
            time.sleep(delay_sec)

    log.info("backfill done: ok=%d failed=%d", total - len(failures), len(failures))
    for kid, ws, we, msg in failures:
        log.warning("  ✗ %s %s..%s: %s", kid, ws, we, msg)


def upload_required() -> bool:
    return all(os.getenv(k) for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"))


@cli.command("recompute-crop")
@click.option("--kabupaten", default=None, help="single kab or all if omitted")
@click.option("--dry-run", is_flag=True, help="show plan only, no CDSE submission")
@click.option("--delay-sec", default=120, type=int, help="sleep antara composite (throttle CDSE quota)")
def recompute_crop(kabupaten: str | None, dry_run: bool, delay_sec: int) -> None:
    """Recompute _crop COG + stats untuk semua existing composites tanpa data _crop.

    Jalankan SETELAH Pontianak per-year backfill selesai (Task B, Phase 2 Step 13).
    Throttle 5 batch jobs/jam via --delay-sec. Estimasi 4 hari untuk 108 composites.

    Prerequisites:
    - ETL_CROPLAND_MASK_ENABLED=true di env
    - WorldCover tiles uploaded ke Supabase assets/worldcover/
    - Migration 011 deployed
    """
    from openeo_pipeline import CROPLAND_MASK_ENABLED

    if not CROPLAND_MASK_ENABLED:
        raise click.ClickException(
            "ETL_CROPLAND_MASK_ENABLED=false — set to true sebelum recompute-crop"
        )

    required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    missing = [k for k in required if not os.getenv(k)]
    if missing:
        raise click.ClickException(f"Missing env vars: {', '.join(missing)}")

    from kabupaten import KABUPATEN_IDS
    from storage import get_supabase_client

    targets = [kabupaten] if kabupaten else list(KABUPATEN_IDS)
    if kabupaten and kabupaten not in KABUPATEN_IDS:
        raise click.ClickException(f"unknown kabupaten: {kabupaten}")

    client = get_supabase_client()

    # Fetch composites yang belum punya _crop data
    all_composites: list[dict] = []
    for kid in targets:
        rows = (
            client.table("sentinel_composites")
            .select("id, kabupaten_id, period_start, period_end")
            .eq("kabupaten_id", kid)
            .eq("status", "completed")
            .execute()
            .data or []
        )
        # Check yang mana sudah punya ndvi_crop
        for row in rows:
            crop_check = (
                client.table("vegetation_indices")
                .select("id")
                .eq("kabupaten_id", kid)
                .eq("index_name", "ndvi_crop")
                .gte("observation_date", row["period_start"])
                .lte("observation_date", row["period_end"])
                .limit(1)
                .execute()
                .data or []
            )
            if not crop_check:
                all_composites.append(row)

    total = len(all_composites)
    eta_hours = total * 6 / 5  # 6 jobs per composite, ~5 jobs/hour CDSE free
    log.info(
        "recompute-crop: %d composites without _crop data (ETA ~%.0f hours @ 5 jobs/hr throttle)",
        total, eta_hours
    )

    if dry_run:
        for i, row in enumerate(all_composites[:10]):
            log.info("  [%d] %s %s..%s", i + 1, row["kabupaten_id"], row["period_start"], row["period_end"])
        if total > 10:
            log.info("  ... %d more", total - 10)
        log.info("dry-run done. Remove --dry-run to start (ETL_CROPLAND_MASK_ENABLED must be true).")
        return

    failures: list[tuple] = []
    for i, row in enumerate(all_composites):
        kid = row["kabupaten_id"]
        ws = row["period_start"]
        we = row["period_end"]
        log.info("── [%d/%d] %s %s..%s", i + 1, total, kid, ws, we)
        req_obj = __import__("openeo_pipeline").CompositeRequest(
            kabupaten_id=kid, start_date=ws, end_date=we
        )
        try:
            _run_composite(req_obj, upload=True)
        except Exception as exc:
            log.exception("recompute-crop %s %s..%s failed: %s", kid, ws, we, exc)
            failures.append((kid, ws, we, str(exc)[:120]))
        if i < total - 1:
            time.sleep(delay_sec)

    log.info("recompute-crop done: ok=%d failed=%d", total - len(failures), len(failures))
    if failures:
        for kid, ws, we, msg in failures:
            log.warning("  ✗ %s %s..%s: %s", kid, ws, we, msg)


@cli.command("train-yield")
@click.option("--season", default=None, help="e.g. 2026-MT1 (default: current season)")
def train_yield(season: str | None) -> None:
    """Fit linreg-v0 and upsert yield_estimates."""
    from yield_model import train_yield_v0

    if not season:
        d = date.today()
        season = f"{d.year}-MT{1 if d.month < 6 else 2}"
    result = train_yield_v0(season)
    if not result:
        raise click.ClickException("yield training failed — need BPS + NDVI data")
    log.info("yield model trained: %s", result)


if __name__ == "__main__":
    sys.exit(cli())
