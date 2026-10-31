import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix='revisor-capturas-'))
PAGINA_DE_DEMO = """
<!doctype html><meta charset="utf-8">
<body style="margin:0;padding:40px;background:#f4f1ec;font:16px/1.5 system-ui">
<h2 style="margin:0 0 12px">Novo e-mail</h2>
<textarea id="area" style="width:560px;height:110px;padding:12px;font:16px/1.5 system-ui;border:1px solid #ccc;border-radius:10px"></textarea>
</body>
"""
TEXTO_DE_DEMO = 'Oi, Ana! Eu vou mercado amanhã e depois eu volto pra casa açim que der, beleza?'
LANGUAGETOOL_SIMULADO = 'http://languagetool.exemplo:8010'
GEMINI_SIMULADO = """
const LANGUAGETOOL_SIMULADO = 'http://languagetool.exemplo:8010';
self.__chamadas = 0;
const fetchReal = self.fetch;
chrome.permissions.contains = async () => true;
self.fetch = async (url, opcoes) => {
  if (String(url).startsWith(LANGUAGETOOL_SIMULADO)) {
    const texto = new URLSearchParams(opcoes.body).get('text');
    const offset = texto.indexOf('vou mercado');
    const matches = offset < 0 ? [] : [{offset, length: 11, message: 'Ir pede a preposição "a".', replacements: [{value: 'vou ao mercado'}], rule: {issueType: 'grammar'}}];
    return new Response(JSON.stringify({matches}), {status: 200, headers: {'Content-Type': 'application/json'}});
  }
  if (!String(url).includes('generativelanguage.googleapis.com')) return fetchReal(url, opcoes);
  self.__chamadas++;
  const sugestoes = [
    {tipo: 'clareza', original: 'e depois eu volto', substituicao: 'e volto', motivo: '"Depois eu" é redundante aqui.'},
    {tipo: 'tom', original: 'beleza?', substituicao: 'certo?', motivo: 'Mais neutro para o tom padrão.'},
    {tipo: 'palavra', original: 'pra casa', substituicao: 'para a minha casa, que fica longe daqui, perto do centro da cidade', motivo: 'Mais de 10 palavras a mais: o filtro descarta.'},
  ];
  const corpo = {candidates: [{content: {parts: [{text: JSON.stringify({sugestoes})}]}}]};
  return new Response(JSON.stringify(corpo), {status: 200, headers: {'Content-Type': 'application/json'}});
};
0;
"""


def principal():
    SAIDA.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p, tempfile.TemporaryDirectory(prefix='revisor-perfil-') as perfil:
        contexto = p.chromium.launch_persistent_context(
            perfil,
            channel='chromium',
            headless=True,
            args=[f'--disable-extensions-except={RAIZ}', f'--load-extension={RAIZ}'],
        )
        trabalhador = contexto.service_workers[0] if contexto.service_workers else contexto.wait_for_event('serviceworker', timeout=15000)
        id_extensao = trabalhador.url.split('/')[2]
        print(f'SERVICE_WORKER: ok {trabalhador.url}')
        print(f'SW_IMPORTS: {trabalhador.evaluate("typeof RevisorCore.filtrarSugestoes + \'|\' + RevisorCore.MODELO")}')
        for frase in ('Eu volto pra casa açim que der.', 'I will recieve it tomorrow.'):
            r = trabalhador.evaluate('async (t) => { const r = await camadaOffline(t); return [r.estado, r.idioma, r.sugestoes.map((s) => s.original + "->" + s.substituicao)]; }', frase)
            print(f'OFFLINE: {r}')
        base = f'chrome-extension://{id_extensao}/src'

        abas_iniciais = [pg.url for pg in contexto.pages]
        print(f'BOAS_VINDAS_NA_INSTALACAO: {any("options.html?bemvindo=1" in u for u in abas_iniciais)}')

        opcoes = contexto.new_page()
        opcoes.set_viewport_size({'width': 900, 'height': 1250})
        opcoes.goto(f'{base}/options.html?bemvindo=1')
        opcoes.evaluate('chrome.storage.local.set({dicionario:["Arrudacorsi","Jusgrok"], sitesExcluidos:["banco.exemplo.com"]})')
        opcoes.wait_for_function('document.querySelectorAll(".chip").length === 3')
        print(f'OPCOES_CHIPS: {opcoes.locator(".chip").count()}')
        opcoes.screenshot(path=SAIDA / 'opcoes.png', full_page=True)

        opcoes.evaluate("""chrome.storage.local.set({
            uso: {data: new Date().toLocaleDateString('sv'), chamadas: 37},
            cota: {data: new Date().toLocaleDateString('sv')}})""")
        popup = contexto.new_page()
        popup.set_viewport_size({'width': 352, 'height': 560})
        popup.goto(f'{base}/popup.html')
        popup.wait_for_function('document.getElementById("chamadas").textContent === "37"')
        print(f'POPUP_CHAMADAS: {popup.text_content("#chamadas")} COTA_VISIVEL: {popup.is_visible("#cota")}')
        popup.screenshot(path=SAIDA / 'popup.png', full_page=True)
        print(f'SELO_COTA: {trabalhador.evaluate("chrome.action.getBadgeText({})")!r}')

        contexto.route('https://revisor.exemplo/**', lambda rota: rota.fulfill(content_type='text/html', body=PAGINA_DE_DEMO))
        demo = contexto.new_page()
        demo.set_viewport_size({'width': 760, 'height': 420})
        demo.goto('https://revisor.exemplo/')
        trabalhador.evaluate(GEMINI_SIMULADO)
        resposta = opcoes.evaluate("chrome.runtime.sendMessage({tipo: 'testarChave', chave: 'chave-de-teste'})")
        print(f'TESTAR_CHAVE_PELA_ABA_DE_OPCOES: {resposta}')
        opcoes.evaluate(f"chrome.storage.local.remove('cota').then(() => chrome.storage.local.set({{chave: 'chave-de-teste', languagetool: '{LANGUAGETOOL_SIMULADO}'}}))")
        demo.click('#area')
        demo.keyboard.type(TEXTO_DE_DEMO, delay=5)
        demo.wait_for_selector('.marca', timeout=10000)
        marcas = demo.locator('.marca')
        demo.wait_for_timeout(500)
        print(f'SUBLINHADOS: {[(marcas.nth(i).get_attribute("class"), marcas.nth(i).text_content()) for i in range(marcas.count())]}')
        print(f'CHAMADAS_AO_GEMINI: {trabalhador.evaluate("self.__chamadas")}')
        caixa = marcas.first.bounding_box()
        demo.mouse.move(caixa['x'] + caixa['width'] / 2, caixa['y'] + caixa['height'] / 2)
        demo.wait_for_selector('.cartao', timeout=5000)
        demo.wait_for_timeout(300)
        demo.screenshot(path=SAIDA / 'cartao.png')
        print(f'ORIGEM_NO_CARTAO: {demo.text_content(".cartao .origem")!r}')
        demo.click('.cartao .aplicar')
        print(f'TEXTO_APOS_APLICAR: {demo.input_value("#area")!r}')
        popup.reload()
        popup.wait_for_function('document.getElementById("camadaGemini").textContent !== ""')
        print(f'POPUP_CAMADAS: {[popup.text_content(i) for i in ("#camadaOffline", "#camadaLanguagetool", "#camadaGemini")]}')
        popup.screenshot(path=SAIDA / 'popup-camadas.png', full_page=True)

        contexto.close()
    print(f'CAPTURAS: {SAIDA}')


principal()
