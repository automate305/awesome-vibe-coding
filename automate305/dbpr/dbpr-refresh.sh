#!/bin/zsh
#
# Automate305 DBPR weekly refresh.
#
# Downloads the Florida DBPR construction license export, runs the existing
# import script over it, and stamps the result so the prospect feed can show a
# "last updated" date. Invoked every Monday 06:00 Miami time by
# com.automate305.dbpr-refresh.plist.
#
# Install to: /Users/camilog/Desktop/DBPR HVAC Import Script - Cursor/scripts/dbpr-refresh.sh
#
set -euo pipefail

PROJECT_DIR="${DBPR_PROJECT_DIR:-$HOME/Desktop/DBPR HVAC Import Script - Cursor}"
LEADS_DIR="$PROJECT_DIR/data/leads"
RAW_CSV="$LEADS_DIR/dbpr-raw.csv"
FILTERED_CSV="$LEADS_DIR/dbpr-hvac-filtered.csv"
STAMP_FILE="$LEADS_DIR/dbpr-last-run.json"
LOG_FILE="$HOME/Library/Logs/automate305-dbpr.log"
SOURCE_URL="https://www.myfloridalicense.com/DBPR/os/documents/CONSTRUCTIONLICENSE.csv"

mkdir -p "$LEADS_DIR" "$(dirname "$LOG_FILE")"

log() { print -r -- "[$(date '+%Y-%m-%d %H:%M:%S %Z')] $*" | tee -a "$LOG_FILE"; }

fail() {
  log "FAILED: $*"
  print -r -- "{\"status\":\"failed\",\"error\":$(print -r -- "$*" | sed 's/"/\\"/g; s/^/"/; s/$/"/'),\"ranAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > "$STAMP_FILE"
  exit 1
}

log "=== DBPR refresh starting ==="

# launchd runs with a minimal PATH; pick up Homebrew and any node version manager.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[[ -s "$HOME/.nvm/nvm.sh" ]] && source "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true

command -v node >/dev/null 2>&1 || fail "node not found on PATH ($PATH)"
log "node $(node -v), pnpm $(pnpm -v 2>/dev/null || echo 'not found')"

# ---------------------------------------------------------------- download
# Write to a temp file first so a partial download never clobbers a good CSV.
TMP_CSV="$(mktemp -t dbpr-raw)"
trap 'rm -f "$TMP_CSV"' EXIT

log "Downloading $SOURCE_URL"
if ! curl -fSL --retry 4 --retry-delay 5 --retry-connrefused \
     --connect-timeout 30 --max-time 900 \
     -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' \
     -o "$TMP_CSV" "$SOURCE_URL"; then
  fail "download failed from $SOURCE_URL"
fi

BYTES=$(wc -c < "$TMP_CSV" | tr -d ' ')
[[ "$BYTES" -lt 100000 ]] && fail "downloaded file is only ${BYTES} bytes — looks like an error page, keeping previous CSV"

mv "$TMP_CSV" "$RAW_CSV"
trap - EXIT
log "Saved raw CSV: $RAW_CSV (${BYTES} bytes)"

# ------------------------------------------------------------------ import
cd "$PROJECT_DIR"
log "Running import script"

if [[ -f "scripts/dbpr-import.ts" ]]; then
  if command -v pnpm >/dev/null 2>&1 && [[ -f package.json ]]; then
    pnpm tsx scripts/dbpr-import.ts --input "$RAW_CSV" --output "$FILTERED_CSV" 2>&1 | tee -a "$LOG_FILE" \
      || fail "import script exited non-zero"
  else
    npx --yes tsx scripts/dbpr-import.ts --input "$RAW_CSV" --output "$FILTERED_CSV" 2>&1 | tee -a "$LOG_FILE" \
      || fail "import script exited non-zero"
  fi
else
  fail "scripts/dbpr-import.ts not found in $PROJECT_DIR"
fi

[[ -f "$FILTERED_CSV" ]] || fail "import finished but $FILTERED_CSV was not written"

ROWS=$(( $(wc -l < "$FILTERED_CSV" | tr -d ' ') - 1 ))
log "Filtered output: $FILTERED_CSV (${ROWS} leads)"

# ------------------------------------------------------------------- stamp
cat > "$STAMP_FILE" <<EOF
{
  "status": "ok",
  "ranAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "ranAtLocal": "$(date '+%Y-%m-%d %H:%M %Z')",
  "displayDate": "$(date '+%b %-d, %Y')",
  "rawBytes": ${BYTES},
  "filteredRows": ${ROWS},
  "rawCsv": "$RAW_CSV",
  "filteredCsv": "$FILTERED_CSV"
}
EOF

log "=== DBPR refresh complete: ${ROWS} leads ==="
