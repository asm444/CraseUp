#!/usr/bin/env bash
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
versao="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$raiz/manifest.json")"
destino="$raiz/dist/craseup-$versao.zip"
mkdir -p "$raiz/dist"
rm -f "$destino"
cd "$raiz"
git ls-files -z -- manifest.json src icons | xargs -0 zip -q "$destino"
echo "$destino"
