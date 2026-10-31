# CraseUp

Extensão gratuita para navegadores Chromium que revisa textos em português com a API do Gemini, enquanto você digita, em qualquer site.

- Sugere só o necessário: troca a palavra ou o trecho ruim, sem reescrever o resto.
- Nenhuma sugestão acrescenta mais de 10 palavras ao trecho que ela troca, venha de onde vier.
- Cada tipo de sugestão tem uma cor e um traço próprios:

| Tipo | Traço | Cor |
|---|---|---|
| Ortografia e gramática | ondulado | terracota `#E26D7C` |
| Clareza | contínuo | azul-petróleo `#2BB3C0` |
| Troca de palavra | pontilhado | âmbar `#EDAE49` |
| Tom | tracejado | lavanda-ameixa `#A88BB8` |

## Instalação

A extensão não está em nenhuma loja. A instalação é manual:

1. Baixe o `.zip` da [última release](../../releases) e descompacte numa pasta que não vá apagar.
2. Abra `chrome://extensions` (no Edge, `edge://extensions`; no Brave, `brave://extensions`).
3. Ative o **Modo do desenvolvedor**, clique em **Carregar sem compactação** e escolha a pasta descompactada.

Na primeira vez, abre uma tela para configurar a chave:

1. Crie uma chave gratuita no [Google AI Studio](https://aistudio.google.com/apikey).
2. Cole a chave e clique em **Testar e salvar**.

A chave fica salva só no seu navegador (`chrome.storage.local`) e só é enviada para a API do Google.

## Privacidade

- Campos de senha e de cartão nunca são lidos.
- Só o parágrafo que você alterou é enviado, depois de uma pausa de ~1,2 s na digitação.
- Você pode desligar a extensão numa aba pelo ícone dela, ou excluir sites inteiros nas configurações.
- No plano gratuito do Gemini, o Google pode usar os textos enviados para melhorar os produtos dele. No plano pago (cobrado por uso), não usa.

## Cota

Quando a cota gratuita do dia acaba, a revisão pausa sem atrapalhar a digitação e aparece um `!` no ícone. O popup mostra quantas chamadas a extensão fez no dia. Esse número é contado pela própria extensão, porque a API não informa quanto resta da cota.

## Limites da versão 0.1

- Editores que desenham o texto em canvas, como o Google Docs, não são suportados.
- Editores de código (CodeMirror, Monaco, Ace) são ignorados de propósito.

## Desenvolvimento

```bash
bash tests/rodar.sh        # testes no Chrome headless; sai 0 só se todas as páginas imprimirem PASSED
bash tools/empacotar.sh    # gera dist/craseup-<versão>.zip para a release
python3 tools/gerar-icones.py icons
```

O link de doação aparece quando `DOACAO_URL` em `src/config.js` não está vazio.
