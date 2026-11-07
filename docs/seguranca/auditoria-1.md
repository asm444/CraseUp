# Auditoria de segurança 1

Feita em 2026-11-07 sobre o HEAD `b6ced74` (v0.11.0) e o working tree daquele momento, com o Chrome sem janela, perfil descartável, chave falsa e o `fetch` do service worker trocado por respostas simuladas. Nenhum texto foi enviado ao OpenRouter.

## Conclusão

Uma página web, ou um script de terceiro rodando nela, comanda o content script da extensão por eventos que ela mesma gera. Com isso ela gasta a chave do OpenRouter, lê sugestões e reescritas, envenena o dicionário de todos os sites e detecta a extensão. Outra extensão não alcança o background: não existe `onMessageExternal`, `onConnectExternal` nem `externally_connectable`, e `sendMessage`/`connect` com o id do CraseUp recebem `Receiving end does not exist`.

Filtrar o remetente no background não resolve: quem fala com o background é o próprio content script.

## Vetores demonstrados

| Task | Vetor | Onde | Prova |
|---|---|---|---|
| S1 | `change` sintético no seletor de tom pede reescrita com a chave e a página lê o resultado em `.para-tom`; `click` sintético em "Adicionar ao dicionário" grava palavra que vale em todos os sites | `src/content.js` seletor de tom, `reescrever`, `adicionarAoDicionario` | requisição com `Authorization: Bearer <chave>`; palavra gravada em `e.teste` suprimiu a marca em `f.teste` |
| S2 | `input` sintético, `focus()` + mutação de DOM em contenteditable e `execCommand('insertText')` disparam revisões que vão ao LanguageTool e, quando ele aponta erro, ao OpenRouter | `aoDigitar`, `aoFocar` (MutationObserver), `pedirRevisao` | `uso.chamadas` de 0 para 2 e para 4; com a guarda `isTrusted` os dois últimos caminhos continuaram enviando |
| S3 | shadow root `mode: 'open'` expõe marcas, cartão, origem da sugestão e id da extensão | `garantirCamada` | leitura feita pela página de teste |
| S5 | `web_accessible_resources` expõe `src/camada.css` a qualquer site, sem `use_dynamic_url` | `manifest.json` | `fetch` da página recebeu 200 e 5557 bytes (`wc -c src/camada.css` = 5557) |
| S6 | a chave salva volta ao campo de senha das configurações | `src/options.js` | leitura do campo |

A chave também fica em claro no LevelDB do perfil (`Local Extension Settings/<id>/`, diretório `drwx------`); não há correção pequena para isso, e fica registrado como limite.

## Hipóteses ainda não demonstradas

| Task | Hipótese |
|---|---|
| S4 | a página lê os realces `revisor-*` de `CSS.highlights` e descobre o que foi marcado em contenteditable |
| S7 | outra conta da máquina ocupa a porta 8010 e recebe o texto enviado ao LanguageTool local |
| S8 | iframe de terceiro (`all_frames`) tem o mesmo poder da página |
| S9 | `contextmenu` sintético troca o texto que "Verificar com o CraseUp" verifica |
| S10 | outra extensão com permissão de host injeta script na página e herda S1–S3 |
| S11 | carregar sem compactação a partir da raiz torna `tests/*.html` páginas da extensão |
| S12 | a função `sensivel`, o cabeçalho `X-Title` e os logs não foram mapeados |

## Fora desta auditoria

`src/protecao.js` ainda não estava ligado a nenhum envio; isso é das tasks de mascaramento.

## Como reproduzir

Os scripts de prova ficaram em `~/.cache/craseup-sonda/dirigir.mjs` e `~/.cache/craseup-falseador-scripts/sonda.mjs` (fora do repositório):

```bash
timeout 300 node ~/.cache/craseup-sonda/dirigir.mjs
S=~/.cache/craseup-falseador-scripts/sonda.mjs; B=~/.cache/craseup-falseador
timeout 280 node $S $B/ext-wt down $B/perfil-a
timeout 280 node $S $B/ext-istrusted up $B/perfil-b
timeout 280 node $S $B/ext-head up $B/perfil-c
```
