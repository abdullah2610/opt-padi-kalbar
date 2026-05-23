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
    from openeo_pipeline import build_composite
    from stats import compute_index_stats
    from storage import insert_composite_row, mark_composite_failed, upload_cog

    jobs = build_composite(req)
    cog_paths: dict[str, str] = {}
    indices_stats: dict[str, dict] = {}

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
                stats = compute_index_stats(tmp_path)
                indices_stats[name] = stats
                if upload:
                    remote = f"composites/{req.kabupaten_id}/{req.end_date}/{name}.tif"
                    cog_paths[name] = upload_cog(tmp_path, remote)
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
            insert_composite_row(
                req.kabupaten_id,
                req.start_date,
                req.end_date,
                cog_paths,
                ndvi_clear,
                indices_stats,
            )
            log.info("composite uploaded + inserted for %s", req.kabupaten_id)
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


@cli.command()
@click.option("--years", default="2019,2020,2021,2022,2023")
@click.option("--kabupaten", default=None, help="single kabupaten or all if omitted")
def baseline(years: str, kabupaten: str | None) -> None:
    """Aggregate NDVI vegetation_indices → index_baselines per DOY."""
    import numpy as np
    from kabupaten import KABUPATEN_IDS
    from storage import get_supabase_client

    year_list = [int(y.strip()) for y in years.split(",") if y.strip()]
    targets = [kabupaten] if kabupaten else list(KABUPATEN_IDS)
    client = get_supabase_client()
    min_year, max_year = min(year_list), max(year_list)

    log.info("baseline: years=%s kabupaten=%d", year_list, len(targets))

    for kid in targets:
        rows = (
            client.table("vegetation_indices")
            .select("observation_date, mean")
            .eq("kabupaten_id", kid)
            .eq("index_name", "ndvi")
            .gte("observation_date", f"{min_year}-01-01")
            .lte("observation_date", f"{max_year}-12-31")
            .execute()
            .data
            or []
        )
        by_doy: dict[int, list[float]] = {}
        for row in rows:
            if row.get("mean") is None:
                continue
            y = int(row["observation_date"][:4])
            if y not in year_list:
                continue
            d = date.fromisoformat(row["observation_date"])
            by_doy.setdefault(d.timetuple().tm_yday, []).append(float(row["mean"]))

        if not by_doy:
            log.warning("no NDVI samples for %s — run ETL composites first", kid)
            continue

        for doy, values in by_doy.items():
            arr = np.array(values, dtype=np.float64)
            client.table("index_baselines").upsert(
                {
                    "kabupaten_id": kid,
                    "index_name": "ndvi",
                    "doy": doy,
                    "mean": float(arr.mean()),
                    "std": float(arr.std()) if len(arr) > 1 else 0.01,
                    "sample_count": len(arr),
                },
                on_conflict="kabupaten_id,index_name,doy",
            ).execute()
        log.info("baseline upserted %d DOY rows for %s", len(by_doy), kid)


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
