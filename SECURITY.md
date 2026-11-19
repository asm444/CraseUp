# Segurança do CraseUp

Este documento diz o que o CraseUp protege, de quem, e o que ainda está aberto. Ele segue a tríade CIA: confidencialidade, integridade e disponibilidade.

A prova de cada item da primeira rodada está em `docs/seguranca/auditoria-1.md`. A segunda rodada, de 2026-11-19, cobre o que entrou depois da v0.13.33 e está resumida aqui. Cada correção dela tem um caso em `tests/` que falha no código anterior.

## O que está em jogo

| Bem | Onde fica |
|---|---|
| Texto que você digita | No campo da página; sai para o LanguageTool e para o OpenRouter, mascarado |
| Chave do OpenRouter | `chrome.storage.local`, em claro |
| Dicionário, perfis, atalhos e nome | `chrome.storage.local` |
| Cache de revisões e frases repetidas | `chrome.storage.local`, com prazo |
| Cota do OpenRouter | Gasta a cada chamada ao modelo |

## De quem o CraseUp se defende

| Adversário | O que ele controla |
|---|---|
| A página web e os scripts de terceiros nela | O DOM, os eventos que ela cria e o conteúdo dos próprios campos |
| Um iframe de outra origem | O mesmo que a página, dentro do próprio quadro |
| O modelo e o servidor LanguageTool | A resposta, que pode vir adulterada ou obedecer a uma instrução escrita no texto revisado |
| Outra conta na mesma máquina | A porta 8010, se chegar antes do LanguageTool |
| Quem obtém o perfil do Chrome | Os arquivos do `storage.local` |

Outra extensão fica de fora do alcance: o CraseUp aceita mensagem só das próprias páginas e do próprio content script.

## Confidencialidade

### O que protege hoje

- Dado sensível sai como marcador (`[EMAIL_1]`, `[SENHA_1]`) e volta só no navegador. Isso vale para os quatro envios: LanguageTool, revisão, reescrita e sugestão de tom.
- A máscara normaliza o texto antes de procurar. Caractere invisível, dígito de largura inteira e letra parecida de outro alfabeto deixaram de esconder e-mail, CPF e senha.
- O parágrafo anterior, que vai como contexto, é mascarado antes de ser cortado. Antes, o corte podia deixar o fim de uma senha em claro.
- A reescrita que repete, perde ou inventa um marcador é recusada.
- Campos de senha, cartão, PIN, token, código e CPF ficam fora da revisão.
- O cartão vive numa sombra fechada e o texto dele não pode ser selecionado. A página deixou de ler a sugestão e a reescrita com `window.find`.
- O cartão só abre com movimento real do mouse. Os botões e o seletor de tom só agem com evento do usuário.
- O atalho só expande quando o gatilho inteiro veio de teclas reais. Antes, a página escrevia o gatilho por `execCommand` e lia o texto do atalho, com o seu nome.
- No nível 1 nada vai ao modelo, e isso passou a incluir a sugestão de tom ao abrir o cartão.
- A chave do OpenRouter vai só no cabeçalho, só para `openrouter.ai`, e nenhuma chamada segue redirecionamento. A tela de configurações mostra só os quatro últimos caracteres.
- O pacote gerado por `make pacote` leva só arquivos rastreados pelo git. Antes, um `.env` solto em `src/` entrava no zip.

### O que está aberto

| Risco | Condição | Caminho para resolver |
|---|---|---|
| O content script lê a chave e grava o endereço do LanguageTool, porque o `storage.local` é aberto a ele | Exige código rodando no mundo isolado da extensão ou um renderer comprometido; o ataque completo não foi demonstrado | Restringir o `storage.local` a contextos confiáveis e fazer o service worker entregar ao content script só o que ele usa |
| A chave fica em claro no disco do perfil | Acesso aos arquivos do perfil | Sem correção pequena; use uma chave com limite de gasto |
| Rótulo numa linha e valor na linha seguinte: cada linha é mascarada sozinha e o valor sai em claro | Texto com `senha:` no fim de um parágrafo | Mascarar o campo inteiro antes de dividir em parágrafos |
| Senha de várias palavras, ou senha e token só com letras, passam sem marcador | Decisão registrada: a senha se reconhece pela forma do valor | Reavaliar a regra |
| A pontuação final de uma senha fica fora do marcador | Senha que termina em `!` ou `?` | Reavaliar junto com a regra acima |
| `window.find` ainda responde se uma palavra existe no cartão | Cartão aberto pelo usuário | Desenhar o texto do cartão fora do alcance da busca da página |
| O cache guarda `original` e `motivo` de cada sugestão em claro | Trecho sem dado que a máscara reconheça; trecho com dado protegido fica fora do cache | Guardar só posição e substituição |
| As frases repetidas ficam em claro | Recurso ligado por opção sua | Passar a frase pela máscara antes de contar |
| O prazo do cache e das frases só vale na leitura; o dado vencido fica no disco até a próxima revisão com modelo ou o próximo início do navegador | Sempre | Limpar por alarme |
| Falta um botão para apagar tudo | Sempre; desinstalar apaga | Criar o botão nas configurações |
| Um servidor LanguageTool `http:` remoto recebe o texto mascarado sem TLS | Você configurou esse endereço e aceitou a permissão | Avisar na tela ao aceitar endereço `http:` fora de `localhost` |
| Remover o endereço do LanguageTool mantém a permissão de host concedida | Lido no código, sem medição | Chamar `permissions.remove` ao limpar o endereço |
| Um impostor na porta 8010 que imite `/v2/languages` recebe o texto mascarado | Outra conta na máquina | Sem correção pequena |
| A página descobre que o CraseUp está instalado | Sempre | Aceito: vaza a presença, e nenhum texto |

## Integridade

### O que protege hoje

- A sugestão e a reescrita entram no DOM como texto, nunca como HTML.
- A origem de cada sugestão é carimbada pela camada que a produziu.
- A reescrita é recusada quando traz link ou e-mail que o original não tem, quando passa de dez palavras a mais, ou quando cresce além do teto de caracteres.
- O Substituir confere o texto antes de agir e de novo depois de dar o foco ao campo. No editor rico, ele confere a seleção e o texto depois do `beforeinput`. Se a página mexeu, ele desiste.
- Texto que a página troca sem evento, entre a sua tecla e a revisão, deixa de ser enviado.
- O dicionário só recebe palavra com clique real.

### O que está aberto

| Risco | Condição | Caminho para resolver |
|---|---|---|
| Nos 15 s depois de uma tecla real, a página insere texto por `execCommand` e ele é revisado; as frases dela entram na contagem de frases repetidas | Tecla real recente no mesmo campo | Ligar cada evento de entrada à tecla que o causou |
| No editor rico, mutação feita pela página até 1 s depois de uma tecla real conta como digitação | Necessário para editores que redesenham o texto depois da tecla | Sem correção sem quebrar esses editores |
| A reescrita pode mudar o sentido do texto dentro do teto de dez palavras | Texto com instrução para o modelo | A prévia mostra a diferença antes do Substituir; a decisão é sua |
| O perfil por site segue o endereço do iframe, e não o da página de cima | Campo dentro de iframe de outra origem | Decidir qual endereço vale e usar o da aba |
| O `vendor` e os dicionários não têm hash registrado, e o `npm install` que os gera não tem lockfile | Regerar o `vendor` | Fixar as versões e guardar os hashes |
| A imagem `erikvl87/languagetool` é puxada sem tag nem digest | `make instalar` | Fixar o digest no `Makefile` e no README |
| O service worker aceita da porta `revisar` texto que o content script não validou, e grava em `aprendizado` campos de qualquer tipo | Só o content script alcança essas portas | Validar tipo e tamanho no service worker |

## Disponibilidade

### O que protege hoje

- Cada aba faz no máximo 15 chamadas ao modelo por minuto.
- Toda chamada externa tem prazo e recusa redirecionamento.
- A máscara termina em menos de 200 ms com 4000 caracteres escolhidos pela página.
- A verificação pelo botão direito, acima de 4000 caracteres, só avisa. Antes, ela analisava o texto inteiro e a página travava a aba.
- A resposta do modelo acima do teto de caracteres é recusada antes da análise. Antes, uma resposta de 200 mil caracteres prendia o service worker.
- Com o armazenamento cheio, a revisão responde à aba com erro e a contagem de chamadas segue. Antes, o parágrafo ficava esperando para sempre e a fila de contagem parava.
- Parágrafo que o modelo deixou de revisar espera de 5 s a 5 min antes de voltar.

### O que está aberto

| Risco | Condição | Caminho para resolver |
|---|---|---|
| Um iframe de terceiro gasta as 15 chamadas da aba, e a página de cima fica sem revisão por um minuto | Clique e tecla reais dentro do iframe | Contar por quadro, com um teto somado por aba |
| O teto é por aba e zera quando o service worker reinicia | Várias abas, ou reinício | Guardar a contagem em `storage.session` |
| Com chave inválida, a extensão segue chamando o modelo até o teto, sem aviso na página | Chave revogada ou errada | Parar depois do primeiro 401 e avisar no cartão |
| Com o LanguageTool fora, toda revisão vai ao modelo e nada entra no cache | Instalação sem o LanguageTool no ar | Guardar no cache também o resultado do caminho sem LanguageTool |
| A página estiliza o elemento `craseup-camada` e esconde ou cobre o cartão | Sempre | Reaplicar o estilo do elemento a cada desenho |
| Resposta do modelo sem teto de bytes na leitura | Provedor comprometido | Ler o corpo com limite de tamanho |
| Dicionário e listas de perfil sem teto de escrita podem encher o armazenamento | Volume não alcançado pela interface nas medições | Limitar o número de entradas |
| Se o service worker morre com uma revisão em curso, a aba desliga a revisão até recarregar | Só reproduzido matando o service worker à força | Reabrir a porta e tentar de novo |

## O que mudou no uso com as correções

- O texto do cartão deixou de ser selecionável com o mouse. O botão Copiar continua.
- O atalho colado, ou digitado por IME, deixa de expandir. Digite o gatilho inteiro.
- A reescrita que repete um link do original continua aceita; a que traz um link novo é recusada.

## Correção à auditoria 1

A auditoria 1 afirma que sugestão e reescrita "seguem na sombra fechada". A segunda rodada mostrou que a página lia o cartão com `window.find` e `Selection.modify`, já na v0.13.33. A leitura foi fechada na v0.22.2; o resto está na tabela de confidencialidade.

`docs/decisoes-fase-2.md` diz que o cache guarda o texto mascarado. O código faz outra coisa: deixa fora do cache o trecho com dado protegido e guarda os demais em claro.

## Como conferir

```bash
make testes
```

Os casos da segunda rodada estão em `tests/content.html`, `tests/background.html`, `tests/core.html` e `tests/protecao.html`.

## Como avisar de uma falha

Abra uma issue em `github.com/asm444/CraseUp` sem colar chave, texto pessoal ou dado de terceiros. Descreva a página, o que você fez e o que a extensão fez. Se a falha expõe dado de quem usa, diga só isso na issue e combine o envio dos detalhes em privado.
