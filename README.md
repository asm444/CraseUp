# CraseUp

Extensão gratuita para navegadores Chromium que revisa textos em português e em inglês enquanto você digita, em qualquer site.

- Sugere só o necessário: troca a palavra ou o trecho ruim, sem reescrever o resto.
- Nenhuma sugestão acrescenta mais de 10 palavras ao trecho que ela troca, venha de onde vier.
- Cada tipo de sugestão tem uma cor e um traço próprios:

| Tipo | Traço | Cor |
|---|---|---|
| Ortografia e gramática | ondulado | terracota `#E26D7C` |
| Clareza | contínuo | azul-petróleo `#2BB3C0` |
| Troca de palavra | pontilhado | âmbar `#EDAE49` |
| Tom | tracejado | lavanda-ameixa `#A88BB8` |

## Como a revisão funciona

Cada parágrafo editado passa por três camadas, da mais barata para a mais cara:

| Camada | Revisa | Onde roda | Quando roda |
|---|---|---|---|
| Dicionário offline | ortografia em pt-BR e en-US | dentro da extensão (Hunspell em WebAssembly) | sempre, mesmo sem internet |
| LanguageTool | gramática, crase, pontuação | no servidor que você configurar | sempre que houver servidor configurado |
| OpenRouter | clareza, troca de palavra, tom | em modelos gratuitos do OpenRouter, com a sua chave | só quando o LanguageTool acusa algo no parágrafo, ou quando você pede |

- O idioma de cada parágrafo é o do dicionário que reconhece mais palavras dele.
- O OpenRouter recebe uma lista de modelos gratuitos (`:free`) em ordem de preferência, em `src/core.js`. Se um modelo falhar por limite ou queda, o próprio OpenRouter passa para o seguinte, e o popup e o cartão mostram qual modelo atendeu. Só entram provedores que aceitam a resposta em JSON estruturado.
- Com o LanguageTool indisponível, o OpenRouter não é chamado, nem por pedido. Sem servidor configurado, sobra só a ortografia offline.
- Para pedir clareza e tom num texto em que o LanguageTool não acusou nada, use **Revisar clareza e tom nesta aba** no popup.
- O popup mostra o estado de cada camada e, quando uma está indisponível, se o motivo é falta de conexão ou falha do serviço. O cartão diz de qual camada veio cada sugestão.

## O cartão

Passar o mouse num sublinhado abre um cartão só para o trecho inteiro, com todas as correções dele já aplicadas na prévia: o texto antigo riscado e o novo destacado.

- Parágrafo de até 280 caracteres é um trecho só. Parágrafo maior se divide em frases, e cada frase com correção é um trecho.
- **Substituir** troca o trecho de uma vez, com todas as correções dele. Com mais de um trecho no campo, o cartão mostra `1 de N` e, depois de substituir, já passa para o trecho seguinte.
- O cartão fecha no ×, no Esc ou com um clique fora dele.
- O dicionário pessoal vale para as três camadas.

## Instalação

A extensão não está em nenhuma loja. A instalação é manual:

1. Baixe o `.zip` da [última release](../../releases) e descompacte numa pasta que não vá apagar.
2. Abra `chrome://extensions` (no Edge, `edge://extensions`; no Brave, `brave://extensions`).
3. Ative o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e escolha a pasta descompactada.

Na primeira vez, abre uma tela para configurar a chave do OpenRouter:

1. Crie uma chave em [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys). A conta gratuita basta, porque a extensão só usa modelos `:free`.
2. Cole a chave e clique em **Testar e salvar**.

A chave fica salva só no seu navegador (`chrome.storage.local`) e só é enviada para o OpenRouter.

## Servidor LanguageTool

O LanguageTool roda num servidor seu. O exemplo abaixo sobe o servidor numa máquina da sua rede Tailscale, acessível só por ela e iniciado manualmente.

### 1. Subir o servidor

Na máquina que vai hospedar o servidor (aqui, `skynet`), com `podman` (troque por `docker` se for o seu caso):

```bash
podman run -d --name languagetool -p "$(tailscale ip -4):8010:8010" docker.io/erikvl87/languagetool
```

O `-p "$(tailscale ip -4):8010:8010"` publica a porta só no endereço Tailscale da máquina, e não na rede local nem na internet. O servidor leva alguns segundos para começar a responder depois de subir.

Para parar e voltar a subir depois:

```bash
podman stop languagetool
podman start languagetool
```

Esse servidor não volta sozinho quando a máquina reinicia: é preciso rodar `podman start languagetool` de novo.

### 2. Conferir de outra máquina da tailnet

```bash
curl -s -d 'language=pt-BR' --data-urlencode 'text=Vou a praia amanhã.' http://skynet:8010/v2/check
```

A resposta é um JSON com um item em `matches` sugerindo "Vou à". Se a conexão for recusada, confira se o container está de pé (`podman ps`) e se o firewall da máquina libera a porta 8010 na interface `tailscale0`.

### 3. Configurar a extensão

1. Abra **Configurações** pelo popup.
2. Em **Servidor LanguageTool**, digite `http://skynet:8010`.
3. Clique em **Testar e salvar** e aceite o pedido de permissão do navegador para esse endereço.

Para desligar a camada, apague o endereço e clique em **Testar e salvar**. Quem não configurar servidor fica com a ortografia offline. A mesma tela aceita qualquer servidor LanguageTool, inclusive `https://api.languagetool.org/v2`.

## Privacidade

- Campos de senha e de cartão nunca são lidos.
- Só o parágrafo que você alterou é revisado, depois de uma pausa de ~1,2 s na digitação.
- O dicionário offline não envia nada para fora do navegador.
- O parágrafo vai para o servidor LanguageTool que você configurou e, quando o OpenRouter é chamado, para o provedor do modelo gratuito que atender.
- Você pode desligar a extensão numa aba pelo ícone dela, ou excluir sites inteiros nas configurações.
- Provedores de modelos gratuitos podem registrar os textos recebidos; a política de cada um aparece na página do modelo no OpenRouter. Não use a revisão de estilo em texto que não pode sair do seu controle.

## Cota

Os modelos gratuitos do OpenRouter têm limite por minuto e por dia; o limite diário sobe depois de comprar créditos ([tabela oficial](https://openrouter.ai/docs/api/reference/limits)). O OpenRouter só é chamado quando o LanguageTool acusa algo ou quando você pede, o que poupa a cota. Quando o limite do dia estoura, a camada pausa até o horário de volta informado pelo OpenRouter, sem atrapalhar a digitação, e aparece um `!` no ícone. O popup mostra quantas chamadas a extensão fez no dia, contadas pela própria extensão.

## Limites

- Idiomas: português do Brasil e inglês americano.
- Os dicionários carregam na primeira revisão depois que o navegador acorda a extensão, então essa revisão demora um pouco mais.
- Editores que desenham o texto em canvas, como o Google Docs, não são suportados.
- Editores de código (CodeMirror, Monaco, Ace) são ignorados de propósito.

## Desenvolvimento

```bash
bash tests/rodar.sh                      # testes no Chrome headless; sai 0 só se todas as páginas imprimirem PASSED
python3 tools/carregar-no-chrome.py      # carrega a extensão no Chromium do Playwright, com LanguageTool e OpenRouter simulados, e salva capturas
bash tools/vendorizar-ortografia.sh      # regera src/vendor/hunspell.js e src/dicionarios/
bash tools/empacotar.sh                  # gera dist/craseup-<versão>.zip para a release
python3 tools/gerar-icones.py icons
```

O link de doação aparece quando `DOACAO_URL` em `src/config.js` não está vazio.
