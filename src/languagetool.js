(function (raiz) {
  const ENDERECO_LOCAL = 'http://localhost:8010';
  const PROBLEMAS_DE_GRAMATICA = new Set(['misspelling', 'grammar', 'typographical', 'whitespace', 'duplication', 'inconsistency', 'uncategorized']);

  function normalizarEndereco(valor) {
    const bruto = String(valor || '').trim();
    let url;
    try {
      url = new URL(bruto.includes('://') ? bruto : `http://${bruto}`);
    } catch {
      return '';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  }

  function enderecoDeVerificacao(base) {
    return /\/v2$/.test(base) ? `${base}/check` : `${base}/v2/check`;
  }

  function enderecoDeIdiomas(base) {
    return /\/v2$/.test(base) ? `${base}/languages` : `${base}/v2/languages`;
  }

  function pareceLanguageTool(corpo) {
    return Array.isArray(corpo) && corpo.some((idioma) => idioma?.longCode === 'pt-BR' && typeof idioma.name === 'string');
  }

  function padraoDePermissao(base) {
    return `${new URL(base).origin}/*`;
  }

  function montarCorpo(texto, idioma) {
    return new URLSearchParams({ text: texto, language: idioma }).toString();
  }

  const CATEGORIA_DO_LT = { TYPOS: 'ortografia', CASING: 'ortografia', PUNCTUATION: 'pontuacao', TYPOGRAPHY: 'pontuacao', GRAMMAR: 'gramatica', CONFUSED_WORDS: 'gramatica', REDUNDANCY: 'repeticao', STYLE: 'fluidez' };
  const CATEGORIA_DO_PROBLEMA = { misspelling: 'ortografia', typographical: 'pontuacao', whitespace: 'pontuacao', duplication: 'repeticao' };

  function lerMatches(corpo, texto) {
    if (!Array.isArray(corpo?.matches)) throw new Error('resposta sem matches');
    const sugestoes = [];
    const abreviacoes = [];
    for (const m of corpo.matches) {
      const abreviacao = m?.rule?.id === 'INTERNET_ABBREVIATIONS';
      if (!abreviacao && !PROBLEMAS_DE_GRAMATICA.has(m?.rule?.issueType)) continue;
      const troca = m.replacements?.[0]?.value;
      if (typeof troca !== 'string' || !Number.isInteger(m.offset) || !Number.isInteger(m.length)) continue;
      (abreviacao ? abreviacoes : sugestoes).push({
        tipo: abreviacao ? 'tom' : 'gramatica',
        origem: 'languagetool',
        original: texto.slice(m.offset, m.offset + m.length),
        substituicao: troca,
        motivo: typeof m.message === 'string' ? m.message : '',
        inicio: m.offset,
        categoria: abreviacao ? 'tom' : CATEGORIA_DO_LT[m.rule?.category?.id] || CATEGORIA_DO_PROBLEMA[m.rule?.issueType] || 'gramatica',
        regra: { id: m.rule?.id, nome: m.rule?.description || m.rule?.category?.name || '', explicacao: m.message },
      });
    }
    return { sugestoes, abreviacoes, acusou: corpo.matches.length > 0 };
  }

  raiz.RevisorLanguageTool = { ENDERECO_LOCAL, normalizarEndereco, enderecoDeVerificacao, enderecoDeIdiomas, pareceLanguageTool, padraoDePermissao, montarCorpo, lerMatches };
})(globalThis);
