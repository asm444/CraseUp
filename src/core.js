(function (raiz) {
  const TIPOS = ['gramatica', 'clareza', 'palavra', 'tom'];
  const ORIGENS = ['offline', 'languagetool', 'openrouter'];
  const NOMES_DE_IDIOMA = { 'pt-BR': 'português do Brasil', 'en-US': 'inglês' };
  const TONS = {
    formal: 'formal (linguagem cuidada, sem gírias nem intimidade)',
    profissional: 'profissional (objetivo e cortês, como num e-mail de trabalho)',
    neutro: 'neutro (direto e cordial, sem gírias nem formalidade excessiva)',
    amigavel: 'amigável (caloroso e gentil, sem perder a clareza)',
    casual: 'casual (leve e próximo, como numa conversa)',
    confiante: 'confiante (afirmativo e seguro, sem rodeios nem hesitação)',
    empatico: 'empático (acolhedor, reconhece o lado de quem lê)',
    persuasivo: 'persuasivo (convence com argumento claro e chamada à ação)',
  };
  const ROTULOS_DE_TOM = {
    formal: 'Formal',
    profissional: 'Profissional',
    neutro: 'Neutro',
    amigavel: 'Amigável',
    casual: 'Casual',
    confiante: 'Confiante',
    empatico: 'Empático',
    persuasivo: 'Persuasivo',
  };
  const GIRIA_POR_TOM = {
    neutro: '- Gíria, abreviação de internet (vc, pq, blz, tô) e expressão coloquial destoam do tom: marque como "tom" e troque pela forma por extenso ou neutra.',
    casual: '- Gíria e abreviação de internet combinam com o tom casual: não marque.',
  };
  const PALAVRAS_A_MAIS_NO_MAXIMO = 10;
  const TAMANHO_MINIMO_PARAGRAFO = 3;
  const TAMANHO_MAXIMO_PARAGRAFO = 4000;
  const TAMANHO_MAXIMO_TRECHO = 280;
  const TOKENS_NO_DIFF_NO_MAXIMO = 1_000_000;
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
            tipo: { type: 'string', enum: TIPOS },
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

  const ESQUEMA_DA_REESCRITA = {
    type: 'object',
    properties: { texto: { type: 'string' } },
    required: ['texto'],
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
      `Você revisa textos em ${NOMES_DE_IDIOMA[idioma]} e aponta só problemas de pontuação, de clareza, de escolha de palavra e de tom.`,
      'Regras:',
      '- Se o texto estiver correto e claro, devolva "sugestoes": [].',
      '- Cada sugestão troca só a palavra ou o trecho curto que ficou ruim; nunca reescreva a frase inteira nem o resto do texto.',
      '- "original" é uma cópia exata, caractere por caractere, de um trecho contíguo do texto recebido.',
      `- "substituicao" acrescenta no máximo ${PALAVRAS_A_MAIS_NO_MAXIMO} palavras a "original"; prefira a troca mais curta que resolve.`,
      '- tipo "gramatica": só pontuação. Vírgula que falta ou sobra (vocativo, oração que vem antes da principal, antes de "mas" e "porém", entre itens de uma enumeração), sinal que falta no fim da frase, espaço antes de pontuação.',
      '- Na troca de pontuação, "original" leva a palavra antes do sinal e "substituicao" a mesma palavra com o sinal certo (ex.: "Olá João" vira "Olá, João").',
      '- tipo "clareza": trecho confuso, redundante ou repetido que fica mais claro e mais curto.',
      '- tipo "palavra": palavra vaga ou repetida que tem opção mais precisa do mesmo tamanho ou menor.',
      `- tipo "tom": trecho que destoa claramente do tom ${TONS[tom] || TONS.neutro}.`,
      GIRIA_POR_TOM[tom] || GIRIA_POR_TOM.neutro,
      '- Não aponte ortografia, acentuação, concordância, regência nem crase: outra ferramenta já cuida disso.',
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
      reasoning: { enabled: false },
      response_format: { type: 'json_schema', json_schema: { name: 'revisao', strict: true, schema: ESQUEMA_DA_RESPOSTA } },
      provider: { require_parameters: true },
    };
  }

  function montarReescrita(texto, { tom, idioma }) {
    const instrucao = [
      `Revise e melhore o texto recebido, em ${NOMES_DE_IDIOMA[idioma]}, ${tom ? `no tom ${TONS[tom]}` : 'mantendo o tom do original'}.`,
      '- Corrija ortografia, acentuação, concordância, regência, crase e pontuação.',
      '- Corrija maiúsculas e minúsculas: maiúscula no início de frase, em nome próprio e em sigla; minúscula no resto, sem palavra toda em maiúsculas sem motivo.',
      '- Melhore a escrita: frase confusa fica clara, repetição sai, palavra vaga vira precisa.',
      '- Mantenha o sentido, os nomes, os números e os fatos; não acrescente informação.',
      `- Não acrescente frase, saudação, despedida, explicação nem conclusão que o original não tem; o resultado tem no máximo ${PALAVRAS_A_MAIS_NO_MAXIMO} palavras a mais que o original.`,
      '- Mantenha as quebras de linha e o tamanho próximo do original. Se o texto já estiver bom, devolva-o igual.',
      '- Responda só com o objeto JSON {"texto": "..."}, sem texto fora dele.',
    ].join('\n');
    return {
      models: MODELOS,
      messages: [
        { role: 'system', content: instrucao },
        { role: 'user', content: texto },
      ],
      temperature: 0,
      reasoning: { enabled: false },
      response_format: { type: 'json_schema', json_schema: { name: 'reescrita', strict: true, schema: ESQUEMA_DA_REESCRITA } },
      provider: { require_parameters: true },
    };
  }

  function lerReescrita(corpo) {
    const conteudo = corpo?.choices?.[0]?.message?.content;
    if (typeof conteudo !== 'string') throw new Error('resposta sem conteúdo');
    const dados = JSON.parse(conteudo);
    if (typeof dados?.texto !== 'string' || !dados.texto.trim()) throw new Error('resposta sem texto reescrito');
    return { texto: dados.texto, modelo: typeof corpo.model === 'string' ? corpo.model : '' };
  }

  function acrescentaDemais(original, reescrito) {
    return contarPalavras(reescrito) - contarPalavras(original) > PALAVRAS_A_MAIS_NO_MAXIMO;
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

  function limitesDeFrase(texto) {
    const limites = [];
    let inicio = 0;
    for (const m of texto.matchAll(/[.!?…]+["'”’)\]]*\s+/gu)) {
      const fim = m.index + m[0].length;
      limites.push([inicio, fim]);
      inicio = fim;
    }
    if (inicio < texto.length) limites.push([inicio, texto.length]);
    return limites;
  }

  function trechosDoParagrafo(texto, sugestoes) {
    const frases = texto.length <= TAMANHO_MAXIMO_TRECHO ? [[0, texto.length]] : limitesDeFrase(texto);
    const trechos = [];
    for (const s of [...sugestoes].sort((a, b) => a.inicio - b.inicio)) {
      let i = frases.findIndex(([, fim]) => s.inicio < fim);
      if (i === -1) i = frases.length - 1;
      const inicio = frases[i][0];
      let fim = frases[i][1];
      while (s.fim > fim && i < frases.length - 1) fim = frases[++i][1];
      const ultimo = trechos.at(-1);
      if (ultimo && inicio < ultimo.fim) {
        ultimo.fim = Math.max(ultimo.fim, fim);
        ultimo.sugestoes.push(s);
      } else {
        trechos.push({ inicio, fim, sugestoes: [s] });
      }
    }
    for (const t of trechos) {
      const ultimaTroca = Math.max(...t.sugestoes.map((s) => s.fim));
      t.fim = Math.max(ultimaTroca, t.inicio + texto.slice(t.inicio, t.fim).trimEnd().length);
    }
    return trechos;
  }

  function partesDoTrecho(texto, trecho) {
    const partes = [];
    let cursor = trecho.inicio;
    for (const s of trecho.sugestoes) {
      if (s.inicio > cursor) partes.push({ igual: texto.slice(cursor, s.inicio) });
      partes.push({ de: s.original, para: s.substituicao, tipo: s.tipo });
      cursor = s.fim;
    }
    if (cursor < trecho.fim) partes.push({ igual: texto.slice(cursor, trecho.fim) });
    return partes;
  }

  function aplicarTrecho(texto, sugestoes, trecho) {
    let atual = { texto, sugestoes };
    for (const s of [...trecho.sugestoes].sort((a, b) => b.inicio - a.inicio)) {
      atual = aplicarNoParagrafo(atual.texto, atual.sugestoes, s);
    }
    return atual;
  }

  function diferencaDePalavras(antes, depois) {
    const a = antes.match(/\s+|\S+/g) || [];
    const b = depois.match(/\s+|\S+/g) || [];
    if (a.length * b.length > TOKENS_NO_DIFF_NO_MAXIMO) return antes === depois ? [{ igual: antes }] : [{ de: antes, para: depois }];
    const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const partes = [];
    const anexar = (campo, token) => {
      const ultima = partes.at(-1);
      if (campo === 'igual') {
        if (ultima && 'igual' in ultima) ultima.igual += token;
        else partes.push({ igual: token });
        return;
      }
      if (!ultima || 'igual' in ultima) partes.push({ de: '', para: '' });
      partes.at(-1)[campo] += token;
    };
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        anexar('igual', a[i++]);
        j++;
      } else if (j >= b.length || (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1])) {
        anexar('de', a[i++]);
      } else {
        anexar('para', b[j++]);
      }
    }
    return partes;
  }

  function manterQuebrasDeLinha(antes, depois) {
    const linhas = antes.split('\n');
    if ((depois.match(/\n/g) || []).length === linhas.length - 1) return depois;
    const contar = (t) => t.split(/\s+/).filter(Boolean).length;
    const palavras = depois.split(/\s+/).filter(Boolean);
    const total = contar(antes) || 1;
    const quebrasAntes = new Array(palavras.length + 1).fill('');
    let acumulado = 0;
    for (const linha of linhas.slice(0, -1)) {
      acumulado += contar(linha);
      quebrasAntes[Math.round((acumulado * palavras.length) / total)] += '\n';
    }
    return palavras.map((p, k) => (k === 0 ? quebrasAntes[0] : quebrasAntes[k] || ' ') + p).join('') + quebrasAntes[palavras.length];
  }

  raiz.RevisorCore = {
    TIPOS,
    TONS,
    ROTULOS_DE_TOM,
    ENDPOINT,
    dividirParagrafos,
    revisavel,
    montarRequisicao,
    lerResposta,
    montarReescrita,
    lerReescrita,
    acrescentaDemais,
    contemPalavraDoDicionario,
    contarPalavras,
    filtrarSugestoes,
    aplicarNoParagrafo,
    trechosDoParagrafo,
    partesDoTrecho,
    aplicarTrecho,
    diferencaDePalavras,
    manterQuebrasDeLinha,
  };
})(globalThis);
