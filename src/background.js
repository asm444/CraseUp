importScripts('core.js', 'ortografia.js', 'languagetool.js', 'vendor/hunspell.js');

const { ENDPOINT, MODELO, montarRequisicao, lerResposta, filtrarSugestoes } = RevisorCore;
const { IDIOMAS, IDIOMA_PADRAO, detectarIdioma, sugestoesOrtograficas } = RevisorOrtografia;
const { enderecoDeVerificacao, padraoDePermissao, montarCorpo, lerMatches } = RevisorLanguageTool;
const ESPERA_LIMITE_POR_MINUTO_MS = 60_000;
const TEMPO_MAXIMO_CHAMADA_MS = 15_000;
const COR_SELO_COTA = '#EDAE49';
const COR_SELO_PAUSA = '#6B6475';
const ESTADOS_PASSAGEIROS = new Set(['falha', 'limite_por_minuto', 'cota']);

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
  const esgotada = cota?.data === hoje();
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

function cotaDiaria(corpoDoErro) {
  return JSON.stringify(corpoDoErro).includes('PerDay');
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
    return { estado: 'falha', idioma: IDIOMA_PADRAO, sugestoes: [] };
  }
}

async function revisar(texto, abaId, pedido) {
  if (abaId !== undefined && (await abaPausada(abaId))) return { erro: 'pausado' };
  const cfg = await chrome.storage.local.get(['chave', 'tom', 'dicionario', 'cota', 'esperaAte', 'languagetool']);
  const offline = await camadaOffline(texto);
  const languagetool = await camadaLanguageTool(texto, offline.idioma, cfg.languagetool);
  const gemini = await camadaGeminiCondicionada(texto, offline.idioma, cfg, languagetool, pedido);
  const brutas = [offline, languagetool, gemini].flatMap((camada) => camada.sugestoes || []);
  return {
    sugestoes: filtrarSugestoes(texto, brutas, { dicionario: cfg.dicionario || [] }),
    provisorio: [offline, languagetool, gemini].some((camada) => ESTADOS_PASSAGEIROS.has(camada.estado)),
  };
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
    return { estado: 'falha', mensagem: 'sem resposta do servidor' };
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

async function camadaGeminiCondicionada(texto, idioma, cfg, languagetool, pedido) {
  if (languagetool.estado !== 'ativa') return { estado: 'bloqueado' };
  if (!languagetool.acusou && !pedido) return { estado: 'ocioso' };
  return camadaGemini(texto, idioma, cfg);
}

async function camadaGemini(texto, idioma, cfg) {
  if (!cfg.chave) return { estado: 'sem_chave' };
  if (cfg.cota?.data === hoje()) return { estado: 'cota' };
  if (cfg.esperaAte && Date.now() < cfg.esperaAte) return { estado: 'limite_por_minuto' };

  await contarChamada();
  let resposta;
  try {
    resposta = await fetch(`${ENDPOINT}${MODELO}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.chave },
      body: JSON.stringify(montarRequisicao(texto, { tom: cfg.tom, dicionario: cfg.dicionario, idioma })),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_CHAMADA_MS),
    });
  } catch {
    return { estado: 'falha' };
  }

  if (resposta.status === 429) {
    const corpo = await resposta.json().catch(() => ({}));
    if (cotaDiaria(corpo)) {
      await chrome.storage.local.set({ cota: { data: hoje() } });
      return { estado: 'cota' };
    }
    await chrome.storage.local.set({ esperaAte: Date.now() + ESPERA_LIMITE_POR_MINUTO_MS });
    return { estado: 'limite_por_minuto' };
  }
  if (!resposta.ok) return { estado: 'falha' };

  let brutas;
  try {
    brutas = lerResposta(await resposta.json());
  } catch {
    return { estado: 'falha' };
  }
  if (cfg.cota) await chrome.storage.local.remove('cota');
  return { estado: 'ativa', sugestoes: brutas };
}

async function testarChave(chave) {
  try {
    const resposta = await fetch(`${ENDPOINT}${MODELO}`, {
      headers: { 'x-goog-api-key': chave },
      signal: AbortSignal.timeout(TEMPO_MAXIMO_CHAMADA_MS),
    });
    if (resposta.ok) return { ok: true };
    const corpo = await resposta.json().catch(() => ({}));
    return { ok: false, mensagem: corpo?.error?.message || `HTTP ${resposta.status}` };
  } catch {
    return { ok: false, mensagem: 'Sem conexão com a API do Gemini.' };
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
