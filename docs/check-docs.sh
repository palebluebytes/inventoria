#!/usr/bin/env bash
# Mechanical checks for a Diátaxis docs site. Seeded from the diataxis skill's
# template/ on first run; the skill's Evaluate step runs it and fixes or defers
# everything it prints. It is also runnable standalone (CI, pre-commit, by hand):
#
#   bash docs/check-docs.sh
#
# FAIL lines set a nonzero exit; WARN lines need an eyeball but do not fail.
# Every check runs over every page, every time — so a rule can never be
# enforced only at audit time and miss a first run's output.
#
# Scope: authored pages are docs/*.html. Rendered projections (adr/NNNN-*.html)
# inherit their sources' prose and are exempt from style greps, but adr/index.html
# is script-authored chrome and is not.
# shellcheck disable=SC2086,SC2015,SC2013  # word-splitting page lists is intentional; note() never fails
set -uo pipefail

docs="$(cd "$(dirname "$0")" && pwd)"
cd "$docs" || exit 1

fail=0
FAIL() { fail=1; printf 'FAIL %s\n' "$*"; }
WARN() { printf 'WARN %s\n' "$*"; }
note() { printf '  ok %s\n' "$*"; }

authored=$(ls -- *.html 2>/dev/null)
[ -n "$authored" ] || { echo "no pages yet; nothing to check"; exit 0; }
chrome=""
[ -f adr/index.html ] && chrome="adr/index.html"

# ── 1. Em-dashes (outside <pre> blocks and <code> spans) ─────────────────────
hits=$(awk '
  /<pre/  {inpre=1} /<\/pre>/ {inpre=0; next}
  !inpre && /—/ {
    line=$0; gsub(/<code>[^<]*<\/code>/,"",line)
    if (line ~ /—/) printf "%s:%d\n", FILENAME, FNR
  }' $authored $chrome)
[ -z "$hits" ] && note "no em-dashes" || FAIL "em-dash outside code at: $(echo $hits | tr '\n' ' ')"

# ── 2. Word-tells ────────────────────────────────────────────────────────────
tells='crucial|robust|seamless|comprehensive|powerful|delve|leverage|foster|underscore|streamline|It.s important to note|In essence'
hits=$(grep -niE "$tells" $authored $chrome 2>/dev/null | grep -v '^\s*$' || true)
[ -z "$hits" ] && note "no word-tells" || FAIL "word-tell: $(echo "$hits" | head -5)"

# ── 3. Paragraphs past four sentences (candidates; verify by eye) ────────────
hits=$(awk -v RS='</p>' '
  {
    i = match($0, /<p[ >]/); if (i == 0) next
    block = substr($0, i)
    gsub(/<[^>]*>/, " ", block)
    gsub(/e\.g\.|i\.e\.|vs\.|etc\./, "", block)
    n = gsub(/[.!?]+/, "&", block)
    if (n > 4) printf "%s(~%d sentences) ", FILENAME, n
  }' $authored)
[ -z "$hits" ] && note "no paragraph past four sentences" || WARN "long paragraph candidates: $hits"

# ── 4. Every relative link and anchor resolves ───────────────────────────────
badlinks=""
for f in $authored $chrome $(ls adr/[0-9]*.html 2>/dev/null); do
  dir=$(dirname "$f")
  for href in $(grep -o 'href="[^"]*"' "$f" | sed 's/^href="//;s/"$//' | sort -u); do
    case "$href" in http://*|https://*|mailto:*) continue ;; esac
    path=${href%%#*}; frag=""
    case "$href" in *'#'*) frag=${href#*#} ;; esac
    target="$f"
    if [ -n "$path" ]; then
      target="$dir/$path"
      [ -f "$target" ] || { badlinks="$badlinks $f->$href"; continue; }
    fi
    if [ -n "$frag" ]; then
      grep -q "id=\"$frag\"" "$target" || badlinks="$badlinks $f->#$frag"
    fi
  done
done
[ -z "$badlinks" ] && note "all links and anchors resolve" || FAIL "broken:$badlinks"

# ── 5. Nav: index.html is canonical; every page's nav must match it ──────────
# All whitespace is stripped before comparing: formatters re-wrap attributes,
# and nav equality is about links and labels, not line breaks.
nav_of() { awk '/<nav class="site-nav">/,/<\/nav>/' "$1" | sed 's/ class="active"//g' | tr -d ' \t\n'; }
if [ -f index.html ]; then
  canon=$(nav_of index.html)
  drift=""
  for f in $authored; do
    [ "$(nav_of "$f")" = "$canon" ] || drift="$drift $f"
  done
  [ -z "$drift" ] && note "nav matches index.html on every page" || FAIL "nav drift (diff against index.html):$drift"
  # every authored page appears in the canonical nav; ADR entry present when adr/ exists
  missing=""
  for f in $authored; do
    echo "$canon" | grep -q "href=\"$f\"" || missing="$missing $f"
  done
  [ -z "$missing" ] && note "nav lists every page" || FAIL "pages absent from nav:$missing"
  if [ -d adr ]; then
    echo "$canon" | grep -q 'href="adr/index.html"' || FAIL "nav lacks the Architectural Decision Records entry"
  fi
fi

# ── 6. Glossary Used-in lines match the pages that actually link each term ───
if [ -f glossary.html ]; then
  drift=""
  for t in $(grep -o 'id="term-[a-z-]*"' glossary.html | sed 's/id="term-//;s/"//'); do
    actual=$(grep -l "glossary\.html#term-$t\"" $authored 2>/dev/null | grep -v '^glossary.html$' | sort | tr '\n' ',' )
    recorded=$(awk -v RS='</dd>' -v term="id=\"term-$t\"" '
      index($0, term) {
        i = index($0, "glossary-source"); if (i == 0) next
        s = substr($0, i)
        while (match(s, /href="[^"]*"/)) {
          printf "%s\n", substr(s, RSTART+6, RLENGTH-7)
          s = substr(s, RSTART+RLENGTH)
        }
      }' glossary.html | sort | tr '\n' ',')
    [ "$actual" = "$recorded" ] || drift="$drift
  term-$t: recorded [$recorded] actual [$actual]"
  done
  [ -z "$drift" ] && note "Used-in lines match reality" || FAIL "Used-in drift (write what the grep finds):$drift"
fi

# ── 7. Rendered output matches its generator (re-render changes nothing) ─────
# Hash-compare, not git-compare: catches a stale render (source .md edited,
# render not re-run) and formatter interference (a hook rewrote the output),
# without failing on work that is simply not committed yet.
if [ -f render-adrs.sh ] && [ -d adr ]; then
  before=$(cksum adr/*.html 2>/dev/null | sort)
  bash render-adrs.sh >/dev/null
  after=$(cksum adr/*.html 2>/dev/null | sort)
  [ "$before" = "$after" ] && note "re-render changes nothing" \
    || FAIL "re-render changed adr/*.html: the render was stale or a formatter rewrote the output"
fi

[ $fail -eq 0 ] && echo "PASS: all mechanical checks clean" || echo "checks failed; fix or defer each FAIL above"
exit $fail
