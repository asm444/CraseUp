(function (raiz) {
  const ABREVIACOES = new Set([
    'sr', 'sra', 'srta', 'dr', 'dra', 'prof', 'profa', 'eng', 'exmo', 'exma', 'ilmo', 'ilma', 'av', 'r', 'pág', 'pag', 'p', 'pp',
    'art', 'cap', 'fig', 'tel', 'cel', 'ex', 'etc', 'obs', 'vol', 'ed', 'n', 'nº', 'no', 'num', 'jr', 'ltda', 'cia', 'séc', 'aprox',
    'mr', 'mrs', 'ms', 'st', 'vs', 'e.g', 'i.e', 'p.ex', 'a.c', 'd.c',
  ]);
  const STOPWORDS = {
    'pt-BR': new Set(('a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para pra com sem sob sobre ' +
      'e ou mas porém que se como quando onde porque pois já não sim mais menos muito muita muitos muitas pouco também só ' +
      'eu tu ele ela nós vós eles elas você vocês me te lhe lhes meu minha meus minhas seu sua seus suas nosso nossa ' +
      'este esta estes estas esse essa esses essas aquele aquela isso isto aquilo é são foi era ser estar está estão ter tem há ao aos à às').split(' ')),
    'en-US': new Set(('a an the of to in on at by for with from and or but not no yes is are was were be been being have has had do does did ' +
      'i you he she it we they me him her us them my your his its our their this that these those as if so than then there here').split(' ')),
  };

  function frases(texto) {
    const lista = [];
    let inicio = 0;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (c !== '!' && c !== '?' && c !== '…' && (c !== '.' || ABREVIACOES.has(texto.slice(Math.max(0, i - 40), i).match(/(?:\p{L}+\.)*\p{L}+$/u)?.[0].toLowerCase()))) continue;
      let fim = i + 1;
      while (/[."'”»)]/.test(texto[fim])) fim++;
      const resto = texto.slice(fim).match(/^\s+(\S)/u);
      if (resto && !/\p{Ll}/u.test(resto[1])) {
        empurrar(lista, texto, inicio, fim);
        inicio = fim;
      }
      i = fim - 1;
    }
    empurrar(lista, texto, inicio, texto.length);
    return lista;
  }

  function empurrar(lista, texto, inicio, fim) {
    const trecho = texto.slice(inicio, fim);
    const esquerda = trecho.length - trecho.trimStart().length;
    const limpo = trecho.trim();
    if (limpo) lista.push({ texto: limpo, inicio: inicio + esquerda, fim: inicio + esquerda + limpo.length });
  }

  function palavras(texto) {
    return [...texto.matchAll(/\p{L}+(?:['’-]\p{L}+)*/gu)].map((m) => ({ palavra: m[0], inicio: m.index }));
  }

  function ehStopword(palavra, idioma) {
    return (Object.hasOwn(STOPWORDS, idioma) ? STOPWORDS[idioma] : STOPWORDS['pt-BR']).has(palavra.toLowerCase());
  }

  function radical(palavra, idioma) {
    const SUFIXOS = {
      'pt-BR': ['amente', 'mente', 'ações', 'ação', 'ições', 'ição', 'ões', 'ão', 'ando', 'endo', 'indo', 'ados', 'adas', 'ado', 'ada', 'idos', 'idas', 'ido', 'ida', 'aram', 'eram', 'iram', 'avam', 'ava', 'ou', 'am', 'em', 'ar', 'er', 'ir', 'es', 's', 'o', 'a'],
      'en-US': ['ingly', 'edly', 'ing', 'ed', 'ly', 'es', 's'],
    };
    const p = palavra.toLowerCase();
    const singular = p.endsWith('s') && !p.endsWith('ões') && p.length > 4 ? p.slice(0, -1) : p;
    const sufixo = (Object.hasOwn(SUFIXOS, idioma) ? SUFIXOS[idioma] : SUFIXOS['pt-BR']).find((s) => singular.endsWith(s) && singular.length - s.length >= 3);
    return sufixo ? singular.slice(0, -sufixo.length) : singular;
  }

  function contagemPorFrase(texto) {
    return frases(texto).map((f) => ({ ...f, palavras: palavras(f.texto).length }));
  }

  function distancias(texto, idioma) {
    const visto = new Map();
    const resultado = new Map();
    palavras(texto).filter((p) => !ehStopword(p.palavra, idioma)).forEach((p, posicao) => {
      const r = radical(p.palavra, idioma);
      if (visto.has(r)) resultado.set(r, resultado.get(r) || []).get(r).push(posicao - visto.get(r));
      visto.set(r, posicao);
    });
    return resultado;
  }

  function nomeProprio(texto, p) {
    return /^\p{Lu}/u.test(p.palavra) && /[^.!?…:]$/.test(texto.slice(0, p.inicio).trimEnd());
  }

  function repeticoes(texto, { janela = 10, idioma, ignorar = [] } = {}) {
    const fora = new Set(ignorar.map((t) => t.toLowerCase()));
    const ultima = new Map();
    const achadas = [];
    palavras(texto).forEach((p, posicao) => {
      if (p.palavra.length < 4 || ehStopword(p.palavra, idioma) || fora.has(p.palavra.toLowerCase()) || /^\p{Lu}{2,}$/u.test(p.palavra) || nomeProprio(texto, p)) return;
      const r = radical(p.palavra, idioma);
      if (posicao - ultima.get(r) <= janela) achadas.push({ palavra: p.palavra });
      ultima.set(r, posicao);
    });
    return achadas;
  }

  const LIMITE_DE_PALAVRAS = 30;
  const LIMITE_DE_QUE = 3;
  const PASSIVA = /(?<![\p{L}])(?:foi|foram|é|são|será|serão|era|eram|seja|sejam|sido|sendo)\s+\p{L}+(?:ad|id)[oa]s?(?![\p{L}])/iu;
  const QUE = /(?<![\p{L}])que(?![\p{L}])/giu;

  function silabas(palavra) {
    return (palavra.toLowerCase().match(/[aeiouáéíóúâêôãõàüy]+/g) || []).length || 1;
  }

  function legibilidade(texto) {
    const lista = contagemPorFrase(texto).map((f) => ({
      ...f,
      alertas: [f.palavras > LIMITE_DE_PALAVRAS && 'longa', (f.texto.match(QUE) || []).length >= LIMITE_DE_QUE && 'muitos-que', PASSIVA.test(f.texto) && 'passiva'].filter(Boolean),
    }));
    const todas = palavras(texto);
    const indice = todas.length ? Math.round(Math.min(100, Math.max(0, 248.835 - 1.015 * (todas.length / lista.length) - 84.6 * (todas.reduce((t, p) => t + silabas(p.palavra), 0) / todas.length)))) : null;
    return { frases: lista, indice };
  }

  raiz.RevisorAnalise = { frases, palavras, ehStopword, radical, contagemPorFrase, distancias, repeticoes, legibilidade };
})(globalThis);
