(function (raiz) {
  const TIPOS = ['gramatica', 'clareza', 'palavra', 'tom'];
  const ORIGENS = ['offline', 'languagetool', 'gemini'];
  const TIPOS_DO_GEMINI = ['clareza', 'palavra', 'tom'];
  const NOMES_DE_IDIOMA = { 'pt-BR': 'português do Brasil', 'en-US': 'inglês' };
  const TONS = {
    formal: 'formal (linguagem cuidada, sem gírias nem intimidade)',
    neutro: 'neutro (direto e cordial, sem gírias nem formalidade excessiva)',
    casual: 'casual (leve e próximo, como numa conversa)',
  };
  const PALAVRAS_A_MAIS_NO_MAXIMO = 10;
  const TAMANHO_MINIMO_PARAGRAFO = 3;
  const TAMANHO_MAXIMO_PARAGRAFO = 4000;
  const PALAVRAS_DO_DICIONARIO_NO_PROMPT = 200;
  const MODELO = 'gemini-flash-latest';
  const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

  function dividirParagrafos(texto) {
    const paragrafos = [];
    let inicio = 0;
    for (const linha of texto.split('\n')) {
      paragrafos.push({ texto: linha, inicio });
      inicio += linha.length + 1;
    }
    return paragrafos;
  }

  function revisavel(paragrafo) {
    return (
      paragrafo.length >= TAMANHO_MINIMO_PARAGRAFO &&
      paragrafo.length <= TAMANHO_MAXIMO_PARAGRAFO &&
      /\p{L}{2}/u.test(paragrafo)
    );
  }

  function instrucaoDoSistema(tom, dicionario, idioma) {
    const palavras = dicionario.slice(0, PALAVRAS_DO_DICIONARIO_NO_PROMPT).join(', ') || '(nenhuma)';
    return [
      `Você revisa textos em ${NOMES_DE_IDIOMA[idioma]} e aponta só problemas de clareza, de escolha de palavra e de tom.`,
      'Regras:',
      '- Se o texto estiver correto e claro, devolva "sugestoes": [].',
      '- Cada sugestão troca só a palavra ou o trecho curto que ficou ruim; nunca reescreva a frase inteira nem o resto do texto.',
      '- "original" é uma cópia exata, caractere por caractere, de um trecho contíguo do texto recebido.',
      `- "substituicao" acrescenta no máximo ${PALAVRAS_A_MAIS_NO_MAXIMO} palavras a "original"; prefira a troca mais curta que resolve.`,
      '- tipo "clareza": trecho confuso, redundante ou repetido que fica mais claro e mais curto.',
      '- tipo "palavra": palavra vaga ou repetida que tem opção mais precisa do mesmo tamanho ou menor.',
      `- tipo "tom": trecho que destoa claramente do tom ${TONS[tom] || TONS.neutro}.`,
      '- Não aponte ortografia, acentuação, concordância, regência, crase nem pontuação: outra ferramenta já cuida disso.',
      '- Não marque nomes próprios, marcas, siglas, termos técnicos, gírias intencionais nem trechos em outro idioma.',
      `- Não marque estas palavras do dicionário do usuário: ${palavras}.`,
      '- "motivo" explica a troca em português, em até 10 palavras.',
    ].join('\n');
  }

  function montarRequisicao(texto, { tom = 'neutro', dicionario = [], idioma = 'pt-BR' } = {}) {
    return {
      systemInstruction: { parts: [{ text: instrucaoDoSistema(tom, dicionario, idioma) }] },
      contents: [{ role: 'user', parts: [{ text: texto }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            sugestoes: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  tipo: { type: 'STRING', enum: TIPOS_DO_GEMINI },
                  original: { type: 'STRING' },
                  substituicao: { type: 'STRING' },
                  motivo: { type: 'STRING' },
                },
                required: ['tipo', 'original', 'substituicao', 'motivo'],
              },
            },
          },
          required: ['sugestoes'],
        },
      },
    };
  }

  function lerResposta(corpo) {
    const partes = corpo?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(partes)) throw new Error('resposta sem candidato');
    const dados = JSON.parse(partes.map((p) => p.text || '').join(''));
    if (!Array.isArray(dados?.sugestoes)) throw new Error('resposta sem lista de sugestões');
    return dados.sugestoes;
  }

  function escaparRegex(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function contemPalavraDoDicionario(trecho, dicionario) {
    const alvo = trecho.toLocaleLowerCase('pt-BR');
    return dicionario.some((palavra) => {
      const termo = palavra.trim().toLocaleLowerCase('pt-BR');
      if (!termo) return false;
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escaparRegex(termo)}($|[^\\p{L}\\p{N}])`, 'u').test(alvo);
    });
  }

  function contarPalavras(texto) {
    return (texto.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) || []).length;
  }

  function filtrarSugestoes(texto, brutas, { dicionario = [] } = {}) {
    const aceitas = [];
    for (const s of Array.isArray(brutas) ? brutas : []) {
      if (!s || typeof s.original !== 'string' || typeof s.substituicao !== 'string') continue;
      if (!TIPOS.includes(s.tipo)) continue;
      const { original, substituicao } = s;
      if (!original.trim() || original === substituicao) continue;
      if (contarPalavras(substituicao) - contarPalavras(original) > PALAVRAS_A_MAIS_NO_MAXIMO) continue;
      if (contemPalavraDoDicionario(original, dicionario)) continue;
      const sobrepoe = (p) => aceitas.some((a) => p < a.fim && p + original.length > a.inicio);
      let posicao;
      if (Number.isInteger(s.inicio) && texto.startsWith(original, s.inicio)) {
        if (sobrepoe(s.inicio)) continue;
        posicao = s.inicio;
      } else {
        posicao = texto.indexOf(original);
        while (posicao !== -1 && sobrepoe(posicao)) posicao = texto.indexOf(original, posicao + 1);
        if (posicao === -1) continue;
      }
      aceitas.push({
        tipo: s.tipo,
        origem: ORIGENS.includes(s.origem) ? s.origem : 'gemini',
        original,
        substituicao,
        motivo: typeof s.motivo === 'string' ? s.motivo.slice(0, 160) : '',
        inicio: posicao,
        fim: posicao + original.length,
      });
    }
    return aceitas.sort((a, b) => a.inicio - b.inicio);
  }

  function aplicarNoParagrafo(texto, sugestoes, escolhida) {
    const novoTexto = texto.slice(0, escolhida.inicio) + escolhida.substituicao + texto.slice(escolhida.fim);
    const delta = escolhida.substituicao.length - (escolhida.fim - escolhida.inicio);
    const restantes = sugestoes
      .filter((s) => s !== escolhida && (s.fim <= escolhida.inicio || s.inicio >= escolhida.fim))
      .map((s) => (s.inicio >= escolhida.fim ? { ...s, inicio: s.inicio + delta, fim: s.fim + delta } : s));
    return { texto: novoTexto, sugestoes: restantes };
  }

  raiz.RevisorCore = {
    TIPOS,
    TONS,
    MODELO,
    ENDPOINT,
    dividirParagrafos,
    revisavel,
    montarRequisicao,
    lerResposta,
    contemPalavraDoDicionario,
    contarPalavras,
    filtrarSugestoes,
    aplicarNoParagrafo,
  };
})(globalThis);
