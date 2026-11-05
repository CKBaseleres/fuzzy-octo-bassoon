#!/usr/bin/env bash
# THROWAWAY: Lingo Lens "Azure spike" helper. See CHECKLIST.md next to this file.
#
#   ./run-spike.sh make-files <path/to/sample.pdf>   # builds oversize.pdf + garbage.pdf + archive.zip in ./files
#   ./run-spike.sh run                               # submits every case to Translator batch, saves raw responses
#
# Env for `run`:
#   TRANSLATOR_ENDPOINT  e.g. https://lingolens-spike-tr.cognitiveservices.azure.com   (no trailing slash)
#   TRANSLATOR_KEY       Key 1 from the Translator resource (spike only; production is keyless)
#   TRANSLATOR_REGION    default westeurope
#   STORAGE_ACCOUNT      e.g. lingolensspike
#   TARGET_LANG          default fr
#   REPEAT               runs per latency case, default 3
set -euo pipefail
cd "$(dirname "$0")"
API="api-version=2026-03-01"

if [[ "${1:-}" == "make-files" ]]; then
  src="${2:?give the path to the 2-page sample PDF}"
  mkdir -p files
  cp "$src" files/sample.pdf
  { cat "$src"; printf '\n%% padding to exceed the 40 MB batch limit\n'; head -c $((41*1024*1024)) /dev/urandom; } > files/oversize.pdf
  head -c $((200*1024)) /dev/urandom > files/garbage.pdf
  (cd files && zip -q archive.zip sample.pdf)
  ls -lh files
  exit 0
fi

[[ "${1:-}" == "run" ]] || { sed -n '2,14p' "$0"; exit 1; }
: "${TRANSLATOR_ENDPOINT:?}" "${TRANSLATOR_KEY:?}" "${STORAGE_ACCOUNT:?}"
REGION="${TRANSLATOR_REGION:-westeurope}"; LANG_TO="${TARGET_LANG:-fr}"; REPEAT="${REPEAT:-3}"
BLOB="https://${STORAGE_ACCOUNT}.blob.core.windows.net"
RUN="$(date +%Y%m%d-%H%M%S)"; OUT="results/$RUN"; mkdir -p "$OUT"
printf 'case\trun\tsubmit_http\tfinal_status\tsecs_to_running\tsecs_total\tdoc_status\terror_code\tinner_code\tmessage\n' > "$OUT/summary.tsv"

hdr=(-H "Ocp-Apim-Subscription-Key: $TRANSLATOR_KEY" -H "Ocp-Apim-Subscription-Region: $REGION")

run_case() { # $1 = case name, $2 = blob name in the `source` container, $3 = run number
  local name="$1" blob="$2" n="$3" dir="$OUT/$1-$3"; mkdir -p "$dir"
  local body; body=$(jq -n --arg s "$BLOB/source/$blob" --arg t "$BLOB/target/$RUN-$n-$blob" --arg l "$LANG_TO" \
    '{inputs:[{storageType:"File", source:{sourceUrl:$s}, targets:[{targetUrl:$t, language:$l}]}]}')
  echo "$body" > "$dir/request.json"
  local t0; t0=$(python3 -c 'import time;print(time.time())')
  local code; code=$(curl -sS -D "$dir/submit.headers" -o "$dir/submit.body" -w '%{http_code}' -X POST \
    "$TRANSLATOR_ENDPOINT/translator/document/batches?$API" "${hdr[@]}" -H 'Content-Type: application/json' -d "$body")
  local loc; loc=$(grep -i '^operation-location:' "$dir/submit.headers" | cut -d' ' -f2- | tr -d '\r' || true)
  local status="SubmitRejected" t_run="" now
  if [[ "$code" == 202 && -n "$loc" ]]; then
    : > "$dir/poll.tsv"
    for _ in $(seq 1 450); do   # up to ~15 minutes
      curl -sS "$loc" "${hdr[@]}" -o "$dir/status.json"
      status=$(jq -r '.status' "$dir/status.json"); now=$(python3 -c 'import time;print(time.time())')
      printf '%.1f\t%s\n' "$(echo "$now - $t0" | bc)" "$status" >> "$dir/poll.tsv"
      [[ -z "$t_run" && "$status" != "NotStarted" ]] && t_run=$(echo "$now - $t0" | bc)
      case "$status" in Succeeded|Failed|ValidationFailed|Cancelled) break;; esac
      sleep 2
    done
    curl -sS "${loc%%\?*}/documents?$API" "${hdr[@]}" -o "$dir/documents.json"
  fi
  now=$(python3 -c 'import time;print(time.time())')
  local d=".value[0]"; local f="$dir/documents.json"; [[ -s "$f" ]] || { f="$dir/submit.body"; d="."; }
  local ds ec ic msg
  ds=$(jq -r "$d.status // \"-\"" "$f" 2>/dev/null || echo -)
  ec=$(jq -r "$d.error.code // .error.code // \"-\"" "$f" 2>/dev/null || echo -)
  ic=$(jq -r "$d.error.innerError.code // .error.innerError.code // \"-\"" "$f" 2>/dev/null || echo -)
  msg=$(jq -r "$d.error.message // .error.message // \"-\"" "$f" 2>/dev/null | tr '\t\n' '  ' || echo -)
  printf '%s\t%s\t%s\t%s\t%s\t%.1f\t%s\t%s\t%s\t%s\n' "$name" "$n" "$code" "$status" "${t_run:--}" \
    "$(echo "$now - $t0" | bc)" "$ds" "$ec" "$ic" "$msg" | tee -a "$OUT/summary.tsv"
}

for n in $(seq 1 "$REPEAT"); do
  run_case small-docx small.docx "$n"
  run_case sample-pdf sample.pdf "$n"
  run_case large-pptx large.pptx "$n"
done
for c in protected.pdf protected.docx mixed.pdf oversize.pdf garbage.pdf archive.zip; do
  run_case "err-${c/./-}" "$c" 1
done

echo; echo "Done. Raw responses in research/azure-spike/$OUT ; summary: $OUT/summary.tsv"
