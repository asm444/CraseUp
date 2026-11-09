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

## Desfecho

Fechado em 2026-11-09, no HEAD `9024cd2` (v0.13.17). Cada correção tem teste que falha no código anterior e passa no novo; as hipóteses refutadas foram medidas com a extensão carregada de verdade no Chromium do Playwright.

| Vetor | Desfecho | Onde |
|---|---|---|
| S1 | corrigido: botões e seletor de tom do cartão só agem com evento do usuário (`isTrusted`) | `9932619` v0.13.6 |
| S2 | corrigido: revisão automática só no campo com tecla, colagem ou soltura reais nos últimos 15 s; teto de 15 chamadas ao modelo por aba por minuto (o OpenRouter permite 20 por chave nos modelos gratuitos) | `f61215a` v0.13.7, `a5afc2f` v0.13.8, testes em `153d3c3` v0.13.9 |
| S3 | corrigido: sombra da camada fechada | `dc2126f` v0.13.4 |
| S4 | demonstrado (a página leu `açim`, `tambem`, `estranhu` em `CSS.highlights`) e corrigido: marcas do contenteditable desenhadas na sombra fechada; a página lê `{}` | `2c381c9` v0.13.13 |
| S5 | corrigido: nenhum arquivo em `web_accessible_resources`; o estilo da camada vem num script do content script | `6585711` v0.13.11 |
| S6 | corrigido: a chave não volta ao campo nem fica nele depois de salvar | `e49aef7` v0.13.3, `ef66411` v0.13.12 |
| S7 | demonstrado (servidor falso em 8010 recebeu o texto mascarado) e mitigado: só envia depois de `/v2/languages` responder como LanguageTool com pt-BR | `374e36d` v0.13.14 |
| S8 | refutado depois de S1/S2: iframe de outra origem com input sintético, mutação, `execCommand` e `keydown` falso não gerou envio; só digitação real revisa | sem código |
| S9 | corrigido: só o botão direito real escolhe o texto da verificação | `259d2e2` v0.13.10 |
| S10 | refutado depois de S1–S4: extensão com content script no mundo da página não gerou envio, leu a sombra como `null` e nenhum realce | sem código |
| S11 | refutado: um site que conhece o id não abre `tests/*.html` (`fetch` falha; o iframe mostra só a página de erro) | sem código |
| S12 | logs e cabeçalhos limpos; corrigido: senha mascarada por CSS, PIN, token, código de verificação, CPF e chave de API deixam de ser revisados | `9dc0044` v0.13.15 |
| S13 | demonstrado (sugestão do modelo saiu como `offline`) e corrigido: a origem é carimbada pela camada | `56c094d` v0.13.16 |
| S14 | achado na sonda da S10 e mitigado: o elemento da camada tem nome sorteado por página | `9024cd2` v0.13.17 |

Confidencialidade do texto: desde `b350ea0` v0.13.0 (OpenRouter) e `6fa0325` v0.13.2 (LanguageTool), dados sensíveis saem como marcadores `[TIPO_n]` e voltam só no navegador.

## Limites conhecidos

- S7: um impostor que imite `/v2/languages` passa na conferência; ele recebe o texto já mascarado.
- S14/R9: uma página descobre que o CraseUp está instalado. O elemento `craseup-camada` fica sob `<html>` desde a primeira marca ou cartão até a página fechar, com `z-index` fixo, e um `MutationObserver` o vê entrar. O sorteio do nome (v0.13.17) não escondia nada e saiu; o tema deixou de ficar em atributo do elemento. Aceito: o que vaza é a presença, e não texto, sugestão ou chave, que seguem na sombra fechada e atrás de `isTrusted`.
- A chave do OpenRouter fica em claro no `storage.local` do perfil (diretório `drwx------`).
- `sensivel()` usa `\b` sem a flag `u`: "pinça" casa `pin` e o campo deixa de ser revisado; `otp`, `cnpj`, `ssn`, `segredo`, `secret` e `api key` não têm caso de teste.
- O teto por aba e as conferências do servidor zeram quando o service worker reinicia; o teto do OpenRouter continua valendo.
