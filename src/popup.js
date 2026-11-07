const hoje = () => new Date().toLocaleDateString('sv');
const $ = (id) => document.getElementById(id);
const TEXTOS_DE_ESTADO = {
  ativa: 'Ativa',
  ocioso: 'Ativa; chamada quando o LanguageTool acusa algo ou por pedido',
  bloqueado: 'Indisponível enquanto o LanguageTool estiver indisponível',
  sem_configuracao: 'Desligada: nenhum servidor configurado',
  sem_permissao: 'Indisponível: falta permissão para o servidor',
  sem_chave: 'Indisponível: falta a chave',
  cota: 'Indisponível: a cota de hoje acabou',
  limite_por_minuto: 'Pausada por um minuto: limite de chamadas',
  sem_conexao: 'Indisponível: sem conexão com a internet',
  falha: 'Indisponível: falha do serviço',
};

function haQuanto(momento) {
  const minutos = Math.floor((Date.now() - momento) / 60_000);
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 1440) return `há ${Math.floor(minutos / 60)} h`;
  return `há ${Math.floor(minutos / 1440)} d`;
}

function textoDaCamada(camada) {
  if (!camada) return 'Ainda não usada';
  const texto = TEXTOS_DE_ESTADO[camada.estado];
  const comMensagem = ['falha', 'ativa'].includes(camada.estado) && camada.mensagem ? `${texto} (${camada.mensagem})` : texto;
  return `${comMensagem} · ${haQuanto(camada.em)}`;
}

function desenharCamadas(camadas = {}) {
  $('camadaOffline').textContent = textoDaCamada(camadas.offline);
  $('camadaLanguagetool').textContent = textoDaCamada(camadas.languagetool);
  $('camadaOpenrouter').textContent = textoDaCamada(camadas.openrouter);
}

async function iniciar() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = aba?.url?.startsWith('http') ? new URL(aba.url).hostname : '';
  const local = await chrome.storage.local.get(['chaveOpenrouter', 'uso', 'cota', 'sitesExcluidos', 'camadas']);
  const { abasPausadas = [] } = await chrome.storage.session.get('abasPausadas');
  desenharCamadas(local.camadas);
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === 'local' && mudancas.camadas) desenharCamadas(mudancas.camadas.newValue);
  });
  const sitesExcluidos = local.sitesExcluidos || [];
  const excluido = sitesExcluidos.includes(host);

  $('semChave').hidden = Boolean(local.chaveOpenrouter);
  $('cota').hidden = !(local.cota?.ate > Date.now());
  $('chamadas').textContent = local.uso?.data === hoje() ? String(local.uso.chamadas) : '0';
  $('precos').href = RevisorConfig.LIMITES_URL;
  $('hostAtual').textContent = host || 'Página sem campos revisáveis';

  const alternador = $('abaAtiva');
  alternador.checked = Boolean(host) && !excluido && !abasPausadas.includes(aba?.id);
  alternador.disabled = !host || excluido;
  alternador.addEventListener('change', () => {
    chrome.runtime.sendMessage({ tipo: 'pausar', abaId: aba.id, pausado: !alternador.checked });
  });

  const pedirRevisao = $('pedirRevisao');
  pedirRevisao.hidden = !alternador.checked;
  pedirRevisao.addEventListener('click', async () => {
    await chrome.tabs.sendMessage(aba.id, { tipo: 'revisarPedido' }).catch(() => {});
    window.close();
  });

  const botaoSite = $('site');
  botaoSite.hidden = !host;
  botaoSite.textContent = excluido ? `Voltar a revisar em ${host}` : `Não revisar em ${host}`;
  botaoSite.addEventListener('click', async () => {
    const lista = excluido ? sitesExcluidos.filter((s) => s !== host) : [...sitesExcluidos, host];
    await chrome.storage.local.set({ sitesExcluidos: lista });
    window.close();
  });

  const abrirOpcoes = (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  };
  $('opcoes').addEventListener('click', abrirOpcoes);
  $('alternarTema').addEventListener('click', RevisorTema.alternar);
  $('configurarChave').addEventListener('click', abrirOpcoes);

  if (RevisorConfig.DOACAO_URL) {
    $('doacao').href = RevisorConfig.DOACAO_URL;
    $('doacao').hidden = false;
  }
}

iniciar();
