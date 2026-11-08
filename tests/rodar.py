import asyncio
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

RAIZ = Path(__file__).resolve().parent
PRONTO = "(() => { const r = document.getElementById('resultado'); return r && r.textContent !== 'NAO EXECUTADO'; })()"


async def rodar_pagina(navegador, pagina):
    aba = await navegador.new_page(viewport={'width': 1280, 'height': 900})
    await aba.expose_function('cliqueReal', lambda x, y: aba.mouse.click(x, y))
    await aba.expose_function('teclarReal', lambda texto: aba.keyboard.type(texto))
    await aba.expose_function('apertarReal', lambda tecla: aba.keyboard.press(tecla))
    await aba.goto(pagina.as_uri())
    try:
        await aba.wait_for_function(PRONTO, timeout=180_000)
        saida = await aba.inner_text('#resultado')
    except Exception as erro:
        saida = f'SEM RESULTADO: {erro}'
    await aba.close()
    return saida


async def principal():
    falhas = 0
    async with async_playwright() as p:
        navegador = await p.chromium.launch(channel='chrome', headless=True, args=['--allow-file-access-from-files'])
        for pagina in sorted(RAIZ.glob('*.html')):
            saida = await rodar_pagina(navegador, pagina)
            print(f'== {pagina.name}')
            print(saida, flush=True)
            if not re.search(r'^PASSED ', saida, re.M):
                falhas += 1
        await navegador.close()
    return falhas


sys.exit(asyncio.run(principal()))
