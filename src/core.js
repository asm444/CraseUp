(function (raiz) {
  const TIPOS = ['gramatica', 'clareza', 'palavra', 'tom'];
  const ORIGENS = ['offline', 'languagetool', 'openrouter'];
  const TIPOS_DO_MODELO = ['clareza', 'palavra', 'tom'];
  const NOMES_DE_IDIOMA = { 'pt-BR': 'português do Brasil', 'en-US': 'inglês' };
  const TONS = {
    formal: 'formal (linguagem cuidada, sem gírias nem intimidade)',
    neutro: 'neutro (direto e cordial, sem gírias nem formalidade excessiva)',
    casual: 'casual (leve e próximo, como numa conversa)',
  };
  const GIRIA_POR_TOM = {
    neutro: '- Gíria, abreviação de internet (vc, pq, blz, tô) e expressão coloquial destoam do tom: marque como "tom" e troque pela forma por extenso ou neutra.',
    casual: '- Gíria e abreviação de internet combinam com o tom casual: não marque.',
  };
  const PALAVRAS_A_MAIS_NO_MAXIMO = 10;
  const TAMANHO_MINIMO_PARAGRAFO = 3;
  const TAMANHO_MAXIMO_PARAGRAFO = 4000;
  const PALAVRAS_DO_DICIONARIO_NO_PROMPT = 200;
  const ENDPOINT = 'https://openrouter.ai/api/v1/';
  const MODELOS = [
    'nvidia/nemotron-3.5-super-vl:free',
    'xingchen-agi/xing4.0-29b-a4b:free',
    'liquid/lfm-2.5-2.6b:free',
  ];
  const ESQUEMA_DA_RESPOSTA = {
    type: 'object',
    properties: {
      sugestoes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tipo: { type: 'string', enum: TIPOS_DO_MODELO },
            original: { type: 'string' },
            substituicao: { type: 'string' },
            motivo: { type: 'string' },
          },
          required: ['tipo', 'original', 'substituicao', 'motivo'],
          additionalProperties: false,
        },
      },
    },
    required: ['sugestoes'],
    additionalProperties: false,
  };

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
      GIRIA_POR_TOM[tom] || GIRIA_POR_TOM.neutro,
      '- Não aponte ortografia, acentuação, concordância, regência, crase nem pontuação: outra ferramenta já cuida disso.',
      '- Não marque nomes próprios, marcas, siglas, termos técnicos nem trechos em outro idioma.',
      `- Não marque estas palavras do dicionário do usuário: ${palavras}.`,
      '- "motivo" explica a troca em português, em até 10 palavras.',
      '- Responda só com o objeto JSON {"sugestoes": [...]}, sem texto fora dele.',
    ].join('\n');
  }

  function montarRequisicao(texto, { tom, dicionario = [], idioma = 'pt-BR' } = {}) {
    return {
      models: MODELOS,
      messages: [
        { role: 'system', content: instrucaoDoSistema(tom, dicionario, idioma) },
        { role: 'user', content: texto },
      ],
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: { name: 'revisao', strict: true, schema: ESQUEMA_DA_RESPOSTA } },
      provider: { require_parameters: true },
    };
  }

  function lerResposta(corpo) {
    const conteudo = corpo?.choices?.[0]?.message?.content;
    if (typeof conteudo !== 'string') throw new Error('resposta sem conteúdo');
    const dados = JSON.parse(conteudo);
    if (!Array.isArray(dados?.sugestoes)) throw new Error('resposta sem lista de sugestões');
    return { sugestoes: dados.sugestoes, modelo: typeof corpo.model === 'string' ? corpo.model : '' };
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

  function ocorrencia(texto, original, desde) {
    const borda = (i) => i < 0 || i >= texto.length || !/[\p{L}\p{N}]/u.test(texto[i]);
    const comecaEmLetra = /^[\p{L}\p{N}]/u.test(original);
    const terminaEmLetra = /[\p{L}\p{N}]$/u.test(original);
    for (let p = texto.indexOf(original, desde); p !== -1; p = texto.indexOf(original, p + 1)) {
      if ((!comecaEmLetra || borda(p - 1)) && (!terminaEmLetra || borda(p + original.length))) return p;
    }
    return -1;
  }

  function filtrarSugestoes(texto, brutas, { dicionario = [], protegidos = [] } = {}) {
    const aceitas = protegidos.map(({ inicio, fim }) => ({ inicio, fim, protegido: true }));
    const prioridade = (s) => -ORIGENS.indexOf(ORIGENS.includes(s?.origem) ? s.origem : 'openrouter');
    for (const s of [...brutas].sort((a, b) => prioridade(a) - prioridade(b))) {
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
        posicao = ocorrencia(texto, original, 0);
        while (posicao !== -1 && sobrepoe(posicao)) posicao = ocorrencia(texto, original, posicao + 1);
        if (posicao === -1) continue;
      }
      aceitas.push({
        tipo: s.tipo,
        origem: ORIGENS.includes(s.origem) ? s.origem : 'openrouter',
        modelo: typeof s.modelo === 'string' ? s.modelo : '',
        original,
        substituicao,
        motivo: typeof s.motivo === 'string' ? s.motivo.slice(0, 160) : '',
        inicio: posicao,
        fim: posicao + original.length,
      });
    }
    return aceitas.filter((a) => !a.protegido).sort((a, b) => a.inicio - b.inicio);
  }

  function aplicarNoParagrafo(texto, sugestoes, escolhida) {
    const novoTexto = texto.slice(0, escolhida.inicio) + escolhida.substituicao + texto.slice(escolhida.fim);
    const delta = escolhida.substituicao.length - (escolhida.fim - escolhida.inicio);
    const restantes = sugestoes
      .filter((s) => s.fim <= escolhida.inicio || s.inicio >= escolhida.fim)
      .map((s) => (s.inicio >= escolhida.fim ? { ...s, inicio: s.inicio + delta, fim: s.fim + delta } : s));
    return { texto: novoTexto, sugestoes: restantes };
  }

  raiz.RevisorCore = {
    TIPOS,
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
