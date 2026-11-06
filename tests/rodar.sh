#!/usr/bin/env bash
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
falhas=0
for pagina in "$raiz"/tests/*.html; do
  saida="$(google-chrome --headless=new --disable-gpu --no-first-run --allow-file-access-from-files \
    --virtual-time-budget=60000 --dump-dom "file://$pagina" 2>/dev/null \
    | python3 -c 'import sys,re,html; m=re.search(r"<pre id=\"resultado\">(.*?)</pre>", sys.stdin.read(), re.S); print(html.unescape(m.group(1)) if m else "SEM RESULTADO")')"
  echo "== $(basename "$pagina")"
  echo "$saida"
  grep -q '^PASSED ' <<<"$saida" || falhas=$((falhas + 1))
done
exit "$falhas"
