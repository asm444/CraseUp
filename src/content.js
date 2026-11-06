(() => {
  if (globalThis.__revisorGemini) return;
  globalThis.__revisorGemini = true;

  const { TIPOS, ROTULOS_DE_TOM, dividirParagrafos, revisavel, contemPalavraDoDicionario, trechosDoParagrafo, partesDoTrecho, aplicarTrecho, diferencaDePalavras } = RevisorCore;
  const ESPERA_RAPIDA_MS = 250;
  const ESPERA_MODELO_MS = 1200;
  const PARAGRAFOS_POR_PAUSA = 3;
  const PARAGRAFOS_POR_PEDIDO = 10;
  const ENTRADAS_NO_CACHE = 300;
  const FOLGA_VERTICAL_PX = 4;
  const INVISIVEIS = /[\u200B\u2060\uFEFF]/g;
  const ATRASO_PARA_ESCONDER_MS = 250;
  const HOSTS_FORA_DO_ESCOPO = ['docs.google.com'];
  const EDITORES_DE_CODIGO = '.cm-editor,.CodeMirror,.monaco-editor,.ace_editor';
  const CAMPO_SENSIVEL = /senha|password|passwd|cart[aã]o|card.?(num|number)|cc-?(num|number|csc|exp)|cvv|cvc|security.?code|validade|expira/i;
  const BLOCOS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TR', 'SECTION', 'ARTICLE']);
  const ROTULOS = { gramatica: 'Ortografia e gramática', clareza: 'Clareza', palavra: 'Troca de palavra', tom: 'Tom' };
  const ROTULOS_DE_ORIGEM = { offline: 'Dicionário offline', languagetool: 'LanguageTool', openrouter: 'OpenRouter' };

  let ativo = false;
  const campos = new Map();
  const cache = new Map();
  const provisorios = new Set();
  const emVoo = new Set();
  let camada = null;
  let cartao = null;
  let alvoDoCartao = null;
  let timerEsconder = 0;
  let quadroPendente = 0;
  let alvoDoMenu = null;

  function hostExcluido(host, lista) {
    return HOSTS_FORA_DO_ESCOPO.concat(lista).some((s) => host === s || host.endsWith(`.${s}`));
  }

  async function avaliarAtivo() {
    try {
      const { sitesExcluidos = [] } = await chrome.storage.local.get('sitesExcluidos');
      const { pausado } = await chrome.runtime.sendMessage({ tipo: 'estadoAba' });
      definirAtivo(!hostExcluido(location.hostname, sitesExcluidos) && !pausado);
    } catch {
      definirAtivo(false);
    }
  }

  function definirAtivo(valor) {
    ativo = valor;
    if (!ativo) {
      for (const estado of campos.values()) descartarCampo(estado);
      campos.clear();
      esconderCartao();
    }
  }

  function raizEditavel(el) {
    let atual = el;
    while (atual.parentElement && atual.parentElement.isContentEditable) atual = atual.parentElement;
    return atual;
  }

  function sensivel(el) {
    const auto = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (auto.startsWith('cc-') || auto.includes('password') || auto === 'one-time-code') return true;
    const pistas = ['name', 'id', 'aria-label', 'placeholder'].map((a) => el.getAttribute(a) || '').join(' ');
    return CAMPO_SENSIVEL.test(pistas);
  }

  function tipoDoCampo(el) {
    if (!(el instanceof HTMLElement) || el.closest(EDITORES_DE_CODIGO)) return null;
    if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled && !sensivel(el) ? 'texto' : null;
    if (el instanceof HTMLInputElement) {
      const tipoOk = el.type === 'text' || el.type === 'search';
      return tipoOk && !el.readOnly && !el.disabled && !sensivel(el) ? 'texto' : null;
    }
    if (el.isContentEditable && raizEditavel(el) === el && !sensivel(el)) return 'editavel';
    return null;
  }

  function estadoDe(el) {
    if (campos.has(el)) return campos.get(el);
    const tipo = tipoDoCampo(el);
    if (!tipo) return null;
    const estado = { el, tipo, timer: 0, ignoradas: new Set(), marcas: [], mapa: [], ranges: [], espelho: null, observador: null };
    campos.set(el, estado);
    return estado;
  }

  function descartarCampo(estado) {
    clearTimeout(estado.timer);
    clearTimeout(estado.timerModelo);
    estado.espelho?.remove();
    estado.observador?.disconnect();
    estado.mutacoes?.disconnect();
    estado.ranges = [];
    reconstruirHighlights();
  }

  function lerTextoEditavel(raiz) {
    const mapa = [];
    let texto = '';
    let blocoAnterior = null;
    const caminhante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let no = caminhante.nextNode(); no; no = caminhante.nextNode()) {
      if (no.nodeType === Node.ELEMENT_NODE) {
        if (no.tagName === 'BR') texto += '\n';
        continue;
      }
      let bloco = no.parentElement;
      while (bloco && bloco !== raiz && !BLOCOS.has(bloco.tagName)) bloco = bloco.parentElement;
      if (blocoAnterior && bloco !== blocoAnterior && texto && !texto.endsWith('\n')) texto += '\n';
      blocoAnterior = bloco;
      mapa.push({ no, inicio: texto.length });
      texto += no.data;
    }
    return { texto, mapa };
  }

  function lerCampo(estado) {
    if (estado.tipo === 'texto') return estado.el.value;
    const { texto, mapa } = lerTextoEditavel(estado.el);
    estado.mapa = mapa;
    return texto;
  }

  function pontoNoDom(mapa, deslocamento) {
    for (let i = mapa.length - 1; i >= 0; i--) {
      const { no, inicio } = mapa[i];
      if (deslocamento >= inicio && deslocamento <= inicio + no.data.length) return [no, deslocamento - inicio];
    }
    return null;
  }

  function chaveIgnorada(s) {
    return `${s.original}\u0000${s.substituicao}`;
  }

  function guardarNoCache(paragrafo, sugestoes, provisorio = false) {
    cache.delete(paragrafo);
    cache.set(paragrafo, sugestoes);
    if (provisorio) provisorios.add(paragrafo);
    else provisorios.delete(paragrafo);
    if (cache.size > ENTRADAS_NO_CACHE) {
      const maisAntigo = cache.keys().next().value;
      cache.delete(maisAntigo);
      provisorios.delete(maisAntigo);
    }
  }

  function limparCache() {
    cache.clear();
    provisorios.clear();
  }

  function calcularMarcas(estado, texto) {
    const marcas = [];
    for (const p of dividirParagrafos(texto)) {
      for (const s of cache.get(p.texto) || []) {
        if (estado.ignoradas.has(chaveIgnorada(s))) continue;
        marcas.push({ ...s, paragrafo: p.texto, base: p.inicio, relativo: s, inicio: p.inicio + s.inicio, fim: p.inicio + s.fim });
      }
    }
    return marcas;
  }

  function calcularTrechos(marcas) {
    const porParagrafo = new Map();
    marcas.forEach((m, indice) => {
      if (!porParagrafo.has(m.base)) porParagrafo.set(m.base, []);
      porParagrafo.get(m.base).push({ ...m.relativo, indice });
    });
    const trechos = [];
    for (const [base, relativos] of porParagrafo) {
      const paragrafo = marcas[relativos[0].indice].paragrafo;
      for (const t of trechosDoParagrafo(paragrafo, relativos)) {
        trechos.push({ paragrafo, base, inicio: base + t.inicio, fim: base + t.fim, relativo: t, indices: t.sugestoes.map((s) => s.indice) });
      }
    }
    return trechos;
  }

  function garantirCamada() {
    if (camada?.host.isConnected) return camada;
    const host = document.createElement('revisor-gemini-camada');
    host.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;';
    const sombra = host.attachShadow({ mode: 'open' });
    const estilo = document.createElement('link');
    estilo.rel = 'stylesheet';
    estilo.href = chrome.runtime.getURL('src/camada.css');
    sombra.append(estilo);
    document.documentElement.append(host);
    camada = { host, sombra };
    return camada;
  }

  const ESTILOS_COPIADOS = [
    'boxSizing', 'width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'lineHeight',
    'letterSpacing', 'wordSpacing', 'textAlign', 'textIndent', 'textTransform', 'direction', 'tabSize',
  ];

  function posicionarEspelho(estado) {
    const { el, espelho } = estado;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    for (const p of ESTILOS_COPIADOS) espelho.style[p] = cs[p];
    espelho.style.left = `${r.left + scrollX}px`;
    espelho.style.top = `${r.top + scrollY}px`;
    espelho.style.width = `${r.width}px`;
    espelho.style.height = `${r.height}px`;
    espelho.style.boxSizing = 'border-box';
    espelho.style.whiteSpace = el instanceof HTMLInputElement ? 'pre' : 'pre-wrap';
    espelho.style.overflowWrap = el instanceof HTMLInputElement ? 'normal' : 'break-word';
    espelho.style.display = r.width && r.height ? 'block' : 'none';
    espelho.scrollTop = el.scrollTop;
    espelho.scrollLeft = el.scrollLeft;
  }

  function desenharEspelho(estado, texto) {
    if (!estado.marcas.length) {
      estado.espelho?.remove();
      estado.espelho = null;
      return;
    }
    if (!estado.espelho) {
      estado.espelho = document.createElement('div');
      estado.espelho.className = 'espelho';
      garantirCamada().sombra.append(estado.espelho);
      estado.observador = new ResizeObserver(() => estado.espelho && posicionarEspelho(estado));
      estado.observador.observe(estado.el);
    }
    const partes = [];
    let cursor = 0;
    estado.marcas.forEach((m, i) => {
      partes.push(document.createTextNode(texto.slice(cursor, m.inicio)));
      const span = document.createElement('span');
      span.className = `marca marca-${m.tipo}`;
      span.dataset.indice = String(i);
      span.textContent = texto.slice(m.inicio, m.fim);
      partes.push(span);
      cursor = m.fim;
    });
    partes.push(document.createTextNode(`${texto.slice(cursor)}​`));
    estado.espelho.replaceChildren(...partes);
    posicionarEspelho(estado);
  }

  function reconstruirHighlights() {
    if (!globalThis.CSS?.highlights) return;
    for (const tipo of TIPOS) {
      const ranges = [];
      for (const estado of campos.values()) {
        estado.ranges.forEach((r, i) => r && estado.marcas[i]?.tipo === tipo && ranges.push(r));
      }
      if (ranges.length) CSS.highlights.set(`revisor-${tipo}`, new Highlight(...ranges));
      else CSS.highlights.delete(`revisor-${tipo}`);
    }
  }

  function desenharEditavel(estado) {
    estado.ranges = estado.marcas.map((m) => {
      const inicio = pontoNoDom(estado.mapa, m.inicio);
      const fim = pontoNoDom(estado.mapa, m.fim);
      if (!inicio || !fim) return null;
      const r = document.createRange();
      r.setStart(...inicio);
      r.setEnd(...fim);
      return r;
    });
    reconstruirHighlights();
  }

  function desenhar(estado) {
    if (!estado.el.isConnected) {
      descartarCampo(estado);
      campos.delete(estado.el);
      return;
    }
    const texto = lerCampo(estado);
    estado.marcas = calcularMarcas(estado, texto);
    estado.trechos = calcularTrechos(estado.marcas);
    if (estado.tipo === 'texto') desenharEspelho(estado, texto);
    else desenharEditavel(estado);
    if (alvoDoCartao?.estado === estado) atualizarCartao();
  }

  function posicaoDoCursor(estado, texto) {
    if (estado.tipo === 'texto') return estado.el.selectionStart ?? texto.length;
    const sel = getSelection();
    if (!sel?.rangeCount) return texto.length;
    const { startContainer, startOffset } = sel.getRangeAt(0);
    const item = estado.mapa.find((m) => m.no === startContainer);
    return item ? item.inicio + startOffset : texto.length;
  }

  function pedirRevisao(mensagem, aoParcial) {
    return new Promise((resolver, rejeitar) => {
      const porta = chrome.runtime.connect({ name: 'revisar' });
      porta.onMessage.addListener((m) => {
        if (m.parcial) return aoParcial(m.parcial);
        resolver(m.final);
        porta.disconnect();
      });
      porta.onDisconnect.addListener(() => rejeitar(new Error('revisão interrompida')));
      porta.postMessage(mensagem);
    });
  }

  async function revisarCampo(estado, pedido, rapida = false) {
    if (!ativo || !estado.el.isConnected) return;
    const texto = lerCampo(estado);
    const cursor = posicaoDoCursor(estado, texto);
    const candidatos = dividirParagrafos(texto)
      .filter((p) => revisavel(p.texto) && (pedido || !cache.has(p.texto) || (!rapida && provisorios.has(p.texto))));
    if (!rapida && candidatos.some((p) => emVoo.has(p.texto))) {
      clearTimeout(estado.timerModelo);
      estado.timerModelo = setTimeout(() => revisarCampo(estado, false), ESPERA_RAPIDA_MS);
    }
    const pendentes = candidatos
      .filter((p) => !emVoo.has(p.texto))
      .sort((a, b) => Math.abs(a.inicio - cursor) - Math.abs(b.inicio - cursor))
      .slice(0, pedido ? PARAGRAFOS_POR_PEDIDO : PARAGRAFOS_POR_PAUSA);
    await Promise.all(
      pendentes.map(async ({ texto: paragrafo }) => {
        emVoo.add(paragrafo);
        try {
          const resposta = await pedirRevisao({ texto: paragrafo, pedido, modelo: !rapida }, (parcial) => {
            if (parcial.sugestoes.length < (cache.get(paragrafo)?.length ?? 0)) return;
            guardarNoCache(paragrafo, parcial.sugestoes, true);
            if (ativo && campos.get(estado.el) === estado) desenhar(estado);
          });
          if (resposta?.sugestoes) guardarNoCache(paragrafo, resposta.sugestoes, Boolean(resposta.provisorio));
          if (resposta?.erro === 'pausado') definirAtivo(false);
        } catch {
          definirAtivo(false);
        } finally {
          emVoo.delete(paragrafo);
        }
      }),
    );
    if (ativo && campos.get(estado.el) === estado) desenhar(estado);
  }

  function campoDoEvento(evento) {
    const origem = evento.composedPath()[0];
    return estadoDe(origem instanceof HTMLElement && origem.isContentEditable ? raizEditavel(origem) : origem);
  }

  function aoDigitar(evento) {
    if (!ativo) return;
    const estado = campoDoEvento(evento);
    if (estado) agendarRevisao(estado);
  }

  function aoFocar(evento) {
    if (!ativo) return;
    const estado = campoDoEvento(evento);
    if (estado?.tipo !== 'editavel' || estado.mutacoes) return;
    estado.mutacoes = new MutationObserver(() => agendarRevisao(estado));
    estado.mutacoes.observe(estado.el, { characterData: true, childList: true, subtree: true });
  }

  function agendarRevisao(estado) {
    desenhar(estado);
    clearTimeout(estado.timer);
    clearTimeout(estado.timerModelo);
    estado.timer = setTimeout(() => revisarCampo(estado, false, true), ESPERA_RAPIDA_MS);
    estado.timerModelo = setTimeout(() => revisarCampo(estado, false), ESPERA_MODELO_MS);
  }

  function contemPonto(rects, x, y) {
    for (const r of rects) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom + FOLGA_VERTICAL_PX) return r;
    }
    return null;
  }

  function marcaSobPonto(x, y) {
    for (const estado of campos.values()) {
      if (estado.tipo === 'texto' && estado.espelho) {
        for (const span of estado.espelho.querySelectorAll('.marca')) {
          const r = contemPonto(span.getClientRects(), x, y);
          if (r) return { estado, indice: Number(span.dataset.indice) };
        }
      } else if (estado.tipo === 'editavel') {
        for (let i = 0; i < estado.ranges.length; i++) {
          const r = estado.ranges[i] && contemPonto(estado.ranges[i].getClientRects(), x, y);
          if (r) return { estado, indice: i };
        }
      }
    }
    return null;
  }

  function botao(texto, classe, acao) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classe;
    b.textContent = texto;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', acao);
    return b;
  }

  function elemento(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  function textoDoTrecho(trecho) {
    return trecho.paragrafo.slice(trecho.relativo.inicio, trecho.relativo.fim);
  }

  function chaveDoTrecho(trecho) {
    return `${trecho.inicio}\u0000${textoDoTrecho(trecho)}`;
  }

  function assinaturaDoTrecho(estado, indice) {
    const trecho = estado.trechos[indice];
    const trocas = trecho.indices.map((i) => chaveIgnorada(estado.marcas[i]));
    return `${indice}/${estado.trechos.length}\u0000${chaveDoTrecho(trecho)}\u0000${trocas.join('\u0001')}\u0000${JSON.stringify(alvoDoCartao.reescrita || null)}`;
  }

  function rectDaMarca(estado, i) {
    if (estado.tipo === 'texto') return estado.espelho?.querySelector(`.marca[data-indice="${i}"]`)?.getClientRects()[0] || null;
    return estado.ranges[i]?.getClientRects()[0] || null;
  }

  function desenharPartes(previa, partes) {
    for (const parte of partes) {
      if ('igual' in parte) {
        previa.append(parte.igual);
        continue;
      }
      const tipo = parte.tipo || 'gramatica';
      if (parte.de) previa.append(elemento('span', `de de-${tipo}`, parte.de));
      if (parte.para) previa.append(elemento('span', `para para-${tipo}`, parte.para));
    }
  }

  function seletorDeTom(valor, rotuloVazio, aoMudar) {
    const tons = elemento('label', 'tons', 'Tom ');
    const escolha = document.createElement('select');
    escolha.className = 'escolha-tom';
    escolha.append(new Option(rotuloVazio, ''), ...Object.entries(ROTULOS_DE_TOM).map(([v, rotulo]) => new Option(rotulo, v)));
    escolha.value = valor;
    escolha.addEventListener('mousedown', () => (alvoDoCartao.fixo = true));
    escolha.addEventListener('change', () => aoMudar(escolha.value));
    tons.append(escolha);
    return tons;
  }

  function mostrarCartaoDaMarca({ estado, indice }) {
    if (alvoDoCartao?.verificacao) return;
    const trecho = estado.trechos.findIndex((t) => t.indices.includes(indice));
    if (trecho === -1) return;
    clearTimeout(timerEsconder);
    if (alvoDoCartao?.estado === estado && alvoDoCartao.indice === trecho) return;
    alvoDoCartao = { estado, indice: trecho, fixo: false };
    renderizarCartao();
  }

  function irPara(indice) {
    const { estado } = alvoDoCartao;
    const total = estado.trechos.length;
    alvoDoCartao.indice = (indice + total) % total;
    alvoDoCartao.fixo = true;
    alvoDoCartao.reescrita = null;
    renderizarCartao();
  }

  function atualizarCartao() {
    const { estado, chave, indice } = alvoDoCartao;
    if (!estado.trechos.length) {
      esconderCartao();
      return;
    }
    const mesmo = estado.trechos.findIndex((t) => chaveDoTrecho(t) === chave);
    if (mesmo === -1 && !alvoDoCartao.avancar) {
      esconderCartao();
      return;
    }
    alvoDoCartao.avancar = false;
    alvoDoCartao.indice = mesmo !== -1 ? mesmo : Math.min(indice, estado.trechos.length - 1);
    if (mesmo === -1) alvoDoCartao.reescrita = null;
    renderizarCartao();
  }

  function renderizarCartao() {
    const { estado, indice, reescrita } = alvoDoCartao;
    const trecho = estado.trechos[indice];
    const assinatura = assinaturaDoTrecho(estado, indice);
    if (cartao && alvoDoCartao.assinatura === assinatura) {
      posicionarCartao();
      return;
    }
    cartao?.remove();
    alvoDoCartao.chave = chaveDoTrecho(trecho);
    alvoDoCartao.assinatura = assinatura;
    const marcas = trecho.indices.map((i) => estado.marcas[i]);

    cartao = elemento('div', `cartao cartao-${marcas[0].tipo}`);
    const cabecalho = elemento('div', 'cabecalho');
    const tipos = [...new Set(marcas.map((m) => m.tipo))];
    cabecalho.append(elemento('div', 'tipo', tipos.map((t) => ROTULOS[t]).join(' · ')));
    const navegacao = elemento('div', 'navegacao');
    if (estado.trechos.length > 1) {
      navegacao.append(
        botao('‹', 'seta', () => irPara(indice - 1)),
        elemento('span', 'pagina', `${indice + 1} de ${estado.trechos.length}`),
        botao('›', 'seta', () => irPara(indice + 1)),
      );
    }
    navegacao.append(botao('×', 'fechar', esconderCartao));
    cabecalho.append(navegacao);

    const previa = elemento('p', 'previa');
    const motivos = elemento('ul', 'motivos');
    let origens;
    if (reescrita?.texto) {
      previa.append(elemento('span', 'para para-tom', reescrita.texto));
      motivos.append(elemento('li', 'motivo motivo-tom', `Reescrito no tom ${ROTULOS_DE_TOM[reescrita.tom].toLowerCase()}`));
      origens = [reescrita.modelo ? `${ROTULOS_DE_ORIGEM.openrouter} (${reescrita.modelo})` : ROTULOS_DE_ORIGEM.openrouter];
    } else {
      desenharPartes(previa, partesDoTrecho(trecho.paragrafo, trecho.relativo));
      if (reescrita) {
        const aviso = reescrita.erro ? `Não deu para reescrever: ${reescrita.erro}` : `Reescrevendo no tom ${ROTULOS_DE_TOM[reescrita.tom].toLowerCase()}…`;
        motivos.append(elemento('li', 'motivo motivo-tom', aviso));
      }
      for (const m of marcas) {
        if (m.motivo) motivos.append(elemento('li', `motivo motivo-${m.tipo}`, m.motivo));
      }
      origens = [...new Set(marcas.map((m) => (m.modelo ? `${ROTULOS_DE_ORIGEM[m.origem]} (${m.modelo})` : ROTULOS_DE_ORIGEM[m.origem])))];
    }

    const tons = seletorDeTom(reescrita?.tom || '', 'ajustar…', reescrever);

    const acoes = elemento('div', 'acoes');
    acoes.append(
      botao('Substituir', 'aplicar', () => (reescrita?.texto ? substituirPelaReescrita(estado, trecho, reescrita.texto) : substituir(estado, trecho))),
      botao('Ignorar', 'secundario', () => ignorar(estado, marcas)),
      ...(marcas.length === 1 && marcas[0].tipo === 'gramatica' && marcas[0].origem !== 'openrouter' ? [botao('Adicionar ao dicionário', 'secundario', () => adicionarAoDicionario(marcas[0]))] : []),
    );
    cartao.append(cabecalho, previa, motivos, elemento('p', 'origem', `via ${origens.join(' · ')}`), tons, acoes);
    cartao.addEventListener('mouseenter', () => clearTimeout(timerEsconder));
    cartao.addEventListener('mouseleave', () => alvoDoCartao?.fixo || agendarEsconder());
    garantirCamada().sombra.append(cartao);
    posicionarCartao();
  }

  function posicionarCartao() {
    const { estado, indice, verificacao } = alvoDoCartao;
    const rect = verificacao
      ? { left: verificacao.x, right: verificacao.x, top: verificacao.y, bottom: verificacao.y }
      : rectDaMarca(estado, estado.trechos[indice].indices[0]) || estado.el.getBoundingClientRect();
    const largura = cartao.offsetWidth;
    const esquerda = Math.min(Math.max(8, rect.left), innerWidth - largura - 8);
    const abaixo = rect.bottom + 8 + cartao.offsetHeight < innerHeight;
    cartao.style.left = `${esquerda + scrollX}px`;
    cartao.style.top = `${(abaixo ? rect.bottom + 6 : Math.max(8, rect.top - cartao.offsetHeight - 6)) + scrollY}px`;
  }

  function esconderCartao() {
    clearTimeout(timerEsconder);
    cartao?.remove();
    cartao = null;
    alvoDoCartao = null;
  }

  function agendarEsconder() {
    clearTimeout(timerEsconder);
    timerEsconder = setTimeout(esconderCartao, ATRASO_PARA_ESCONDER_MS);
  }

  async function reescrever(tom) {
    const alvo = alvoDoCartao;
    alvo.fixo = true;
    alvo.reescrita = tom ? { tom } : null;
    renderizarCartao();
    if (!tom) return;
    const trecho = alvo.estado.trechos[alvo.indice];
    let resposta;
    try {
      resposta = await chrome.runtime.sendMessage({ tipo: 'reescrever', texto: textoDoTrecho(trecho), tom });
    } catch {
      resposta = { erro: 'a extensão não respondeu' };
    }
    if (alvoDoCartao !== alvo || alvo.reescrita?.tom !== tom || alvo.reescrita.texto) return;
    alvo.reescrita = typeof resposta?.texto === 'string'
      ? { tom, texto: resposta.texto.trim(), modelo: resposta.modelo }
      : { tom, erro: resposta?.erro || 'resposta vazia' };
    renderizarCartao();
  }

  function substituirPelaReescrita(estado, trecho, texto) {
    if (lerCampo(estado).slice(trecho.inicio, trecho.fim) !== textoDoTrecho(trecho)) {
      desenhar(estado);
      return;
    }
    alvoDoCartao.fixo = true;
    alvoDoCartao.avancar = true;
    alvoDoCartao.reescrita = null;
    trocarNoCampo(estado, { inicio: trecho.inicio, fim: trecho.fim, substituicao: texto });
    desenhar(estado);
  }

  function substituir(estado, trecho) {
    const texto = lerCampo(estado);
    if (texto.slice(trecho.inicio, trecho.fim) !== textoDoTrecho(trecho)) {
      desenhar(estado);
      return;
    }
    const novo = aplicarTrecho(trecho.paragrafo, cache.get(trecho.paragrafo) || trecho.relativo.sugestoes, trecho.relativo);
    guardarNoCache(novo.texto, novo.sugestoes);
    const primeira = trecho.relativo.sugestoes[0];
    const ultimoFim = Math.max(...trecho.relativo.sugestoes.map((s) => s.fim));
    const delta = novo.texto.length - trecho.paragrafo.length;
    alvoDoCartao.fixo = true;
    alvoDoCartao.avancar = true;
    trocarNoCampo(estado, {
      inicio: trecho.base + primeira.inicio,
      fim: trecho.base + ultimoFim,
      substituicao: novo.texto.slice(primeira.inicio, ultimoFim + delta),
    });
    desenhar(estado);
  }

  function trocarNoCampo(estado, marca) {
    if (estado.tipo === 'texto') {
      estado.el.focus();
      estado.el.setRangeText(marca.substituicao, marca.inicio, marca.fim, 'end');
      estado.el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: marca.substituicao }));
      return;
    }
    const inicio = pontoNoDom(estado.mapa, marca.inicio);
    const fim = pontoNoDom(estado.mapa, marca.fim);
    if (!inicio || !fim) return;
    const r = document.createRange();
    r.setStart(...inicio);
    r.setEnd(...fim);
    selecionarESubstituir(estado.el, r, marca.substituicao);
  }

  function selecionarESubstituir(el, range, texto) {
    el.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const antes = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: texto ? 'insertText' : 'deleteContentBackward',
      data: texto || null,
      targetRanges: [new StaticRange(range)],
    });
    if (!el.dispatchEvent(antes)) return;
    if (texto) document.execCommand('insertText', false, texto);
    else document.execCommand('delete');
  }

  function capturarAlvoDoMenu(evento) {
    const origem = evento.composedPath()[0];
    const el = origem instanceof HTMLElement && origem.isContentEditable ? raizEditavel(origem) : origem;
    const tipo = tipoDoCampo(el);
    const base = { x: evento.clientX, y: evento.clientY, el, tipo };
    if (tipo === 'texto') {
      const temSelecao = el.selectionStart !== el.selectionEnd;
      const inicio = temSelecao ? el.selectionStart : 0;
      const fim = temSelecao ? el.selectionEnd : el.value.length;
      return { ...base, inicio, fim, texto: el.value.slice(inicio, fim) };
    }
    const sel = getSelection();
    const selecao = sel?.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0).cloneRange() : null;
    if (tipo === 'editavel') {
      if (selecao && el.contains(selecao.commonAncestorContainer)) return { ...base, range: selecao, texto: selecao.toString().replace(INVISIVEIS, '') };
      return { ...base, texto: lerTextoEditavel(el).texto.replace(INVISIVEIS, '').trim() };
    }
    return selecao ? { ...base, el: null, tipo: null, texto: selecao.toString().replace(INVISIVEIS, '') } : null;
  }

  function verificarAqui() {
    const alvo = alvoDoMenu;
    if (!alvo?.texto.trim()) return;
    esconderCartao();
    alvoDoCartao = { verificacao: { ...alvo }, fixo: true };
    pedirVerificacao('');
  }

  async function pedirVerificacao(tom) {
    const alvo = alvoDoCartao;
    const v = alvo.verificacao;
    Object.assign(v, { tom, resultado: null, erro: '' });
    if (!revisavel(v.texto)) v.erro = 'selecione um texto de até 4000 caracteres';
    renderizarVerificacao();
    if (v.erro) return;
    let resposta;
    try {
      resposta = await chrome.runtime.sendMessage({ tipo: 'reescrever', texto: v.texto, tom });
    } catch {
      resposta = { erro: 'a extensão não respondeu' };
    }
    if (alvoDoCartao !== alvo || v.tom !== tom) return;
    if (typeof resposta?.texto === 'string') v.resultado = { texto: resposta.texto, modelo: resposta.modelo };
    else v.erro = resposta?.erro || 'resposta vazia';
    renderizarVerificacao();
  }

  function renderizarVerificacao() {
    const v = alvoDoCartao.verificacao;
    cartao?.remove();
    cartao = elemento('div', 'cartao cartao-gramatica cartao-verificacao');
    const cabecalho = elemento('div', 'cabecalho');
    cabecalho.append(elemento('div', 'tipo', 'Verificação'), elemento('div', 'navegacao'));
    cabecalho.lastChild.append(botao('×', 'fechar', esconderCartao));
    const previa = elemento('p', 'previa');
    const motivos = elemento('ul', 'motivos');
    const acoes = elemento('div', 'acoes');
    const mudou = v.resultado && v.resultado.texto !== v.texto;
    if (v.resultado) desenharPartes(previa, diferencaDePalavras(v.texto, v.resultado.texto));
    else previa.append(v.texto);
    if (v.erro) motivos.append(elemento('li', 'motivo motivo-gramatica', `Não deu para verificar: ${v.erro}`));
    else if (!v.resultado) motivos.append(elemento('li', 'motivo motivo-clareza', 'Verificando ortografia, pontuação, maiúsculas e a escrita…'));
    else if (!mudou) motivos.append(elemento('li', 'motivo motivo-clareza', 'Nada a corrigir.'));
    if (mudou) {
      acoes.append(v.tipo
        ? botao('Substituir', 'aplicar', () => substituirVerificacao(v))
        : botao('Copiar', 'aplicar', () => navigator.clipboard.writeText(v.resultado.texto).then(esconderCartao, () => {})));
    }
    const partes = [cabecalho, previa, motivos];
    if (v.resultado) partes.push(elemento('p', 'origem', v.resultado.modelo ? `via ${ROTULOS_DE_ORIGEM.openrouter} (${v.resultado.modelo})` : `via ${ROTULOS_DE_ORIGEM.openrouter}`));
    partes.push(seletorDeTom(v.tom, 'manter', pedirVerificacao), acoes);
    cartao.append(...partes);
    garantirCamada().sombra.append(cartao);
    posicionarCartao();
  }

  function ocorrenciaUnica(texto, alvo) {
    const p = texto.indexOf(alvo);
    return p !== -1 && texto.indexOf(alvo, p + 1) === -1 ? p : -1;
  }

  function localizarVerificado(v) {
    if (v.tipo === 'texto') {
      if (v.el.value.slice(v.inicio, v.fim) === v.texto) return { inicio: v.inicio, fim: v.fim };
      const p = ocorrenciaUnica(v.el.value, v.texto);
      return p === -1 ? null : { inicio: p, fim: p + v.texto.length };
    }
    if (v.range?.toString().replace(INVISIVEIS, '') === v.texto) return v.range;
    const { texto, mapa } = lerTextoEditavel(v.el);
    const posicoes = [];
    let limpo = '';
    for (let i = 0; i < texto.length; i++) {
      if (/[\u200B\u2060\uFEFF]/.test(texto[i])) continue;
      posicoes.push(i);
      limpo += texto[i];
    }
    const p = ocorrenciaUnica(limpo, v.texto);
    const inicio = pontoNoDom(mapa, posicoes[p]);
    const fim = pontoNoDom(mapa, posicoes[p + v.texto.length - 1] + 1);
    if (!inicio || !fim) return null;
    const r = document.createRange();
    r.setStart(...inicio);
    r.setEnd(...fim);
    return r;
  }

  function substituirVerificacao(v) {
    const alvo = v.el.isConnected ? localizarVerificado(v) : null;
    if (!alvo) {
      v.erro = 'o trecho verificado foi editado; verifique de novo';
      v.resultado = null;
      renderizarVerificacao();
      return;
    }
    if (v.tipo === 'texto') trocarNoCampo({ tipo: 'texto', el: v.el }, { ...alvo, substituicao: v.resultado.texto });
    else selecionarESubstituir(v.el, alvo, v.resultado.texto);
    esconderCartao();
  }

  function ignorar(estado, marcas) {
    for (const m of marcas) estado.ignoradas.add(chaveIgnorada(m));
    if (alvoDoCartao) Object.assign(alvoDoCartao, { fixo: true, avancar: true });
    desenhar(estado);
  }

  async function adicionarAoDicionario(marca) {
    const termo = marca.original.trim();
    esconderCartao();
    try {
      const { dicionario = [] } = await chrome.storage.local.get('dicionario');
      if (!dicionario.some((p) => p.toLocaleLowerCase('pt-BR') === termo.toLocaleLowerCase('pt-BR'))) {
        await chrome.storage.local.set({ dicionario: [...dicionario, termo] });
      }
    } catch {
      definirAtivo(false);
    }
  }

  function filtrarCachePeloDicionario(dicionario) {
    for (const [paragrafo, sugestoes] of cache) {
      cache.set(paragrafo, sugestoes.filter((s) => !contemPalavraDoDicionario(s.original, dicionario)));
    }
    for (const estado of campos.values()) desenhar(estado);
  }

  function aoMoverMouse(evento) {
    if (!ativo || !campos.size) return;
    const { clientX: x, clientY: y } = evento;
    if (quadroPendente) return;
    quadroPendente = requestAnimationFrame(() => {
      quadroPendente = 0;
      if (cartao && contemPonto([cartao.getBoundingClientRect()], x, y)) return;
      const alvo = marcaSobPonto(x, y);
      if (alvo) mostrarCartaoDaMarca(alvo);
      else if (cartao && !alvoDoCartao.fixo) agendarEsconder();
    });
  }

  function aoRolarOuRedimensionar() {
    if (cartao && !alvoDoCartao.verificacao) posicionarCartao();
    for (const estado of campos.values()) if (estado.espelho) posicionarEspelho(estado);
  }

  document.addEventListener('input', aoDigitar, true);
  document.addEventListener('focusin', aoFocar, true);
  document.addEventListener('contextmenu', (e) => (alvoDoMenu = capturarAlvoDoMenu(e)), true);
  document.addEventListener('mousemove', aoMoverMouse, { passive: true, capture: true });
  document.addEventListener('mousedown', (e) => cartao && !e.composedPath().includes(cartao) && esconderCartao(), true);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && cartao && esconderCartao(), true);
  document.addEventListener('scroll', aoRolarOuRedimensionar, { passive: true, capture: true });
  addEventListener('resize', aoRolarOuRedimensionar, { passive: true });

  function revisarPorPedido() {
    if (!ativo) return;
    let focado = document.activeElement;
    while (focado?.shadowRoot?.activeElement) focado = focado.shadowRoot.activeElement;
    if (focado instanceof HTMLElement) estadoDe(focado.isContentEditable ? raizEditavel(focado) : focado);
    for (const estado of campos.values()) revisarCampo(estado, true);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.tipo === 'pausa') {
      if (msg.pausado) definirAtivo(false);
      else avaliarAtivo();
    }
    if (msg?.tipo === 'revisarPedido') revisarPorPedido();
    if (msg?.tipo === 'verificarAqui') verificarAqui();
  });

  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== 'local') return;
    if (mudancas.sitesExcluidos) avaliarAtivo();
    if (mudancas.tom || mudancas.chaveOpenrouter) limparCache();
    if (mudancas.dicionario) filtrarCachePeloDicionario(mudancas.dicionario.newValue || []);
  });

  avaliarAtivo();
})();
