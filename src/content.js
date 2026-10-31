(() => {
  if (globalThis.__revisorGemini) return;
  globalThis.__revisorGemini = true;

  const { TIPOS, dividirParagrafos, revisavel, contemPalavraDoDicionario, aplicarNoParagrafo } = RevisorCore;
  const ESPERA_DIGITACAO_MS = 1200;
  const PARAGRAFOS_POR_PAUSA = 3;
  const PARAGRAFOS_POR_PEDIDO = 10;
  const ENTRADAS_NO_CACHE = 300;
  const FOLGA_VERTICAL_PX = 4;
  const ATRASO_PARA_ESCONDER_MS = 250;
  const HOSTS_FORA_DO_ESCOPO = ['docs.google.com'];
  const EDITORES_DE_CODIGO = '.cm-editor,.CodeMirror,.monaco-editor,.ace_editor';
  const CAMPO_SENSIVEL = /senha|password|passwd|cart[aã]o|card.?(num|number)|cc-?(num|number|csc|exp)|cvv|cvc|security.?code|validade|expira/i;
  const BLOCOS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'TR', 'SECTION', 'ARTICLE']);
  const ROTULOS = { gramatica: 'Ortografia e gramática', clareza: 'Clareza', palavra: 'Troca de palavra', tom: 'Tom' };

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
    estado.espelho?.remove();
    estado.observador?.disconnect();
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
        marcas.push({ ...s, paragrafo: p.texto, relativo: s, inicio: p.inicio + s.inicio, fim: p.inicio + s.fim });
      }
    }
    return marcas;
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
    if (estado.tipo === 'texto') desenharEspelho(estado, texto);
    else desenharEditavel(estado);
    if (alvoDoCartao?.estado === estado) esconderCartao();
  }

  function posicaoDoCursor(estado, texto) {
    if (estado.tipo === 'texto') return estado.el.selectionStart ?? texto.length;
    const sel = getSelection();
    if (!sel?.rangeCount) return texto.length;
    const { startContainer, startOffset } = sel.getRangeAt(0);
    const item = estado.mapa.find((m) => m.no === startContainer);
    return item ? item.inicio + startOffset : texto.length;
  }

  async function revisarCampo(estado, pedido) {
    if (!ativo || !estado.el.isConnected) return;
    const texto = lerCampo(estado);
    const cursor = posicaoDoCursor(estado, texto);
    const pendentes = dividirParagrafos(texto)
      .filter((p) => revisavel(p.texto) && (pedido || !cache.has(p.texto) || provisorios.has(p.texto)) && !emVoo.has(p.texto))
      .sort((a, b) => Math.abs(a.inicio - cursor) - Math.abs(b.inicio - cursor))
      .slice(0, pedido ? PARAGRAFOS_POR_PEDIDO : PARAGRAFOS_POR_PAUSA);
    await Promise.all(
      pendentes.map(async ({ texto: paragrafo }) => {
        emVoo.add(paragrafo);
        try {
          const resposta = await chrome.runtime.sendMessage({ tipo: 'revisar', texto: paragrafo, pedido });
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

  function aoDigitar(evento) {
    if (!ativo) return;
    const alvo = evento.target instanceof HTMLElement && evento.target.isContentEditable ? raizEditavel(evento.target) : evento.target;
    const estado = estadoDe(alvo);
    if (!estado) return;
    desenhar(estado);
    clearTimeout(estado.timer);
    estado.timer = setTimeout(() => revisarCampo(estado), ESPERA_DIGITACAO_MS);
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
          if (r) return { estado, indice: Number(span.dataset.indice), rect: r };
        }
      } else if (estado.tipo === 'editavel') {
        for (let i = 0; i < estado.ranges.length; i++) {
          const r = estado.ranges[i] && contemPonto(estado.ranges[i].getClientRects(), x, y);
          if (r) return { estado, indice: i, rect: r };
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

  function mostrarCartao(alvo) {
    const { estado, indice, rect } = alvo;
    const marca = estado.marcas[indice];
    if (!marca) return;
    clearTimeout(timerEsconder);
    if (alvoDoCartao && alvoDoCartao.estado === estado && alvoDoCartao.indice === indice) return;
    esconderCartao();
    alvoDoCartao = { estado, indice };

    cartao = document.createElement('div');
    cartao.className = `cartao cartao-${marca.tipo}`;
    const tipo = document.createElement('div');
    tipo.className = 'tipo';
    tipo.textContent = ROTULOS[marca.tipo];
    const troca = document.createElement('div');
    troca.className = 'troca';
    const de = document.createElement('span');
    de.className = 'de';
    de.textContent = marca.original;
    const para = document.createElement('span');
    para.className = 'para';
    para.textContent = marca.substituicao || '(remover)';
    troca.append(de, para);
    const motivo = document.createElement('p');
    motivo.className = 'motivo';
    motivo.textContent = marca.motivo;
    const acoes = document.createElement('div');
    acoes.className = 'acoes';
    acoes.append(
      botao('Aplicar', 'aplicar', () => aplicar(estado, marca)),
      botao('Ignorar', 'secundario', () => ignorar(estado, marca)),
      botao('Adicionar ao dicionário', 'secundario', () => adicionarAoDicionario(marca)),
    );
    cartao.append(tipo, troca, motivo, acoes);
    cartao.addEventListener('mouseenter', () => clearTimeout(timerEsconder));
    cartao.addEventListener('mouseleave', agendarEsconder);
    garantirCamada().sombra.append(cartao);

    const largura = cartao.offsetWidth;
    const esquerda = Math.min(Math.max(8, rect.left), innerWidth - largura - 8);
    const abaixo = rect.bottom + 8 + cartao.offsetHeight < innerHeight;
    cartao.style.left = `${esquerda + scrollX}px`;
    cartao.style.top = `${(abaixo ? rect.bottom + 6 : rect.top - cartao.offsetHeight - 6) + scrollY}px`;
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

  function aplicar(estado, marca) {
    const texto = lerCampo(estado);
    if (texto.slice(marca.inicio, marca.fim) !== marca.original) {
      desenhar(estado);
      return;
    }
    const doParagrafo = cache.get(marca.paragrafo);
    if (doParagrafo) {
      const novo = aplicarNoParagrafo(marca.paragrafo, doParagrafo, marca.relativo);
      guardarNoCache(novo.texto, novo.sugestoes);
    }
    esconderCartao();
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
    estado.el.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    if (marca.substituicao) document.execCommand('insertText', false, marca.substituicao);
    else document.execCommand('delete');
  }

  function ignorar(estado, marca) {
    estado.ignoradas.add(chaveIgnorada(marca));
    esconderCartao();
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
      if (alvo) mostrarCartao(alvo);
      else if (cartao) agendarEsconder();
    });
  }

  function aoRolarOuRedimensionar() {
    if (cartao) esconderCartao();
    for (const estado of campos.values()) if (estado.espelho) posicionarEspelho(estado);
  }

  document.addEventListener('input', aoDigitar, true);
  document.addEventListener('mousemove', aoMoverMouse, { passive: true, capture: true });
  document.addEventListener('scroll', aoRolarOuRedimensionar, { passive: true, capture: true });
  addEventListener('resize', aoRolarOuRedimensionar, { passive: true });

  function revisarPorPedido() {
    if (!ativo) return;
    const focado = document.activeElement;
    if (focado instanceof HTMLElement) estadoDe(focado.isContentEditable ? raizEditavel(focado) : focado);
    for (const estado of campos.values()) revisarCampo(estado, true);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.tipo === 'pausa') {
      if (msg.pausado) definirAtivo(false);
      else avaliarAtivo();
    }
    if (msg?.tipo === 'revisarPedido') revisarPorPedido();
  });

  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area !== 'local') return;
    if (mudancas.sitesExcluidos) avaliarAtivo();
    if (mudancas.tom || mudancas.chave) limparCache();
    if (mudancas.dicionario) filtrarCachePeloDicionario(mudancas.dicionario.newValue || []);
  });

  avaliarAtivo();
})();
