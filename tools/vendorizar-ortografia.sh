#!/usr/bin/env bash
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
trabalho="$(mktemp -d)"
trap 'rm -rf "$trabalho"' EXIT

cd "$trabalho"
npm init -y >/dev/null
npm install --ignore-scripts --no-audit --no-fund --silent \
  hunspell-asm@4.0.2 dictionary-pt@4.0.0 dictionary-en@4.0.0 esbuild@0.24.2

printf "import { loadModule } from 'hunspell-asm/dist/cjs/index.js';\nglobalThis.HunspellAsm = { loadModule };\n" > entrada.js
./node_modules/.bin/esbuild entrada.js --bundle --format=iife --platform=browser --target=chrome105 \
  --minify --log-level=error --outfile="$raiz/src/vendor/hunspell.js"
cp node_modules/hunspell-asm/LICENSE "$raiz/src/vendor/hunspell-asm.LICENSE"

destino="$raiz/src/dicionarios"
mkdir -p "$destino"
for par in pt:pt-BR en:en-US; do
  pacote="${par%%:*}"
  idioma="${par##*:}"
  cp "node_modules/dictionary-$pacote/index.aff" "$destino/$idioma.aff"
  cp "node_modules/dictionary-$pacote/index.dic" "$destino/$idioma.dic"
  cp "node_modules/dictionary-$pacote/license" "$destino/$idioma.LICENSE"
done
ls -la "$raiz/src/vendor" "$destino"
