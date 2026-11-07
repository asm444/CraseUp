import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

TAMANHOS = (16, 32, 48, 128)
CHROME = next((c for c in ('google-chrome', 'chromium', 'chromium-browser') if shutil.which(c)), None)


def rasterizar(svg, tamanho, saida, pasta):
    pagina = pasta / f'icone-{tamanho}.html'
    pagina.write_text(
        f'<!doctype html><style>html,body{{margin:0}}svg{{width:{tamanho}px;height:{tamanho}px;display:block}}</style>{svg}',
        encoding='utf-8',
    )
    subprocess.run(
        [CHROME, '--headless=new',
         '--default-background-color=00000000', f'--window-size={tamanho},{tamanho}',
         f'--screenshot={saida}', pagina.as_uri()],
        check=True, capture_output=True,
    )


if not CHROME:
    sys.exit('Precisa do google-chrome ou do chromium para rasterizar o ícone.')
destino = Path(sys.argv[1])
svg = (Path(__file__).resolve().parent.parent / 'icons' / 'icone.svg').read_text(encoding='utf-8')
with tempfile.TemporaryDirectory() as pasta:
    for tamanho in TAMANHOS:
        saida = destino / f'icone-{tamanho}.png'
        rasterizar(svg, tamanho, saida, Path(pasta))
        print(saida.name)
