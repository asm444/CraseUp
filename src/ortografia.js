(function (raiz) {
  const IDIOMAS = ['pt-BR', 'en-US'];
  const IDIOMA_PADRAO = 'pt-BR';
  const PALAVRA = /\p{L}+(?:[-'’]\p{L}+)*/gu;
  const FIM_DE_FRASE = /[.!?…:]\s*$/u;
  const MOTIVO = {
    'pt-BR': 'Palavra não encontrada no dicionário.',
    'en-US': 'Word not found in the dictionary.',
  };

  function palavras(texto) {
    return Array.from(texto.matchAll(PALAVRA), (m) => ({ palavra: m[0], inicio: m.index }));
  }

  function provavelNomeProprio(texto, { palavra, inicio }) {
    if (palavra.length > 1 && palavra === palavra.toLocaleUpperCase()) return true;
    if (palavra[0] !== palavra[0].toLocaleUpperCase()) return false;
    const antes = texto.slice(0, inicio);
    return antes.trim() !== '' && !FIM_DE_FRASE.test(antes);
  }

  function detectarIdioma(texto, verificadores) {
    const candidatas = palavras(texto).filter((p) => p.palavra.length >= 2);
    let melhor = IDIOMA_PADRAO;
    let maior = -1;
    for (const idioma of IDIOMAS) {
      const verificador = verificadores[idioma];
      if (!verificador) continue;
      const conhecidas = candidatas.filter((p) => verificador.spell(p.palavra)).length;
      if (conhecidas > maior) {
        maior = conhecidas;
        melhor = idioma;
      }
    }
    return melhor;
  }

  function sugestoesOrtograficas(texto, idioma, verificador) {
    const sugestoes = [];
    for (const item of palavras(texto)) {
      if (provavelNomeProprio(texto, item) || verificador.spell(item.palavra)) continue;
      const [troca] = verificador.suggest(item.palavra);
      if (!troca) continue;
      sugestoes.push({
        tipo: 'gramatica',
        origem: 'offline',
        original: item.palavra,
        substituicao: troca,
        motivo: MOTIVO[idioma],
        inicio: item.inicio,
        categoria: 'ortografia',
        nivel: 1,
        regra: { id: 'ORTOGRAFIA_OFFLINE', nome: 'Ortografia' },
      });
    }
    return sugestoes;
  }

  raiz.RevisorOrtografia = { IDIOMAS, IDIOMA_PADRAO, detectarIdioma, sugestoesOrtograficas };
})(globalThis);
