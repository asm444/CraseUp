importScripts('core.js', 'ortografia.js', 'languagetool.js', 'vendor/hunspell.js');

const { ENDPOINT, montarRequisicao, lerResposta, filtrarSugestoes } = RevisorCore;
const { IDIOMAS, IDIOMA_PADRAO, detectarIdioma, sugestoesOrtograficas } = RevisorOrtografia;
const { enderecoDeVerificacao, padraoDePermissao, montarCorpo, lerMatches } = RevisorLanguageTool;
const ESPERA_LIMITE_POR_MINUTO_MS = 60_000;
const TEMPO_MAXIMO_CHAMADA_MS = 15_000;
const COR_SELO_COTA = '#EDAE49';
const COR_SELO_PAUSA = '#6B6475';
const ESTADOS_PASSAGEIROS = new Set(['falha', 'sem_conexao', 'limite_por_minuto', 'cota']);

const hoje = () => new Date().toLocaleDateString('sv');

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html?bemvindo=1') });
  atualizarSeloGlobal();
});
chrome.runtime.onStartup.addListener(atualizarSeloGlobal);

chrome.tabs.onRemoved.addListener(async (abaId) => {
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

async function revisar(texto, abaId, pedido) {
  if (abaId !== undefined && (await abaPausada(abaId))) return { erro: 'pausado' };
  const cfg = await chrome.storage.local.get(['chaveOpenrouter', 'tom', 'dicionario', 'cota', 'esperaAte', 'languagetool']);
  const offline = await camadaOffline(texto);
  const languagetool = await camadaLanguageTool(texto, offline.idioma, cfg.languagetool);
  const openrouter = await camadaModeloCondicionada(texto, offline.idioma, cfg, languagetool, pedido);
  const brutas = [offline, languagetool, openrouter].flatMap((camada) => camada.sugestoes || []);
  await registrarCamadas({ offline, languagetool, openrouter });
  return {
    sugestoes: filtrarSugestoes(texto, brutas, { dicionario: cfg.dicionario || [] }),
    provisorio: [offline, languagetool, openrouter].some((camada) => ESTADOS_PASSAGEIROS.has(camada.estado)),
  };
}

function semResposta(origem) {
  return navigator.onLine ? { estado: 'falha', mensagem: `sem resposta ${origem}` } : { estado: 'sem_conexao', mensagem: 'sem conexão com a internet' };
}

async function registrarCamadas(camadas) {
  const resumo = Object.fromEntries(Object.entries(camadas).map(([nome, { estado, mensagem }]) => [nome, { estado, mensagem }]));
  await chrome.storage.session.set({ camadas: resumo });
}

async function consultarLanguageTool(base, texto, idioma) {
  let resposta;
  try {
    resposta = await fetch(enderecoDeVerificacao(base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: montarCorpo(texto, idioma),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_CHAMADA_MS),
    });
  } catch {
    return semResposta('do servidor');
  }
  if (!resposta.ok) return { estado: 'falha', mensagem: `HTTP ${resposta.status}` };
  try {
    return { estado: 'ativa', ...lerMatches(await resposta.json(), texto) };
  } catch {
    return { estado: 'falha', mensagem: 'resposta em formato inesperado' };
  }
}

async function camadaLanguageTool(texto, idioma, base) {
  if (!base) return { estado: 'sem_configuracao' };
  if (!(await chrome.permissions.contains({ origins: [padraoDePermissao(base)] }))) return { estado: 'sem_permissao' };
  return consultarLanguageTool(base, texto, idioma);
}

async function camadaModeloCondicionada(texto, idioma, cfg, languagetool, pedido) {
  if (languagetool.estado !== 'ativa') return { estado: 'bloqueado' };
  if (!languagetool.acusou && !pedido) return { estado: 'ocioso' };
  return camadaModelo(texto, idioma, cfg);
}

function momentoDeVolta(resposta) {
  const segundos = Number(resposta.headers.get('Retry-After'));
  if (segundos > 0) return Date.now() + segundos * 1000;
  const reset = Number(resposta.headers.get('X-RateLimit-Reset'));
  if (reset > 0) return reset < 1e12 ? reset * 1000 : reset;
  return Date.now() + ESPERA_LIMITE_POR_MINUTO_MS;
}

async function camadaModelo(texto, idioma, cfg) {
  if (!cfg.chaveOpenrouter) return { estado: 'sem_chave' };
  if (cfg.cota?.ate > Date.now()) return { estado: 'cota' };
  if (cfg.esperaAte && Date.now() < cfg.esperaAte) return { estado: 'limite_por_minuto' };

  await contarChamada();
  let resposta;
  try {
    resposta = await fetch(`${ENDPOINT}chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.chaveOpenrouter}`, 'X-Title': 'CraseUp' },
      body: JSON.stringify(montarRequisicao(texto, { tom: cfg.tom, dicionario: cfg.dicionario, idioma })),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_CHAMADA_MS),
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

  let lida;
  try {
    lida = lerResposta(await resposta.json());
  } catch {
    return { estado: 'falha', mensagem: 'resposta em formato inesperado' };
  }
  if (cfg.cota) await chrome.storage.local.remove('cota');
  return { estado: 'ativa', mensagem: lida.modelo, sugestoes: lida.sugestoes.map((s) => ({ ...s, modelo: lida.modelo })) };
}

async function testarChave(chave) {
  try {
    const resposta = await fetch(`${ENDPOINT}key`, {
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

chrome.runtime.onMessage.addListener((msg, remetente, responder) => {
  const abaId = remetente.tab?.id;
  if (msg?.tipo === 'revisar' && typeof msg.texto === 'string') {
    revisar(msg.texto, abaId, msg.pedido === true).then(responder);
    return true;
  }
  if (msg?.tipo === 'estadoAba') {
    abaPausada(abaId).then((pausado) => responder({ pausado }));
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
