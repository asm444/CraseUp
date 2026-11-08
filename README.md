<p align="center"><img src="icons/icone-128.png" width="96" alt="CraseUp"></p>

# CraseUp

[Português](#português) · [English](#english)

---

## Português

O CraseUp revisa o que você escreve em português e em inglês, em qualquer site, enquanto você digita. Ele sublinha só o que precisa mudar e mostra a correção num cartão ao lado do campo; um clique troca o trecho.

- Sugere só o necessário: troca a palavra ou o trecho ruim, sem reescrever o resto.
- Nenhuma sugestão acrescenta mais de 10 palavras ao trecho que ela troca, venha de onde vier, inclusive a reescrita no tom e a verificação pelo botão direito.
- Reescreve o trecho em dez tons, entre eles **LinkedIn**, de ambiente de trabalho, e **Advogado**, de escrita defensiva.
- Mostra quanto você usou por dia, mês e ano, quantos tokens isso gastou, quanto custaria num modelo pago e quanto tempo de revisão você poupou.
- É gratuito: usa modelos gratuitos do OpenRouter com a sua chave, o LanguageTool na sua máquina e um dicionário offline.

### 1. Instalar

Precisa de `git`, `make` e `podman` ou `docker`.

1. Baixe o projeto e suba o LanguageTool nesta máquina:
   ```bash
   git clone https://github.com/asm444/CraseUp
   cd CraseUp
   make instalar
   ```
   O `make instalar` sobe o LanguageTool em `http://localhost:8010`, publicado só para esta máquina, espera ele responder e mostra os passos seguintes.
2. Abra `chrome://extensions` (no Edge, `edge://extensions`; no Brave, `brave://extensions`) e ligue o **Modo do desenvolvedor**, no canto superior direito.
3. Clique em **Carregar sem compactação** e escolha a pasta `CraseUp`.
4. Fixe o ícone do CraseUp na barra do navegador.

Sem `git`, baixe o `.zip` da [última release](../../releases), descompacte numa pasta que não vá apagar e siga do passo 2. Nesse caso, o LanguageTool precisa estar em algum servidor seu (veja [Servidor LanguageTool](#servidor-languagetool)).

### 2. Colar a chave do OpenRouter (uma vez só)

Na primeira vez, a extensão abre a tela de configurações.

1. Crie uma chave em [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys). A conta gratuita basta, porque a extensão só usa modelos `:free`.
2. Cole a chave em **Chave do OpenRouter** e clique em **Testar e salvar**.

Pronto: comece a digitar em qualquer site. A chave fica salva só neste navegador (`chrome.storage.local`) e só é enviada ao OpenRouter.

### Como a revisão funciona

Cada parágrafo editado passa por três camadas, da mais barata para a mais cara:

| Camada | Revisa | Onde roda | Quando roda |
|---|---|---|---|
| Dicionário offline | ortografia em pt-BR e en-US | dentro da extensão (Hunspell em WebAssembly) | sempre, mesmo sem internet |
| LanguageTool | gramática, crase, pontuação | nesta máquina em `http://localhost:8010`, ou no servidor que você configurar | sempre que o servidor responder |
| OpenRouter | clareza, troca de palavra, tom e a pontuação que o LanguageTool deixa passar | em modelos gratuitos do OpenRouter, com a sua chave | só quando o LanguageTool acusa algo no parágrafo, ou quando você pede |

- O idioma de cada parágrafo é o do dicionário que reconhece mais palavras dele.
- O OpenRouter recebe uma lista de modelos gratuitos em ordem de preferência, em `src/core.js`. Se um falhar por limite ou queda, o próprio OpenRouter passa para o seguinte, e o cartão mostra qual atendeu.
- Com o LanguageTool fora do ar, o OpenRouter não é chamado, nem por pedido, e sobra a ortografia offline.
- Para pedir clareza e tom num texto em que o LanguageTool não acusou nada, use **Revisar clareza e tom nesta aba** no popup.
- O popup mostra o estado de cada camada e há quanto tempo ela respondeu.

Cada tipo de sugestão tem um traço próprio:

| Tipo | Traço |
|---|---|
| Ortografia e gramática | ondulado, coral |
| Clareza | contínuo, jade |
| Troca de palavra | pontilhado, açafrão |
| Tom | tracejado, íris |

### O cartão

Passe o mouse num sublinhado: o cartão abre colado ao campo, com todas as correções do trecho já aplicadas na prévia, o texto antigo riscado e o novo destacado.

- **Substituir** troca o trecho de uma vez. Com mais de um trecho no campo, o cartão mostra `1 de N` e, depois de substituir, passa para o seguinte.
- Parágrafo de até 280 caracteres é um trecho só; parágrafo maior se divide em frases.
- O seletor **Tom** reescreve o trecho num destes tons: formal, profissional, neutro, amigável, casual, confiante, empático, persuasivo, LinkedIn ou advogado. O texto muda dentro do mesmo cartão, sem ele piscar nem trocar de lugar.
  - **LinkedIn** troca verbos vagos (fiz, ajudei, mexi) por verbos de ação e resultado (entreguei, implementei, liderei) e foca no impacto.
  - **Advogado** afirma só o que dá para provar, põe ressalva no lugar de afirmação absoluta e não admite culpa, obrigação nem prazo.
- O cartão fecha no ×, no Esc ou com um clique fora dele.
- O dicionário pessoal, em **Configurações**, vale para as três camadas.

### Verificar pelo botão direito

Clique com o botão direito num campo de texto, ou num texto selecionado, e escolha **Verificar com o CraseUp**. O cartão abre junto do campo com a versão revisada: ortografia, acentuação, pontuação, maiúsculas, gramática e uma escrita mais clara, mantendo o sentido e o tom.

- Com texto selecionado, verifica só a seleção; sem seleção, o campo inteiro, até 4000 caracteres.
- **Substituir** troca só as palavras que mudaram, então negrito, link e menção do resto do texto ficam como estavam.
- O seletor **Tom** refaz a verificação num dos dez tons; **Manter** volta ao tom do original.
- Fora de um campo editável, o botão é **Copiar**.
- Se o modelo inventar texto (mais de 10 palavras a mais que o original), o cartão recusa a resposta e pede para tentar de novo.

### Consumo

- O popup mostra o consumo de hoje: tokens, quanto custaria pelo preço da versão paga de cada modelo, o tempo poupado e uma linha por modelo.
- Em **Configurações → Consumo**, o gráfico mostra chamadas, tokens, tempo poupado ou custo equivalente por **Dia**, **Mês** ou **Ano**, no intervalo que você escolher no calendário. Clique num número do topo para trocar a métrica; passe o mouse numa barra para ver cada modelo; **Ver como tabela** mostra os números.
- O tempo poupado é a estimativa que o próprio modelo devolve de quanto você levaria para fazer a correção sozinho.
- O preço da versão paga vem da lista de modelos do OpenRouter, consultada uma vez por dia. Modelo sem versão paga aparece como "—".
- Tudo é contado pela extensão e fica só neste navegador.

### Aparência

O tema segue o do sistema. O botão de sol e lua, no popup e nas configurações, alterna entre claro e escuro, e **Configurações → Aparência** fixa **Automático**, **Claro** ou **Escuro**. A escolha vale para o popup, as configurações e o cartão.

### Servidor LanguageTool

Sem endereço configurado, a extensão usa `http://localhost:8010`, que o `make instalar` sobe.

```bash
make languagetool          # sobe ou religa o LanguageTool local
make languagetool-status   # confere se ele responde
make languagetool-parar    # para o servidor
```

O container é criado com `--restart unless-stopped`. Com `docker`, ele volta sozinho quando a máquina reinicia; com `podman` sem root, ative `systemctl --user enable --now podman-restart`.

Para usar outro servidor, digite o endereço em **Configurações → Servidor LanguageTool** (por exemplo `http://skynet:8010`, numa máquina da sua rede Tailscale), clique em **Testar e salvar** e aceite o pedido de permissão. O endereço salvo vale no lugar do local; apagar o campo volta ao `http://localhost:8010`. Para subir o servidor numa máquina da tailnet, publicando a porta só no endereço Tailscale dela:

```bash
podman run -d --name languagetool -p "$(tailscale ip -4):8010:8010" docker.io/erikvl87/languagetool
```

### Privacidade

- Campos de senha e de cartão nunca são lidos.
- Só o parágrafo que você alterou é revisado, depois de uma pausa de ~1,2 s na digitação.
- O dicionário offline não envia nada para fora do navegador.
- O parágrafo vai para o servidor LanguageTool e, quando o OpenRouter é chamado, para o provedor do modelo gratuito que atender. Provedores gratuitos podem registrar os textos; a política de cada um aparece na página do modelo no OpenRouter. Não use a revisão de estilo em texto que não pode sair do seu controle.
- Você desliga a extensão numa aba pelo popup, ou exclui sites inteiros em **Configurações → Sites sem revisão**.

### Cota

Os modelos gratuitos do OpenRouter têm limite por minuto e por dia ([tabela oficial](https://openrouter.ai/docs/api/reference/limits)). O OpenRouter só é chamado quando o LanguageTool acusa algo ou quando você pede, o que poupa a cota. Quando o limite do dia estoura, a camada pausa até o horário de volta informado pelo OpenRouter e aparece um `!` no ícone.

### Problemas comuns

- **A camada LanguageTool aparece "Indisponível: falha do serviço"**: o servidor não respondeu. Rode `make languagetool-status`; se ele não responder, `make languagetool`. O servidor leva alguns segundos para começar a responder depois de subir.
- **O cartão diz "o modelo inventou texto que não estava no original"**: a resposta passou do teto de 10 palavras a mais. Tente de novo; outro modelo da lista pode atender.
- **"A cota de hoje dos modelos gratuitos acabou"**: espere o horário de volta ou compre créditos no OpenRouter, o que sobe o limite diário.
- **Nada é sublinhado no Google Docs**: editores que desenham o texto em canvas não são suportados. Editores de código (CodeMirror, Monaco, Ace) são ignorados de propósito.

### Desenvolvimento

```bash
make testes                            # suítes no Chrome sem janela; precisa de google-chrome, python3 e o pacote playwright (pip install playwright)
make pacote                            # gera dist/craseup-<versão>.zip
python3 tools/gerar-icones.py icons    # gera os PNGs a partir de icons/icone.svg
bash tools/vendorizar-ortografia.sh    # regera src/vendor/hunspell.js e src/dicionarios/
python3 tools/carregar-no-chrome.py    # carrega a extensão no Chromium do Playwright, com LanguageTool e OpenRouter simulados, e salva capturas
```

[Gostou? Um cafezinho é sempre uma ótima motivação!](https://buymeacoffee.com/asm444/support-craseup-development)

---

## English

CraseUp reviews what you write in Portuguese and English, on any site, as you type. It underlines only what needs to change and shows the fix in a card next to the field; one click replaces the passage.

- Suggests only what's needed: replaces the bad word or passage without rewriting the rest.
- No suggestion adds more than 10 words to the passage it replaces, wherever it comes from, including tone rewrites and right-click checks.
- Rewrites the passage in ten tones, including **LinkedIn**, for a workplace voice, and **Advogado** (Lawyer), for defensive writing.
- Shows how much you used per day, month and year, the tokens it took, what it would cost on a paid model and how much review time you saved.
- It's free: it uses free OpenRouter models with your key, LanguageTool on your machine and an offline dictionary.

### 1. Install

Needs `git`, `make` and `podman` or `docker`.

1. Get the project and start LanguageTool on this machine:
   ```bash
   git clone https://github.com/asm444/CraseUp
   cd CraseUp
   make instalar
   ```
   `make instalar` starts LanguageTool at `http://localhost:8010`, reachable only from this machine, waits for it to answer and prints the next steps.
2. Open `chrome://extensions` (Edge: `edge://extensions`; Brave: `brave://extensions`) and turn on **Developer mode**, top right.
3. Click **Load unpacked** and pick the `CraseUp` folder.
4. Pin the CraseUp icon to the toolbar.

Without `git`, download the `.zip` from the [latest release](../../releases), unzip it into a folder you won't delete and continue from step 2. In that case LanguageTool must run on a server of yours (see [Servidor LanguageTool](#servidor-languagetool)).

### 2. Paste the OpenRouter key (one time)

The first time, the extension opens its settings page.

1. Create a key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys). The free account is enough, because the extension only uses `:free` models.
2. Paste it under **Chave do OpenRouter** (OpenRouter key) and click **Testar e salvar** (Test and save).

Done: start typing on any site. The key stays in this browser only (`chrome.storage.local`) and is only sent to OpenRouter.

### How it works

Each edited paragraph goes through three layers, cheapest first: the offline dictionary (spelling, always, even offline), LanguageTool (grammar, crasis and punctuation, at `http://localhost:8010` or the server you set) and OpenRouter (clarity, word choice and tone, only when LanguageTool flags something or when you ask). With LanguageTool down, OpenRouter is not called and only offline spelling remains.

### The card

Hover an underline: the card opens next to the field with every fix of the passage already applied in the preview. **Substituir** (Replace) swaps the passage at once; the **Tom** (Tone) picker rewrites it in one of ten tones, changing the text inside the same card without it flashing or moving. Right-click a field or a selection and choose **Verificar com o CraseUp** (Check with CraseUp) to get a full revised version of it.

### Usage and appearance

The popup shows today's usage. **Configurações → Consumo** (Settings → Usage) charts calls, tokens, time saved or equivalent cost per day, month or year over the range you pick in the calendar. The theme follows the system; the sun/moon button switches light and dark, and **Aparência** (Appearance) pins Automatic, Light or Dark.

### Privacy

Password and card fields are never read. Only the paragraph you changed is reviewed. The offline dictionary sends nothing out. The paragraph goes to your LanguageTool server and, when OpenRouter is called, to the free model provider that answers; free providers may log the texts, so don't use the style review on text that must stay under your control.

### Tests

`make testes` runs the suites in headless Chrome. It needs `google-chrome`, `python3` and the `playwright` package (`pip install playwright`).

[Like it? A coffee is always a great motivation!](https://buymeacoffee.com/asm444/support-craseup-development)
