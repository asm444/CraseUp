(function (raiz) {
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

  function padraoDePermissao(base) {
    return `${new URL(base).origin}/*`;
  }

  function montarCorpo(texto, idioma) {
    return new URLSearchParams({ text: texto, language: idioma }).toString();
  }

  function lerMatches(corpo, texto) {
    if (!Array.isArray(corpo?.matches)) throw new Error('resposta sem matches');
    const sugestoes = [];
    for (const m of corpo.matches) {
      if (!PROBLEMAS_DE_GRAMATICA.has(m?.rule?.issueType)) continue;
      const troca = m.replacements?.[0]?.value;
      if (typeof troca !== 'string' || !Number.isInteger(m.offset) || !Number.isInteger(m.length)) continue;
      sugestoes.push({
        tipo: 'gramatica',
        origem: 'languagetool',
        original: texto.slice(m.offset, m.offset + m.length),
        substituicao: troca,
        motivo: typeof m.message === 'string' ? m.message : '',
        inicio: m.offset,
      });
    }
    return { sugestoes };
  }

  raiz.RevisorLanguageTool = { normalizarEndereco, enderecoDeVerificacao, padraoDePermissao, montarCorpo, lerMatches };
})(globalThis);
