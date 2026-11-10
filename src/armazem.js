(function (raiz) {
  const VERSAO = 1;
  const DIA_MS = 86_400_000;
  const COLECOES = {
    consumo: { texto: 'nenhum' },
    camadas: { texto: 'nenhum' },
    dicionario: { maximo: 2000, texto: 'termos' },
    cache: { expiraMs: DIA_MS, maximo: 300, texto: 'mascarado' },
    aprendizado: { maximo: 500, texto: 'nenhum' },
    atalhos: { maximo: 500, texto: 'opt-in' },
    historico: { expiraMs: 30 * DIA_MS, maximo: 500, texto: 'opt-in' },
  };
  const CAMADAS = ['offline', 'languagetool', 'openrouter'];
  const DATA = /^\d{4}-\d{2}-\d{2}$/;

  function textos(valor) {
    if (typeof valor === 'string') return [valor];
    if (valor && typeof valor === 'object') return Object.values(valor).flatMap(textos);
    return [];
  }

  function temDadoEmClaro(valor) {
    return textos(valor).some((t) => raiz.RevisorProtecao.mascarar(t.replace(/\[[A-Z_]+_\d+\]/g, ' ')).itens.length > 0);
  }

  function regraDe(colecao) {
    const regra = COLECOES[colecao];
    if (!regra?.maximo || colecao === 'dicionario') throw new Error(`coleção sem entradas: ${colecao}`);
    return regra;
  }

  function vivas(entradas, regra, agora) {
    const lista = Object.entries(entradas || {}).filter(([, e]) => e && Number.isFinite(e.em) && !(agora - e.em >= regra.expiraMs));
    lista.sort((a, b) => b[1].em - a[1].em);
    return Object.fromEntries(lista.slice(0, regra.maximo));
  }

  async function gravar(area, colecao, chave, valor, { agora = Date.now(), optIn = false } = {}) {
    const regra = regraDe(colecao);
    if (regra.texto === 'opt-in' && !optIn) throw new Error(`${colecao} só guarda texto com opt-in`);
    if (regra.texto === 'mascarado' && temDadoEmClaro(valor)) throw new Error(`${colecao} só guarda texto mascarado`);
    const { [colecao]: atuais } = await area.get(colecao);
    await area.set({ [colecao]: vivas({ ...atuais, [chave]: { valor, em: agora } }, regra, agora) });
  }

  async function ler(area, colecao, chave, { agora = Date.now() } = {}) {
    const regra = regraDe(colecao);
    const { [colecao]: atuais } = await area.get(colecao);
    return vivas(atuais, regra, agora)[chave]?.valor;
  }

  async function limparExpirados(area, { agora = Date.now() } = {}) {
    const nomes = Object.keys(COLECOES).filter((c) => COLECOES[c].expiraMs);
    const atuais = await area.get(nomes);
    const limpas = {};
    for (const c of nomes) if (atuais[c]) limpas[c] = vivas(atuais[c], COLECOES[c], agora);
    await area.set(limpas);
  }

  async function apagarTudo(area) {
    await area.remove(Object.keys(COLECOES));
  }

  async function migrar(area) {
    const { versaoDoArmazem = 0, consumo, camadas, dicionario } = await area.get(['versaoDoArmazem', 'consumo', 'camadas', 'dicionario']);
    if (versaoDoArmazem >= VERSAO) return versaoDoArmazem;
    const novo = { versaoDoArmazem: VERSAO };
    if (dicionario !== undefined) {
      const termos = Array.isArray(dicionario) ? dicionario.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean) : [];
      novo.dicionario = [...new Set(termos)].slice(0, COLECOES.dicionario.maximo);
    }
    if (consumo !== undefined) {
      novo.consumo = Object.fromEntries(Object.entries(consumo && typeof consumo === 'object' ? consumo : {}).filter(([dia, v]) => DATA.test(dia) && v && typeof v === 'object'));
    }
    if (camadas !== undefined) {
      novo.camadas = Object.fromEntries(Object.entries(camadas && typeof camadas === 'object' ? camadas : {}).filter(([nome, v]) => CAMADAS.includes(nome) && typeof v?.estado === 'string'));
    }
    await area.set(novo);
    return VERSAO;
  }

  raiz.RevisorArmazem = { VERSAO, COLECOES, gravar, ler, limparExpirados, apagarTudo, migrar };
})(globalThis);
