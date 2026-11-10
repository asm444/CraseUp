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

  raiz.RevisorAnalise = { frases, palavras, ehStopword, radical, contagemPorFrase, distancias };
})(globalThis);
