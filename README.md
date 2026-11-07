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
| LanguageTool | gramática, crase, pontuação | no servidor que você configurar, ou nesta máquina em `http://localhost:8010` | sempre que o servidor responder |
| OpenRouter | clareza, troca de palavra, tom e a pontuação que o LanguageTool deixa passar (vírgula do vocativo, da oração que vem antes da principal) | em modelos gratuitos do OpenRouter, com a sua chave | só quando o LanguageTool acusa algo no parágrafo, ou quando você pede |

- O idioma de cada parágrafo é o do dicionário que reconhece mais palavras dele.
- O OpenRouter recebe uma lista de modelos gratuitos (`:free`) em ordem de preferência, em `src/core.js`. Se um modelo falhar por limite ou queda, o próprio OpenRouter passa para o seguinte, e o popup e o cartão mostram qual modelo atendeu. Só entram provedores que aceitam a resposta em JSON estruturado.
- Com o LanguageTool indisponível, o OpenRouter não é chamado, nem por pedido. Com o servidor fora do ar, sobra só a ortografia offline.
- Para pedir clareza e tom num texto em que o LanguageTool não acusou nada, use **Revisar clareza e tom nesta aba** no popup.
- O popup mostra o estado de cada camada e, quando uma está indisponível, se o motivo é falta de conexão ou falha do serviço. O cartão diz de qual camada veio cada sugestão.

## O cartão

Passar o mouse num sublinhado abre um cartão só para o trecho inteiro, com todas as correções dele já aplicadas na prévia: o texto antigo riscado e o novo destacado.

- Parágrafo de até 280 caracteres é um trecho só. Parágrafo maior se divide em frases, e cada frase com correção é um trecho.
- **Substituir** troca o trecho de uma vez, com todas as correções dele. Com mais de um trecho no campo, o cartão mostra `1 de N` e, depois de substituir, já passa para o trecho seguinte.
- O cartão fecha no ×, no Esc ou com um clique fora dele.
- O seletor **Tom** do cartão reescreve o trecho num destes tons: formal, profissional, neutro, amigável, casual, confiante, empático, persuasivo, LinkedIn ou advogado. A prévia mostra a reescrita, e **Substituir** troca o trecho por ela. A reescrita usa uma chamada do OpenRouter e não muda o tom padrão, que fica nas configurações com as mesmas dez opções.
  - **LinkedIn** deixa o texto com cara de ambiente de trabalho: troca verbos vagos (fiz, ajudei, mexi) por verbos de ação e resultado (entreguei, implementei, liderei) e foca no impacto.
  - **Advogado** escreve de forma defensiva: afirma só o que dá para provar, põe ressalva no lugar de afirmação absoluta, não admite culpa nem assume obrigação ou prazo.
- O dicionário pessoal vale para as três camadas.

## Verificar pelo botão direito

Clique com o botão direito num campo de texto, ou num texto selecionado, e escolha **Verificar com o CraseUp**. O cartão abre no ponto do clique com a versão revisada pelo OpenRouter: ortografia, acentuação, pontuação, maiúsculas e minúsculas, gramática e uma escrita mais clara, mantendo o sentido e o tom.

- Com texto selecionado, verifica só a seleção; sem seleção, o campo inteiro (até 4000 caracteres).
- A prévia risca as palavras que saem e destaca as que entram. **Substituir** troca só essas palavras, então negrito, link e menção do resto do texto ficam como estavam, e as quebras de linha que você escreveu são mantidas.
- Citação (bloco de resposta citada) e trechos não editáveis do campo ficam fora da verificação.
- O seletor **Tom** refaz a verificação num dos dez tons; **Manter** volta ao tom do original.
- Em texto selecionado fora de um campo editável, o botão é **Copiar**.
- Cada verificação é uma chamada do OpenRouter e conta na cota do dia.

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

Sem servidor configurado, a extensão usa o LanguageTool desta máquina em `http://localhost:8010`. Para subir esse servidor, com `podman` ou `docker` instalado:

```bash
make instalar              # sobe o LanguageTool local e mostra como carregar a extensão
make languagetool-status   # confere se ele responde
make languagetool-parar    # para o servidor
```

O container publica a porta só em `127.0.0.1` e é criado com `--restart unless-stopped`. Com `docker`, ele volta sozinho quando a máquina reinicia; com `podman` sem root, isso depende do serviço `podman-restart` estar ativo (`systemctl --user enable --now podman-restart`).

### Usar outro servidor

Em **Configurações → Servidor LanguageTool**, digite o endereço (por exemplo `http://skynet:8010`, numa máquina da sua rede Tailscale), clique em **Testar e salvar** e aceite o pedido de permissão do navegador. O endereço salvo vale no lugar do local; apagar o campo volta ao `http://localhost:8010`. A mesma tela aceita qualquer servidor LanguageTool, inclusive `https://api.languagetool.org/v2`.

Para subir o servidor numa máquina da tailnet, publicando a porta só no endereço Tailscale dela:

```bash
podman run -d --name languagetool -p "$(tailscale ip -4):8010:8010" docker.io/erikvl87/languagetool
```

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
make testes                              # o mesmo que bash tests/rodar.sh
make pacote                              # o mesmo que bash tools/empacotar.sh
bash tests/rodar.sh                      # testes no Chrome headless; sai 0 só se todas as páginas imprimirem PASSED
python3 tools/carregar-no-chrome.py      # carrega a extensão no Chromium do Playwright, com LanguageTool e OpenRouter simulados, e salva capturas
bash tools/vendorizar-ortografia.sh      # regera src/vendor/hunspell.js e src/dicionarios/
bash tools/empacotar.sh                  # gera dist/craseup-<versão>.zip para a release
python3 tools/gerar-icones.py icons
```

O link de doação aparece quando `DOACAO_URL` em `src/config.js` não está vazio.
