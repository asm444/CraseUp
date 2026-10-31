const $ = (id) => document.getElementById(id);

function desenharChips(container, itens, remover) {
  container.replaceChildren(
    ...itens.map((item) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const texto = document.createElement('span');
      texto.textContent = item;
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.title = `Remover ${item}`;
      botao.textContent = '×';
      botao.addEventListener('click', () => remover(item));
      chip.append(texto, botao);
      return chip;
    }),
  );
  if (!itens.length) {
    const vazio = document.createElement('span');
    vazio.className = 'suave';
    vazio.textContent = 'Nada por aqui ainda.';
    container.append(vazio);
  }
}

function lista(chave, container, normalizar) {
  const desenhar = async () => {
    const { [chave]: itens = [] } = await chrome.storage.local.get(chave);
    desenharChips(container, itens, async (item) => {
      const { [chave]: atuais = [] } = await chrome.storage.local.get(chave);
      await chrome.storage.local.set({ [chave]: atuais.filter((i) => i !== item) });
    });
  };
  const adicionar = async (valor) => {
    const item = normalizar(valor);
    if (!item) return;
    const { [chave]: atuais = [] } = await chrome.storage.local.get(chave);
    if (!atuais.some((i) => i.toLocaleLowerCase('pt-BR') === item.toLocaleLowerCase('pt-BR'))) {
      await chrome.storage.local.set({ [chave]: [...atuais, item] });
    }
  };
  return { desenhar, adicionar };
}

function normalizarSite(valor) {
  const bruto = valor.trim().toLowerCase();
  if (!bruto) return '';
  try {
    return new URL(bruto.includes('://') ? bruto : `https://${bruto}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function iniciar() {
  const bemVindo = new URLSearchParams(location.search).has('bemvindo');
  const { chave, tom = 'neutro' } = await chrome.storage.local.get(['chave', 'tom']);
  $('boasVindas').hidden = !(bemVindo || !chave);
  $('linkAiStudio').href = RevisorConfig.AI_STUDIO_URL;
  if (chave) {
    $('chave').value = chave;
    $('statusChave').textContent = 'Chave configurada.';
  }

  $('salvarChave').addEventListener('click', async () => {
    const valor = $('chave').value.trim();
    const status = $('statusChave');
    status.className = 'suave';
    if (!valor) {
      status.textContent = 'Cole a chave antes de salvar.';
      return;
    }
    $('salvarChave').disabled = true;
    status.textContent = 'Testando a chave…';
    const resposta = await chrome.runtime.sendMessage({ tipo: 'testarChave', chave: valor });
    $('salvarChave').disabled = false;
    if (resposta?.ok) {
      await chrome.storage.local.set({ chave: valor });
      status.className = 'ok';
      status.textContent = 'Chave funcionando e salva. Já pode digitar em qualquer site.';
    } else {
      status.className = 'erro';
      status.textContent = `A chave não funcionou: ${resposta?.mensagem || 'erro desconhecido'}`;
    }
  });

  for (const radio of document.querySelectorAll('input[name="tom"]')) {
    radio.checked = radio.value === tom;
    radio.addEventListener('change', () => chrome.storage.local.set({ tom: radio.value }));
  }

  const dicionario = lista('dicionario', $('dicionario'), (v) => v.trim());
  const sites = lista('sitesExcluidos', $('sites'), normalizarSite);
  $('formDicionario').addEventListener('submit', async (e) => {
    e.preventDefault();
    await dicionario.adicionar($('novaPalavra').value);
    $('novaPalavra').value = '';
  });
  $('formSite').addEventListener('submit', async (e) => {
    e.preventDefault();
    await sites.adicionar($('novoSite').value);
    $('novoSite').value = '';
  });
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== 'local') return;
    if (mudancas.dicionario) dicionario.desenhar();
    if (mudancas.sitesExcluidos) sites.desenhar();
  });
  dicionario.desenhar();
  sites.desenhar();

  if (RevisorConfig.DOACAO_URL) {
    $('doacao').href = RevisorConfig.DOACAO_URL;
    $('doacao').hidden = false;
  }
}

iniciar();
