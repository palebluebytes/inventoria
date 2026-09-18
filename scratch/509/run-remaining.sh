#!/usr/bin/env bash
# PROTOTYPE, throwaway (#509). Works through the arms the free-neuron ceiling
# cut short, in priority order, waiting for the allocation to come back.
#
# The Workers AI free allocation turned out to be a ROLLING window, not a UTC
# day (see README §7), so the wait is a probe rather than a clock: one real call
# costs ~40 neurons when it succeeds and nothing when it is refused.
#
# Run: bash scratch/509/run-remaining.sh
set -u
cd "$(dirname "$0")/../.."

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }

# An arm is "complete" when it wrote no 429s. Otherwise wait and run it again.
run_arm() {
  local name="$1"; shift
  local tries=0
  while [ $tries -lt 40 ]; do
    log "arm ${name}: attempt $((tries + 1))"
    node scratch/509/harness.mjs "$name" "$@" >"/tmp/509-${name}.log" 2>&1
    local refused
    refused=$(python3 -c "
import json,sys
try: rows=json.load(open('scratch/509/raw-${name}.json'))
except Exception: print(999); sys.exit()
print(sum(1 for r in rows if r['status']==429))
")
    if [ "$refused" = "0" ]; then
      log "arm ${name}: complete ($(tail -1 "/tmp/509-${name}.log"))"
      return 0
    fi
    log "arm ${name}: ${refused} refused, waiting 15 min for the window to roll"
    tries=$((tries + 1))
    sleep 900
  done
  log "arm ${name}: GAVE UP after $tries attempts"
  return 1
}

# 1. The guard-sentence ablation (#509 §3) - the arm the ticket weights most.
#    Controls first: the only images where `calories: null` is demonstrably the
#    right answer. Three repeats each, with the guard and without it.
run_arm ablate-controls-guard   --controls --prompt itemised --repeats 3
run_arm ablate-controls-noguard --controls --prompt noguard  --repeats 3

# 2. Does the guard cost accuracy on real plates? Same 12 dishes as the main
#    arm, guard sentence removed.
run_arm ablate-plates-noguard --prompt noguard --dishes 12

# 3. Run-to-run variance at temperature 0, as a discriminant not a rate (#482).
run_arm variance --prompt itemised --dishes 5 --repeats 3

# 4. Which frame, and whether a second one helps (#509 §4, #515 §6.4).
run_arm frame-side --prompt itemised --frame side --dishes 25
run_arm frame-both --prompt itemised --frame both --dishes 25

# 5. Second model, so "which model" is measured here rather than inherited.
run_arm mistral-itemised --model mistral-small-3.1 --prompt itemised --dishes all

log "ALL ARMS DONE"
