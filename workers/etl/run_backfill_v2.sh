#!/bin/bash
# Backfill v2: 13 paralel, throttling agresif hindari 429
# CDSE 5 batch jobs/jam → 1 composite (6 jobs) consume ~72 min CDSE quota
# Stagger 30 min antar worker + delay 20 min antar composite → max 2-3 worker submit bersamaan

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGDIR="$ROOT/logs_v2"
[[ -z "$LOGDIR" ]] && { echo "ERROR: LOGDIR empty"; exit 1; }
rm -rf "$LOGDIR"
mkdir -p "$LOGDIR"

YEAR="2025"
DELAY_COMPOSITE=1200 # 20 menit antar composite (biarkan CDSE antrian drain)
STAGGER_SEC=1800     # 30 menit antar worker start (hindari burst submission)

KABS=(
  sambas bengkayang landak mempawah sanggau ketapang
  sintang kapuas-hulu sekadau melawi kayong-utara kubu-raya
  singkawang
)

for i in "${!KABS[@]}"; do
  KAB="${KABS[$i]}"
  DELAY=$((i * STAGGER_SEC))
  LOGFILE="$LOGDIR/backfill_${KAB}.log"

  echo "[$((i+1))/13] $KAB (start in ${DELAY}s, delay-composite ${DELAY_COMPOSITE}s)"
  (sleep "$DELAY" && cd "$ROOT" && uv run python main.py backfill \
    --years "$YEAR" --kabupaten "$KAB" --delay-sec "$DELAY_COMPOSITE" \
    > "$LOGFILE" 2>&1 & PY_PID=$!; echo "$PY_PID" > "$LOGDIR/backfill_${KAB}.pid"; wait "$PY_PID"; echo "EXIT:$?" >> "$LOGFILE") &
done

echo ""
echo "✓ 13 workers. Stagger: 30 min. Composite delay: 20 min."
echo "  Monitor: tail -f $LOGDIR/backfill_*.log"
echo "  Stop:   kill \$(cat $LOGDIR/backfill_*.pid)"
