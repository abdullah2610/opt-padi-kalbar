#!/bin/bash
# Backfill paralel 13 kabupaten (skip Pontianak), staggered start
# CDSE free tier ~5 batch jobs/jam → stagger 15 menit antar kab
# Output: logs/per_kab di workers/etl/logs/

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGDIR="$ROOT/logs"
mkdir -p "$LOGDIR"

YEAR="2025"
KABS=(
  sambas bengkayang landak mempawah sanggau ketapang
  sintang kapuas-hulu sekadau melawi kayong-utara kubu-raya
  singkawang
)

# Hapus log lama
rm -f "$LOGDIR"/backfill_*.log "$LOGDIR"/backfill_*.pid

STAGGER_SEC=$((15 * 60))  # 15 menit

for i in "${!KABS[@]}"; do
  KAB="${KABS[$i]}"
  DELAY=$((i * STAGGER_SEC))
  LOGFILE="$LOGDIR/backfill_${KAB}.log"

  echo "[$((i+1))/13] Launching $KAB (delay ${DELAY}s, log: $LOGFILE)"

  # Sleep dulu (kecuali index 0), lalu jalankan backfill
  (sleep "$DELAY" && cd "$ROOT" && uv run python main.py backfill --years "$YEAR" --kabupaten "$KAB" > "$LOGFILE" 2>&1 & PY_PID=$!; echo "$PY_PID" > "$LOGDIR/backfill_${KAB}.pid"; wait "$PY_PID"; echo "EXIT:$?" >> "$LOGFILE") &
done

echo ""
echo "✓ 13 workers launched. Monitor dengan:"
echo "  tail -f $LOGDIR/backfill_*.log"
echo "  ps aux | grep backfill"
echo ""
echo "Stop semua:  kill \$(cat $LOGDIR/backfill_*.pid)"
