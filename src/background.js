importScripts('core.js', 'ortografia.js', 'languagetool.js', 'protecao.js', 'armazem.js', 'analise.js', 'vendor/hunspell.js');

const { ENDPOINT, TONS, revisavel, montarRequisicao, lerResposta, montarReescrita, lerReescrita, acrescentaDemais, juntarCamadas, NIVEL_PADRAO, somarConsumo, precosPagos } = RevisorCore;
const { IDIOMAS, IDIOMA_PADRAO, detectarIdioma, sugestoesOrtograficas } = RevisorOrtografia;
const { INSTRUCAO: INSTRUCAO_DE_PROTECAO, mascarar, restaurar, posicaoOriginal } = RevisorProtecao;
const { ENDERECO_LOCAL, enderecoDeVerificacao, enderecoDeIdiomas, pareceLanguageTool, padraoDePermissao, montarCorpo, lerMatches } = RevisorLanguageTool;
const CONFERENCIA_DO_SERVIDOR_VALE_MS = 10 * 60_000;
const servidoresConferidos = new Map();
const ESPERA_LIMITE_POR_MINUTO_MS = 60_000;
const TEMPO_MAXIMO_CHAMADA_MS = 15_000;
const TEMPO_MAXIMO_MODELO_MS = 30_000;
const COR_SELO_COTA = '#EDAE49';
const COR_SELO_PAUSA = '#6B6475';
const ESTADOS_PASSAGEIROS = new Set(['falha', 'sem_conexao', 'limite_por_minuto', 'limite_da_aba', 'cota']);
const CHAMADAS_POR_ABA_POR_MINUTO = 15;
const chamadasPorAba = new Map();

function dentroDoTetoDaAba(abaId) {
  const agora = Date.now();
  const recentes = (chamadasPorAba.get(abaId) || []).filter((momento) => agora - momento < 60_000);
  const dentro = recentes.length < CHAMADAS_POR_ABA_POR_MINUTO;
  if (dentro) recentes.push(agora);
  chamadasPorAba.set(abaId, recentes);
  return dentro;
}
const MENU_VERIFICAR = 'craseup-verificar';

const hoje = () => new Date().toLocaleDateString('sv');

async function arrumarArmazem() {
  await RevisorArmazem.migrar(chrome.storage.local);
  await RevisorArmazem.limparExpirados(chrome.storage.local);
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  arrumarArmazem();
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html?bemvindo=1') });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_VERIFICAR, title: 'Verificar com o CraseUp', contexts: ['editable', 'selection'] });
  });
  atualizarSeloGlobal();
});

chrome.contextMenus.onClicked.addListener((info, aba) => {
  if (info.menuItemId !== MENU_VERIFICAR || aba?.id === undefined) return;
  chrome.tabs.sendMessage(aba.id, { tipo: 'verificarAqui' }, { frameId: info.frameId }).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  arrumarArmazem();
  atualizarSeloGlobal();
});

chrome.tabs.onRemoved.addListener(async (abaId) => {
  chamadasPorAba.delete(abaId);
  const { abasPausadas = [] } = await chrome.storage.session.get('abasPausadas');
  if (abasPausadas.includes(abaId)) {
    await chrome.storage.session.set({ abasPausadas: abasPausadas.filter((id) => id !== abaId) });
  }
});

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === 'local' && 'cota' in mudancas) atualizarSeloGlobal();
});

async function abaPausada(abaId) {
  const { abasPausadas = [] } = await chrome.storage.session.get('abasPausadas');
  return abasPausadas.includes(abaId);
}

async function atualizarSeloGlobal() {
  const { cota } = await chrome.storage.local.get('cota');
  const esgotada = cota?.ate > Date.now();
  await chrome.action.setBadgeBackgroundColor({ color: COR_SELO_COTA });
  await chrome.action.setBadgeText({ text: esgotada ? '!' : '' });
}

async function marcarPausa(abaId, pausado) {
  const { abasPausadas = [] } = await chrome.storage.session.get('abasPausadas');
  const resto = abasPausadas.filter((id) => id !== abaId);
  await chrome.storage.session.set({ abasPausadas: pausado ? [...resto, abaId] : resto });
  await chrome.action.setBadgeBackgroundColor({ tabId: abaId, color: COR_SELO_PAUSA });
  await chrome.action.setBadgeText({ tabId: abaId, text: pausado ? 'off' : '' });
  chrome.tabs.sendMessage(abaId, { tipo: 'pausa', pausado }).catch(() => {});
}

let filaDeContagem = Promise.resolve();
function contarChamada() {
  filaDeContagem = filaDeContagem.then(async () => {
    const { uso } = await chrome.storage.local.get('uso');
    const chamadas = uso?.data === hoje() ? uso.chamadas + 1 : 1;
    await chrome.storage.local.set({ uso: { data: hoje(), chamadas } });
  });
  return filaDeContagem;
}

let filaDeConsumo = Promise.resolve();
function registrarConsumo(modelo, uso) {
  filaDeConsumo = filaDeConsumo.catch(() => {}).then(async () => {
    const { consumo = {} } = await chrome.storage.local.get('consumo');
    await chrome.storage.local.set({ consumo: somarConsumo(consumo, hoje(), modelo || 'desconhecido', uso) });
  });
  return filaDeConsumo;
}

async function atualizarPrecos() {
  const { precos } = await chrome.storage.local.get('precos');
  if (precos?.data === hoje()) return;
  try {
    const resposta = await fetch(`${ENDPOINT}models`, { redirect: 'error', signal: AbortSignal.timeout(TEMPO_MAXIMO_CHAMADA_MS) });
    const { data } = await resposta.json();
    await chrome.storage.local.set({ precos: { data: hoje(), porModelo: precosPagos(data) } });
  } catch {}
}

let verificadores = null;
function carregarVerificadores() {
  verificadores ??= (async () => {
    const modulo = await HunspellAsm.loadModule();
    const ler = async (nome) => new Uint8Array(await (await fetch(chrome.runtime.getURL(`src/dicionarios/${nome}`))).arrayBuffer());
    const carregados = {};
    for (const idioma of IDIOMAS) {
      const aff = modulo.mountBuffer(await ler(`${idioma}.aff`), `${idioma}.aff`);
      const dic = modulo.mountBuffer(await ler(`${idioma}.dic`), `${idioma}.dic`);
      carregados[idioma] = modulo.create(aff, dic);
    }
    return carregados;
  })().catch((erro) => {
    verificadores = null;
    throw erro;
  });
  return verificadores;
}

async function camadaOffline(texto) {
  try {
    const carregados = await carregarVerificadores();
    const idioma = detectarIdioma(texto, carregados);
    return { estado: 'ativa', idioma, sugestoes: sugestoesOrtograficas(texto, idioma, carregados[idioma]) };
  } catch {
    return { estado: 'falha', mensagem: 'os dicionários não carregaram', idioma: IDIOMA_PADRAO, sugestoes: [] };
  }
}

const MEDICOES_POR_CAMADA = 100;
const ESTADOS_SEM_ERRO = new Set(['ativa', 'ocioso']);
const POLITICA = {
  adiarModelo: ({ modelo, languagetool }) => !modelo && (languagetool.estado !== 'ativa' || languagetool.acusou),
};

async function executarCamada(executar) {
  const inicio = performance.now();
  const resultado = await executar();
  return { ...resultado, latenciaMs: Math.round(performance.now() - inicio) };
}

async function revisar(texto, abaId, { pedido, modelo, contexto }, aoAvancar) {
  if (abaId !== undefined && (await abaPausada(abaId))) return { erro: 'pausado' };
  const cfg = { ...(await chrome.storage.local.get(['chaveOpenrouter', 'tom', 'dicionario', 'cota', 'esperaAte', 'languagetool', 'nivel'])), abaId };
  const opcoes = { tom: cfg.tom, dicionario: cfg.dicionario || [], nivel: cfg.nivel || NIVEL_PADRAO };
  const offline = await executarCamada(() => camadaOffline(texto));
  aoAvancar({ sugestoes: juntarCamadas(texto, { offline: offline.sugestoes }, opcoes) });
  const languagetool = await executarCamada(() => camadaLanguageTool(texto, offline.idioma, cfg.languagetool));
  const rapidas = { offline: offline.sugestoes, languagetool: languagetool.sugestoes, abreviacoes: languagetool.abreviacoes };
  const comLanguageTool = { ...opcoes, languagetoolAtivo: languagetool.estado === 'ativa' };
  aoAvancar({ sugestoes: juntarCamadas(texto, rapidas, comLanguageTool) });
  const adiar = POLITICA.adiarModelo({ modelo, languagetool });
  const openrouter = opcoes.nivel < 2 ? { estado: 'ocioso' } : adiar ? { estado: 'adiado' } : await executarCamada(() => camadaModeloCondicionada(texto, offline.idioma, cfg, languagetool, pedido, contexto));
  await registrarCamadas({ offline, languagetool, openrouter });
  return {
    sugestoes: juntarCamadas(texto, { ...rapidas, modelo: openrouter.sugestoes }, comLanguageTool),
    provisorio: adiar || [offline, languagetool, openrouter].some((camada) => ESTADOS_PASSAGEIROS.has(camada.estado)),
  };
}

function semResposta(origem) {
  return navigator.onLine ? { estado: 'falha', mensagem: `sem resposta ${origem}` } : { estado: 'sem_conexao', mensagem: 'sem conexão com a internet' };
}

let filaDeCamadas = Promise.resolve();
function registrarCamadas(novas) {
  filaDeCamadas = filaDeCamadas.catch(() => {}).then(async () => {
    const { camadas: anteriores, historicoDasCamadas: historico = {} } = await chrome.storage.local.get(['camadas', 'historicoDasCamadas']);
    const resumo = { ...anteriores };
    for (const [nome, { estado, mensagem, latenciaMs }] of Object.entries(novas)) {
      if (estado === 'adiado') continue;
      const erro = ESTADOS_SEM_ERRO.has(estado) ? null : estado;
      resumo[nome] = { estado, mensagem, latenciaMs, erro, em: Date.now() };
      historico[nome] = [...(historico[nome] || []), { ms: latenciaMs, erro, em: Date.now() }].slice(-MEDICOES_POR_CAMADA);
    }
    await chrome.storage.local.set({ camadas: resumo, historicoDasCamadas: historico });
  });
  return filaDeCamadas;
}

function matchesForaDosMarcadores(corpo, itens) {
  if (!Array.isArray(corpo.matches)) return corpo;
  const matches = [];
  for (const m of corpo.matches) {
    if (!Number.isInteger(m?.offset) || !Number.isInteger(m.length)) continue;
    const inicio = posicaoOriginal(m.offset, itens);
    const fim = posicaoOriginal(m.offset + m.length, itens);
    if (inicio === null || fim === null || fim - inicio !== m.length) continue;
    matches.push({ ...m, offset: inicio });
  }
  return { matches };
}

async function consultarLanguageTool(base, texto, idioma) {
  if (!(Date.now() - servidoresConferidos.get(base) < CONFERENCIA_DO_SERVIDOR_VALE_MS)) {
    const conferencia = await fetch(enderecoDeIdiomas(base), { redirect: 'error', signal: AbortSignal.timeout(TEMPO_MAXIMO_CHAMADA_MS) }).catch(() => null);
    if (!conferencia) return semResposta('do servidor');
    if (!conferencia.ok) return { estado: 'falha', mensagem: `HTTP ${conferencia.status}` };
    if (!pareceLanguageTool(await conferencia.json().catch(() => null))) return { estado: 'falha', mensagem: 'o endereço não respondeu como um LanguageTool' };
    servidoresConferidos.set(base, Date.now());
  }
  const { texto: mascarado, itens } = mascarar(texto);
  let resposta;
  try {
    resposta = await fetch(enderecoDeVerificacao(base), {
      redirect: 'error',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: montarCorpo(mascarado, idioma),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_CHAMADA_MS),
    });
  } catch {
    return semResposta('do servidor');
  }
  if (!resposta.ok) return { estado: 'falha', mensagem: `HTTP ${resposta.status}` };
  try {
    return { estado: 'ativa', ...lerMatches(matchesForaDosMarcadores(await resposta.json(), itens), texto) };
  } catch {
    return { estado: 'falha', mensagem: 'resposta em formato inesperado' };
  }
}

async function camadaLanguageTool(texto, idioma, base = ENDERECO_LOCAL) {
  if (!(await chrome.permissions.contains({ origins: [padraoDePermissao(base)] }))) return { estado: 'sem_permissao' };
  return consultarLanguageTool(base, texto, idioma);
}

function palavrasRepetidas(texto, cfg, idioma) {
  if ((cfg.nivel || NIVEL_PADRAO) < 3) return [];
  return [...new Set(RevisorAnalise.repeticoes(mascarar(texto).texto, { idioma, ignorar: cfg.dicionario || [] }).map((r) => r.palavra.toLowerCase()))];
}

function frasesDificeis(texto, cfg) {
  if ((cfg.nivel || NIVEL_PADRAO) < 3) return [];
  return RevisorAnalise.legibilidade(mascarar(texto).texto).frases.filter((f) => f.alertas.length).map((f) => ({ inicio: f.texto.split(/\s+/).slice(0, 8).join(' '), alertas: f.alertas }));
}

async function camadaModeloCondicionada(texto, idioma, cfg, languagetool, pedido, contexto) {
  if (languagetool.estado !== 'ativa') return camadaModelo(texto, idioma, cfg, contexto, true);
  if (!languagetool.acusou && !pedido && !palavrasRepetidas(texto, cfg, idioma).length && !frasesDificeis(texto, cfg).length) return { estado: 'ocioso' };
  return camadaModelo(texto, idioma, cfg, contexto);
}

function momentoDeVolta(resposta) {
  const segundos = Number(resposta.headers.get('Retry-After'));
  if (segundos > 0) return Date.now() + segundos * 1000;
  const reset = Number(resposta.headers.get('X-RateLimit-Reset'));
  if (reset > 0) return reset < 1e12 ? reset * 1000 : reset;
  return Date.now() + ESPERA_LIMITE_POR_MINUTO_MS;
}

async function chamarModelo(requisicao, cfg) {
  if (!cfg.chaveOpenrouter) return { estado: 'sem_chave' };
  if (cfg.cota?.ate > Date.now()) return { estado: 'cota' };
  if (cfg.esperaAte && Date.now() < cfg.esperaAte) return { estado: 'limite_por_minuto' };
  if (!dentroDoTetoDaAba(cfg.abaId)) return { estado: 'limite_da_aba' };

  await contarChamada();
  let resposta;
  try {
    resposta = await fetch(`${ENDPOINT}chat/completions`, {
      redirect: 'error',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.chaveOpenrouter}`, 'X-Title': 'CraseUp' },
      body: JSON.stringify(requisicao),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MODELO_MS),
    });
  } catch {
    return semResposta('do OpenRouter');
  }

  if (resposta.status === 429) {
    const ate = momentoDeVolta(resposta);
    if (ate - Date.now() > ESPERA_LIMITE_POR_MINUTO_MS) {
      await chrome.storage.local.set({ cota: { ate } });
      return { estado: 'cota' };
    }
    await chrome.storage.local.set({ esperaAte: ate });
    return { estado: 'limite_por_minuto' };
  }
  if (!resposta.ok) return { estado: 'falha', mensagem: `HTTP ${resposta.status}` };
  try {
    return { estado: 'ativa', corpo: await resposta.json() };
  } catch (erro) {
    return { estado: 'falha', mensagem: `resposta em formato inesperado: ${erro.message}`.slice(0, 200) };
  }
}

async function lerDoModelo(requisicao, cfg, ler) {
  const chamada = await chamarModelo(requisicao, cfg);
  if (chamada.estado !== 'ativa') return chamada;
  let lida;
  try {
    lida = ler(chamada.corpo);
  } catch (erro) {
    return { estado: 'falha', mensagem: `resposta em formato inesperado: ${chamada.corpo?.error?.message || erro.message}`.slice(0, 200) };
  }
  if (cfg.cota) await chrome.storage.local.remove('cota');
  registrarConsumo(lida.modelo, lida.uso).catch(() => {});
  atualizarPrecos();
  return { estado: 'ativa', lida };
}

function restaurarSugestao(s, itens) {
  if (typeof s?.original !== 'string' || typeof s.substituicao !== 'string') return s;
  const original = restaurar(s.original, itens);
  const substituicao = restaurar(s.substituicao, itens);
  if (original.desconhecido || substituicao.desconhecido) return null;
  if (original.usados.sort().join() !== substituicao.usados.sort().join()) return null;
  return { ...s, original: original.texto, substituicao: substituicao.texto };
}

async function camadaModelo(texto, idioma, cfg, contexto, semLanguageTool) {
  const { texto: mascarado, itens } = mascarar(texto);
  const contextoMascarado = mascarar(contexto).texto.replace(/\[[A-Z_]+_\d+\]/g, '[DADO]');
  const protecao = itens.length ? INSTRUCAO_DE_PROTECAO : '';
  const dicionario = (cfg.dicionario || []).filter((termo) => !mascarar(termo).itens.length);
  const repetidas = palavrasRepetidas(texto, cfg, idioma);
  const r = await lerDoModelo(montarRequisicao(mascarado, { tom: cfg.tom, dicionario, idioma, protecao, nivel: cfg.nivel, contexto: contextoMascarado, repetidas, dificeis: frasesDificeis(texto, cfg), semLanguageTool }), cfg, lerResposta);
  if (r.estado !== 'ativa') return r;
  const sugestoes = r.lida.sugestoes.map((s) => restaurarSugestao(s, itens));
  return { estado: 'ativa', mensagem: r.lida.modelo, sugestoes: sugestoes.map((s) => ({ ...s, ...(typeof s?.original === 'string' && repetidas.includes(s.original.toLowerCase()) && { categoria: 'repeticao' }), origem: 'openrouter', modelo: r.lida.modelo })) };
}

const MOTIVOS_SEM_REESCRITA = {
  sem_chave: 'falta configurar a chave do OpenRouter',
  cota: 'a cota de hoje dos modelos gratuitos acabou',
  limite_por_minuto: 'limite de chamadas; tente de novo em um minuto',
  limite_da_aba: 'muitas chamadas desta aba; tente de novo em um minuto',
};

async function reescrever(texto, tom, abaId) {
  const cfg = { ...(await chrome.storage.local.get(['chaveOpenrouter', 'cota', 'esperaAte'])), abaId };
  const offline = await camadaOffline(texto);
  const { texto: mascarado, itens } = mascarar(texto);
  const protecao = itens.length ? INSTRUCAO_DE_PROTECAO : '';
  const r = await lerDoModelo(montarReescrita(mascarado, { tom, idioma: offline.idioma, protecao }), cfg, lerReescrita);
  await registrarCamadas({ offline, openrouter: r.estado === 'ativa' ? { estado: 'ativa', mensagem: r.lida.modelo } : r });
  if (r.estado !== 'ativa') return { erro: MOTIVOS_SEM_REESCRITA[r.estado] || r.mensagem };
  const volta = restaurar(r.lida.texto, itens);
  if (volta.desconhecido || itens.some((i) => !volta.usados.includes(i.marcador))) return { erro: 'o modelo perdeu um dado protegido do texto; tente de novo' };
  if (acrescentaDemais(texto, volta.texto)) return { erro: 'o modelo inventou texto que não estava no original; tente de novo' };
  return { ...r.lida, texto: volta.texto };
}

async function testarChave(chave) {
  try {
    const resposta = await fetch(`${ENDPOINT}key`, {
      redirect: 'error',
      headers: { Authorization: `Bearer ${chave}` },
      signal: AbortSignal.timeout(TEMPO_MAXIMO_CHAMADA_MS),
    });
    if (resposta.ok) return { ok: true };
    const corpo = await resposta.json().catch(() => ({}));
    return { ok: false, mensagem: corpo?.error?.message || `HTTP ${resposta.status}` };
  } catch {
    return { ok: false, mensagem: 'Sem conexão com o OpenRouter.' };
  }
}

function paginaDaExtensao(remetente) {
  return (remetente.url || '').startsWith(chrome.runtime.getURL(''));
}

chrome.runtime.onConnect.addListener((porta) => {
  if (porta.name !== 'revisar') return;
  const enviar = (mensagem) => {
    try {
      porta.postMessage(mensagem);
    } catch {}
  };
  porta.onMessage.addListener(async (msg) => {
    if (typeof msg?.texto !== 'string') return;
    const opcoes = { pedido: msg.pedido === true, modelo: msg.modelo !== false, contexto: typeof msg.contexto === 'string' ? msg.contexto.slice(-300) : '' };
    enviar({ final: await revisar(msg.texto, porta.sender?.tab?.id, opcoes, (parcial) => enviar({ parcial })) });
  });
});

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  const abaId = remetente.tab?.id;
  if (msg?.tipo === 'estadoAba') {
    abaPausada(abaId).then((pausado) => responder({ pausado }));
    return true;
  }
  if (msg?.tipo === 'reescrever' && abaId !== undefined && typeof msg.texto === 'string' && revisavel(msg.texto) && (msg.tom === '' || Object.hasOwn(TONS, msg.tom))) {
    reescrever(msg.texto, msg.tom, abaId).then(responder);
    return true;
  }
  if (msg?.tipo === 'pausar' && Number.isInteger(msg.abaId) && paginaDaExtensao(remetente)) {
    marcarPausa(msg.abaId, Boolean(msg.pausado)).then(() => responder({ ok: true }));
    return true;
  }
  if (msg?.tipo === 'testarLanguagetool' && typeof msg.base === 'string' && paginaDaExtensao(remetente)) {
    consultarLanguageTool(msg.base, 'Teste do CraseUp.', IDIOMA_PADRAO).then((r) => responder({ ok: r.estado === 'ativa', mensagem: r.mensagem }));
    return true;
  }
  if (msg?.tipo === 'testarChave' && typeof msg.chave === 'string' && paginaDaExtensao(remetente)) {
    testarChave(msg.chave).then(responder);
    return true;
  }
  return false;
});
