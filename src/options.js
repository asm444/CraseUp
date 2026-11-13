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
  try {
    return new URL(bruto.includes('://') ? bruto : `https://${bruto}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const CORES_CLARO = ['#6B57E8', '#B87A00', '#0E9F86', '#D6404E'];
const CORES_ESCURO = ['#8C79F2', '#BC800F', '#1F9F84', '#E0596A'];

function painelDeConsumo() {
  const G = RevisorGraficos;
  const modelos = RevisorCore.MODELOS;
  const estado = { periodo: 'dia', metrica: 'chamadas', consumo: {}, precos: {} };
  const hoje = new Date();
  const dia = (d) => d.toLocaleDateString('sv');
  $('consumoAte').value = dia(hoje);
  $('consumoDe').value = dia(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 29));
  const dica = document.createElement('div');
  dica.className = 'dica';
  dica.style.opacity = '0';
  $('grafico').after(dica);

  const cor = (serie) => {
    const paleta = document.documentElement.dataset.efetivo === 'claro' ? CORES_CLARO : CORES_ESCURO;
    const i = modelos.indexOf(serie);
    return paleta[i === -1 ? 3 : i];
  };
  const nomeCurto = (serie) => serie.split('/').pop().replace(/:free$/, '');

  function mostrarDica(evento, balde, soma) {
    if (!evento) {
      dica.style.opacity = '0';
      return;
    }
    const linhas = [Object.assign(document.createElement('strong'), { textContent: G.rotuloDoBalde(balde.chave, estado.periodo) })];
    for (const serie of [...estado.dados.series].reverse()) {
      if (!balde.valores[serie]) continue;
      const linha = document.createElement('div');
      linha.className = 'linha-dica';
      const amostra = document.createElement('i');
      amostra.className = 'amostra';
      amostra.style.background = cor(serie);
      const valor = document.createElement('b');
      valor.textContent = G.formatar(estado.metrica, balde.valores[serie]);
      linha.append(amostra, nomeCurto(serie), valor);
      linhas.push(linha);
    }
    if (linhas.length === 1) linhas.push(Object.assign(document.createElement('span'), { className: 'suave', textContent: 'Sem uso neste período' }));
    else if (linhas.length > 2) linhas.push(Object.assign(document.createElement('div'), { className: 'linha-dica suave', textContent: `Total ${G.formatar(estado.metrica, soma)}` }));
    dica.replaceChildren(...linhas);
    const caixa = $('consumo').getBoundingClientRect();
    const x = evento.clientX - caixa.left;
    dica.style.left = `${Math.min(x + 14, caixa.width - dica.offsetWidth)}px`;
    dica.style.top = `${evento.clientY - caixa.top + 14}px`;
    dica.style.opacity = '1';
  }

  function desenhar() {
    const de = $('consumoDe').value;
    const ate = $('consumoAte').value;
    if (!de || !ate || de > ate) return;
    estado.dados = G.agrupar(estado.consumo, estado.precos, { de, ate, periodo: estado.periodo, metrica: estado.metrica, modelos });
    for (const botao of document.querySelectorAll('.indicador')) {
      botao.classList.toggle('ativo', botao.dataset.metrica === estado.metrica);
      G.animarNumero(botao.querySelector('strong'), estado.dados.totais[botao.dataset.metrica], botao.dataset.metrica);
    }
    if (!estado.dados.series.length) {
      $('grafico').replaceChildren(Object.assign(document.createElement('p'), { className: 'suave vazio-grafico', textContent: 'Nenhuma chamada ao OpenRouter neste intervalo.' }));
    } else {
      G.desenharBarras($('grafico'), estado.dados, { metrica: estado.metrica, periodo: estado.periodo, cor, dica: mostrarDica });
    }
    $('legendaGrafico').replaceChildren(...estado.dados.series.map((serie) => {
      const item = document.createElement('span');
      const amostra = document.createElement('i');
      amostra.className = 'amostra';
      amostra.style.background = cor(serie);
      item.append(amostra, nomeCurto(serie));
      return item;
    }));
    const cabecalho = document.createElement('tr');
    for (const titulo of ['Período', ...estado.dados.series.map(nomeCurto)]) cabecalho.append(Object.assign(document.createElement('th'), { textContent: titulo }));
    const linhas = estado.dados.baldes.map((balde) => {
      const tr = document.createElement('tr');
      tr.append(Object.assign(document.createElement('td'), { textContent: G.rotuloDoBalde(balde.chave, estado.periodo) }));
      for (const serie of estado.dados.series) tr.append(Object.assign(document.createElement('td'), { textContent: G.formatar(estado.metrica, balde.valores[serie] || 0) }));
      return tr;
    });
    $('tabelaConsumo').replaceChildren(cabecalho, ...linhas);
  }

  for (const radio of document.querySelectorAll('input[name="periodo"]')) {
    radio.addEventListener('change', () => {
      estado.periodo = radio.value;
      const fim = new Date(`${$('consumoAte').value || dia(hoje)}T12:00:00`);
      const inicio = radio.value === 'ano' ? new Date(fim.getFullYear() - 4, 0, 1) : radio.value === 'mes' ? new Date(fim.getFullYear(), fim.getMonth() - 11, 1) : new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() - 29);
      $('consumoDe').value = dia(inicio);
      desenhar();
    });
  }
  for (const botao of document.querySelectorAll('.indicador')) {
    botao.addEventListener('click', () => {
      estado.metrica = botao.dataset.metrica;
      desenhar();
    });
  }
  $('consumoDe').addEventListener('change', desenhar);
  $('consumoAte').addEventListener('change', desenhar);
  new ResizeObserver(() => estado.dados && desenhar()).observe($('grafico'));
  new MutationObserver(() => estado.dados && desenhar()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-efetivo'] });

  const carregar = async () => {
    const { consumo = {}, precos = {} } = await chrome.storage.local.get(['consumo', 'precos']);
    Object.assign(estado, { consumo, precos });
    desenhar();
  };
  chrome.storage.onChanged.addListener((mudancas) => {
    if (mudancas.consumo || mudancas.precos) carregar();
  });
  carregar();
}

const NOMES_DE_CAMADA = { offline: 'Dicionário offline', languagetool: 'LanguageTool', openrouter: 'OpenRouter' };
const NOMES_DE_ERRO = { sem_conexao: 'sem conexão', limite_por_minuto: 'limite por minuto', limite_da_aba: 'limite da aba', cota: 'cota esgotada', sem_chave: 'sem chave', sem_permissao: 'sem permissão' };

async function mostrarAprendizado() {
  const { aprendizado, dicionario = [] } = await chrome.storage.local.get(['aprendizado', 'dicionario']);
  const item = (texto, rotulo, acao) => {
    const li = Object.assign(document.createElement('li'), { textContent: texto + ' ' });
    const botao = Object.assign(document.createElement('button'), { textContent: rotulo });
    botao.addEventListener('click', acao);
    li.append(botao);
    return li;
  };
  const suprimidas = RevisorCore.aprendidos(aprendizado);
  $('trocasSuprimidas').replaceChildren(...suprimidas.map((v) => item(`${v.original} → ${v.substituicao || '(remover)'}`, 'Desfazer', async () => {
    const { aprendizado: atual } = await chrome.storage.local.get('aprendizado');
    delete atual[v.chave];
    await chrome.storage.local.set({ aprendizado: atual });
    mostrarAprendizado();
  })));
  $('semAprendizado').hidden = suprimidas.length > 0;
  $('palavrasPropostas').replaceChildren(...RevisorCore.palavrasParaDicionario(aprendizado).filter((p) => !dicionario.includes(p)).map((p) => item(p, 'Adicionar ao dicionário', () => {
    chrome.storage.local.get(['aprendizado', 'dicionario']).then(({ aprendizado: atual, dicionario: agora = [] }) => {
      for (const c of suprimidas.filter((v) => v.original === p && v.categoria === 'ortografia').map((v) => v.chave)) delete atual[c];
      return chrome.storage.local.set({ aprendizado: atual, dicionario: [...agora, p] });
    }).then(mostrarAprendizado);
  })));
}

async function mostrarDiagnostico() {
  const { historicoDasCamadas } = await chrome.storage.local.get('historicoDasCamadas');
  const metricas = RevisorCore.agregarMetricas(historicoDasCamadas);
  const celula = (texto) => Object.assign(document.createElement('td'), { textContent: texto });
  const ms = (v) => (v === null ? '—' : `${v} ms`);
  const linhas = Object.entries(metricas).map(([nome, m]) => {
    const tr = document.createElement('tr');
    const erros = m.ultimosErros.map((e) => `${NOMES_DE_ERRO[e.erro] || e.erro} (${new Date(e.em).toLocaleString('pt-BR')})`).join(', ') || 'nenhum';
    tr.append(celula(NOMES_DE_CAMADA[nome]), celula(ms(m.mediana)), celula(ms(m.p95)), celula(`${m.disponibilidade}%`), celula(erros));
    return tr;
  });
  $('linhasDiagnostico').replaceChildren(...linhas);
  $('semDiagnostico').hidden = linhas.length > 0;
}

async function iniciar() {
  const bemVindo = new URLSearchParams(location.search).has('bemvindo');
  const { chaveOpenrouter: chave, tom = 'neutro', nivel = RevisorCore.NIVEL_PADRAO, perfil = '' } = await chrome.storage.local.get(['chaveOpenrouter', 'tom', 'nivel', 'perfil']);
  $('boasVindas').hidden = !(bemVindo || !chave);
  $('linkChaves').href = RevisorConfig.CHAVES_URL;
  mostrarDiagnostico();
  mostrarAprendizado();
  if (chave) $('statusChave').textContent = `Chave configurada, terminando em …${chave.slice(-4)}. Cole outra para trocar.`;

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
      await chrome.storage.local.set({ chaveOpenrouter: valor });
      $('chave').value = '';
      status.className = 'ok';
      status.textContent = `Chave funcionando e salva, terminando em …${valor.slice(-4)}. Já pode digitar em qualquer site.`;
    } else {
      status.className = 'erro';
      status.textContent = `A chave não funcionou: ${resposta?.mensagem || 'erro desconhecido'}`;
    }
  });

  const { languagetool = '' } = await chrome.storage.local.get('languagetool');
  $('languagetool').value = languagetool;
  if (languagetool) $('statusLanguagetool').textContent = 'Servidor configurado.';
  $('salvarLanguagetool').addEventListener('click', async () => {
    const status = $('statusLanguagetool');
    const bruto = $('languagetool').value.trim();
    const base = RevisorLanguageTool.normalizarEndereco(bruto);
    status.className = 'suave';
    if (!bruto) {
      await chrome.storage.local.remove('languagetool');
      status.textContent = `Usando o LanguageTool desta máquina em ${RevisorLanguageTool.ENDERECO_LOCAL}.`;
      return;
    }
    if (!base) {
      status.className = 'erro';
      status.textContent = 'Endereço inválido. Use algo como http://servidor:8010.';
      return;
    }
    const permitido = await chrome.permissions.request({ origins: [RevisorLanguageTool.padraoDePermissao(base)] });
    if (!permitido) {
      status.className = 'erro';
      status.textContent = 'Sem permissão para acessar esse servidor.';
      return;
    }
    $('salvarLanguagetool').disabled = true;
    status.textContent = 'Testando o servidor…';
    const resposta = await chrome.runtime.sendMessage({ tipo: 'testarLanguagetool', base });
    $('salvarLanguagetool').disabled = false;
    if (resposta?.ok) {
      await chrome.storage.local.set({ languagetool: base });
      $('languagetool').value = base;
      status.className = 'ok';
      status.textContent = 'Servidor respondendo e salvo.';
    } else {
      status.className = 'erro';
      status.textContent = `O servidor não respondeu: ${resposta?.mensagem || 'erro desconhecido'}`;
    }
  });

  for (const radio of document.querySelectorAll('input[name="tom"]')) {
    radio.checked = radio.value === tom;
    radio.addEventListener('change', () => chrome.storage.local.set({ tom: radio.value }));
  }

  for (const [id, p] of Object.entries(RevisorCore.PERFIS)) {
    const rotulo = document.createElement('label');
    rotulo.append(Object.assign(document.createElement('input'), { type: 'radio', name: 'perfil', value: id }), Object.assign(document.createElement('span'), { textContent: p.nome }));
    $('perfis').append(rotulo);
  }
  for (const radio of document.querySelectorAll('input[name="perfil"]')) {
    radio.checked = radio.value === perfil;
    radio.addEventListener('change', () => {
      const escolhido = RevisorCore.PERFIS[radio.value];
      chrome.storage.local.set(escolhido ? { perfil: radio.value, tom: escolhido.tom, nivel: escolhido.nivel } : { perfil: '' });
      if (!escolhido) return;
      document.querySelectorAll('input[name="tom"]').forEach((r) => (r.checked = r.value === escolhido.tom));
      document.querySelectorAll('input[name="nivel"]').forEach((r) => (r.checked = Number(r.value) === escolhido.nivel));
    });
  }

  for (const radio of document.querySelectorAll('input[name="nivel"]')) {
    radio.checked = Number(radio.value) === nivel;
    radio.addEventListener('change', () => chrome.storage.local.set({ nivel: Number(radio.value) }));
  }

  const radiosDeTema = document.querySelectorAll('input[name="tema"]');
  const marcarTema = (tema) => radiosDeTema.forEach((r) => (r.checked = r.value === tema));
  marcarTema(await RevisorTema.atual());
  for (const radio of radiosDeTema) radio.addEventListener('change', () => chrome.storage.local.set({ tema: radio.value }));
  $('alternarTema').addEventListener('click', RevisorTema.alternar);

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
    if (mudancas.tema) marcarTema(mudancas.tema.newValue);
  });
  dicionario.desenhar();
  sites.desenhar();

  painelDeConsumo();

  if (RevisorConfig.DOACAO_URL) {
    $('doacao').href = RevisorConfig.DOACAO_URL;
    $('doacao').hidden = false;
  }
}

iniciar();
