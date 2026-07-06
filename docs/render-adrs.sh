#!/usr/bin/env bash
# Renders every docs/adr/NNNN-*.md into a standalone HTML page wrapped in the
# docs-site chrome, and regenerates docs/adr/index.html as the rendered index.
# ADRs are their own genre, not Explanation pages: they get one spelled-out nav
# entry, and this index (not the nav) enumerates them.
#
# Re-run after adding or editing an ADR:
#   bash docs/render-adrs.sh
#
# Requires pandoc (provided by the Nix dev shell).
set -euo pipefail

adr_dir="$(cd "$(dirname "$0")/adr" && pwd)"
cd "$adr_dir"

# The site nav, as seen from docs/adr/ (one level below the site root). The ADR
# entry is always current on these pages. Keep in step with the site nav above.
nav() {
  cat <<'NAV'
  <nav class="site-nav">
    <p class="nav-title">Inventoria</p>
    <a href="../index.html">Introduction</a>
    <div class="nav-section">
      <p class="nav-section-label">Reference</p>
      <a href="../glossary.html">Glossary</a>
      <a href="../eavt-vocabulary.html">EAVT Vocabulary</a>
    </div>
    <div class="nav-section">
      <p class="nav-section-label">Explanation</p>
      <a href="../append-only-ledger.html">State Is a Reading of the Past</a>
    </div>
    <div class="nav-section">
      <a href="index.html" class="active">Architectural Decision Records</a>
    </div>
  </nav>
NAV
}

# page <title> <body-html> -> a full site page on stdout.
page() {
  local title="$1" body="$2"
  cat <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} · Inventoria</title>
  <link rel="stylesheet" href="../assets/style.css">
</head>
<body>
<div class="page-wrapper">
$(nav)
  <div class="content-area">
    <main>
${body}
    </main>
  </div>
</div>
</body>
</html>
HTML
}

items="$(mktemp)"
trap 'rm -f "$items"' EXIT

for md in $(ls -1 [0-9]*.md | sort); do
  base="${md%.md}"
  num="${base%%-*}"
  raw="$(grep -m1 '^#' "$md" | sed -E 's/^#+[[:space:]]*//')"
  clean="$(printf '%s' "$raw" | sed -E 's/^(ADR )?[0-9]+[.:][[:space:]]*//; s/&/\&amp;/g')"
  body="$(pandoc -f gfm -t html --wrap=none "$md")"
  page "ADR ${num}" "$body" > "${base}.html"
  printf '        <li><a href="%s.html">ADR %s — %s</a></li>\n' "$base" "$num" "$clean" >> "$items"
done

index_body="$(cat <<BODY
      <h1>Architectural Decision Records</h1>
      <p class="subtitle">The decisions that shaped Inventoria, in the order they were made.</p>
      <p>
        Each record states a decision, the context that forced it, and the consequences the
        project accepted. They are rendered from the Markdown under <code>docs/adr/</code>;
        re-run <code>docs/render-adrs.sh</code> after adding or changing one.
      </p>
      <ul class="adr-index">
$(cat "$items")
      </ul>
BODY
)"

page "Architectural Decision Records" "$index_body" > index.html

echo "Rendered $(ls -1 [0-9]*.html | wc -l) ADRs and index.html into $adr_dir"
