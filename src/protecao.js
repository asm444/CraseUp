(function (raiz) {
  const ROTULOS_DE_SEGREDO = [
    [/^(?:senha|password|passwd|pwd|pass|passcode|passphrase)$/i, 'SENHA'],
    [/^(?:token|bearer|access[_-]?token|refresh[_-]?token)$/i, 'TOKEN'],
    [/^(?:api[_-]?key|apikey|chave(?:\s+(?:de\s+)?api)?|key|client[_-]?secret)$/i, 'CHAVE_API'],
    [/^pin$/i, 'PIN'],
    [/^(?:otp|c[oó]digo(?:\s+de\s+(?:verifica[cç][aã]o|acesso|seguran[cç]a))?)$/i, 'CODIGO'],
  ];
  const ROTULOS_DE_NUMERO = [
    [/^protocolo$/i, 'PROTOCOLO'],
    [/^(?:pedido|ordem)$/i, 'PEDIDO'],
    [/^(?:conta(?:\s+corrente)?|cc)$/i, 'CONTA'],
    [/^ag[eê]ncia$/i, 'AGENCIA'],
    [/^matr[ií]cula$/i, 'MATRICULA'],
    [/^processo$/i, 'PROCESSO'],
    [/^rg$/i, 'RG'],
    [/^cnh$/i, 'CNH'],
    [/^(?:pis|pasep|nis|nit)$/i, 'PIS'],
    [/^t[ií]tulo(?:\s+de\s+eleitor)?$/i, 'TITULO_ELEITOR'],
    [/^renavam$/i, 'RENAVAM'],
    [/^passaporte$/i, 'PASSAPORTE'],
    [/^(?:boleto|linha\s+digit[aá]vel|c[oó]digo\s+de\s+barras)$/i, 'BOLETO'],
    [/^(?:nota(?:\s+fiscal)?|nf-?e?)$/i, 'NOTA_FISCAL'],
    [/^(?:chave\s+pix|pix)$/i, 'CHAVE_PIX'],
    [/^(?:cart[aã]o|card)$/i, 'CARTAO'],
    [/^(?:cvv|cvc|csc)$/i, 'CVV'],
    [/^(?:ip|endere[cç]o\s+ip)$/i, 'IP'],
  ];
  const PALAVRAS_DE_SEGREDO = 'senha|password|passwd|pwd|pass|passcode|passphrase|token|bearer|access[_-]?token|refresh[_-]?token|api[_-]?key|apikey|chave(?:\\s+(?:de\\s+)?api)?|key|client[_-]?secret|secret|segredo|pin|otp|c[oó]digo(?:\\s+de\\s+(?:verifica[cç][aã]o|acesso|seguran[cç]a))?';
  const PALAVRAS_DE_NUMERO = 'protocolo|pedido|ordem|conta(?:\\s+corrente)?|cc|ag[eê]ncia|matr[ií]cula|processo|rg|cnh|pis|pasep|nis|nit|t[ií]tulo(?:\\s+de\\s+eleitor)?|renavam|passaporte|boleto|linha\\s+digit[aá]vel|c[oó]digo\\s+de\\s+barras|nota(?:\\s+fiscal)?|nf-?e?|chave\\s+pix|pix|cart[aã]o|card|cvv|cvc|csc|ip|endere[cç]o\\s+ip';
  const LIGACAO = '\\s{0,120}(?:(?:n[ºo°]\\.?|número|numero|#|é|eh|e|=|:|is|-)\\s{0,120}){0,3}';
  const FIM_DE_TOKEN = /[.,;:!?)\]}"'»]+$/;

  function temValorAdiante(m) {
    return m.input.slice(m.index + m[0].length).split(/\s+/, 5).map((t) => t.replace(FIM_DE_TOKEN, '')).some((t) => t.length >= 4 && /[\p{N}\p{P}\p{S}]/u.test(t));
  }

  function rotuloPorContexto(palavra, tabela, padrao) {
    return (tabela.find(([re]) => re.test(palavra)) || [null, padrao])[1];
  }

  const REGRAS = [
    { tipo: 'CHAVE_PRIVADA', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
    { tipo: 'CHAVE_SSH', re: /\b(?:ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-nistp\d+) [A-Za-z0-9+/=]{40,}/g },
    { tipo: 'TOKEN', re: /\beyJ[\w-]{6,}\.eyJ[\w-]{6,}\.[\w-]{6,}/g },
    {
      re: new RegExp(`(?<=\\b(${PALAVRAS_DE_SEGREDO})${LIGACAO})(?![:=])[^\\s]{4,}`, 'giu'),
      tipoDe: (m) => rotuloPorContexto(m[1], ROTULOS_DE_SEGREDO, 'SEGREDO'),
      valido: (v, m) => /[\p{N}\p{P}\p{S}]/u.test(v) || (/^(?:senha|password|passwd|passphrase|passcode|segredo|secret)$/i.test(m[1]) && !temValorAdiante(m)),
      limpar: true,
    },
    {
      re: new RegExp(`(?<=\\b(${PALAVRAS_DE_SEGREDO})(?:\\s{1,40}\\p{L}{1,20}[:,]?){1,4}${LIGACAO})(?![:=])[^\\s]{4,}`, 'giu'),
      tipoDe: (m) => rotuloPorContexto(m[1], ROTULOS_DE_SEGREDO, 'SEGREDO'),
      valido: (v) => /[\p{N}\p{P}\p{S}]/u.test(v),
      limpar: true,
    },
    {
      tipo: 'CHAVE_API',
      re: new RegExp([
        'sk-or-v1-[a-f0-9]{32,}',
        'sk-ant-[\\w-]{20,}',
        'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}',
        '(?:AKIA|ASIA)[0-9A-Z]{16}',
        'gh[pousr]_[A-Za-z0-9]{30,}',
        'github_pat_\\w{22,}',
        'glpat-[\\w-]{20,}',
        'AIza[0-9A-Za-z_-]{35}',
        'ya29\\.[\\w-]{20,}',
        'xox[abposr]-[A-Za-z0-9-]{10,}',
        '(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}',
        'whsec_[A-Za-z0-9]{20,}',
        'hf_[A-Za-z0-9]{30,}',
        'npm_[A-Za-z0-9]{30,}',
        'pypi-[\\w-]{50,}',
        'SG\\.[\\w-]{16,}\\.[\\w-]{16,}',
        'AC[a-f0-9]{32}',
        'dop_v1_[a-f0-9]{64}',
        'shp(?:at|ss|ca|pa)_[a-fA-F0-9]{32}',
        'EAA[A-Za-z0-9]{30,}',
        'AAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}',
        '\\d{8,10}:[A-Za-z0-9_-]{35}',
      ].map((p) => `\\b${p}`).join('|'), 'g'),
    },
    { tipo: 'URL_COM_CREDENCIAL', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@[^\s<>"')\]]+/gi },
    { tipo: 'EMAIL', re: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu },
    { tipo: 'EMAIL', re: /[\p{L}\p{N}._%+-]+(?:\s+@\s*|@\s+|\s+arroba\s+|\s*[[(]at[\])]\s*)[\p{L}\p{N}-]+(?:(?:\s*\.\s*|\s+ponto\s+|\s*[[(]dot[\])]\s*)[\p{L}\p{N}-]+)+/giu },
    { tipo: 'LINK', re: /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"')\]]*[^\s<>"')\].,;:!?]/gi },
    { tipo: 'IP', re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b|\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi },
    { tipo: 'MAC', re: /\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b/gi },
    { tipo: 'IBAN', re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g, valido: ibanValido },
    { tipo: 'BOLETO', re: /\b\d{5}\.?\d{5}\s?\d{5}\.?\d{6}\s?\d{5}\.?\d{6}\s?\d\s?\d{14}\b|\b\d{47,48}\b/g },
    { tipo: 'CARTAO', re: /\b(?:\d[ -]?){12,18}\d\b/g, valido: luhnValido },
    { tipo: 'CNPJ', re: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g },
    { tipo: 'CPF', re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{3} \d{3} \d{3}[ -]\d{2}\b|\b\d{11}\b/g, valido: cpfValido },
    { tipo: 'SSN', re: /\b\d{3}-\d{2}-\d{4}\b/g },
    { tipo: 'PLACA', re: /\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/g },
    {
      re: new RegExp(`(?<=\\b(${PALAVRAS_DE_NUMERO})${LIGACAO})[\\p{L}\\p{N}][\\p{L}\\p{N}.\\-/]*\\p{N}[\\p{L}\\p{N}]*`, 'giu'),
      tipoDe: (m) => rotuloPorContexto(m[1], ROTULOS_DE_NUMERO, 'NUMERO'),
    },
    { tipo: 'TELEFONE', re: /\b0[3589]00[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
    { tipo: 'TELEFONE', re: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,3}\)|\b\d{2,3})[\s.-]?9?\d{4}[\s.-]\d{4}\b/g },
    { tipo: 'CEP', re: /\b\d{5}-\d{3}\b/g },
    { tipo: 'DATA', re: /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g },
    { tipo: 'VALOR', re: /(?:R\$|US\$|\$|€|£)\s?\d[\d.,]*/g },
    { tipo: 'SEGREDO', re: /(?<![\p{L}\p{N}])(?=[^\s]{8,})(?=[^\s]*\p{N})(?=[^\s]*\p{L})[^\s]+/gu, valido: pareceSegredo, limpar: true },
    { tipo: 'SEGREDO', re: /\b[a-f0-9]{32,}\b|\b[A-Za-z0-9+/]{32,}={0,2}(?![\p{L}\p{N}])/gu },
    { tipo: 'NUMERO', re: /\d+(?:[.,\-/:]\d+)+|\d{4,}/g, valido: (v) => v.match(/\d/g).length >= 4 },
  ];
  const TIPOS = [...new Set([
    ...REGRAS.filter((r) => r.tipo).map((r) => r.tipo),
    ...ROTULOS_DE_SEGREDO.map(([, t]) => t),
    ...ROTULOS_DE_NUMERO.map(([, t]) => t),
  ])].sort((a, b) => b.length - a.length);
  const MARCADOR = new RegExp(`\\[\\s*(${TIPOS.join('|')})[\\s_-]*(\\d+)\\s*\\]`, 'g');

  function luhnValido(valor) {
    const digitos = valor.replace(/\D/g, '');
    let soma = 0;
    for (let i = 0; i < digitos.length; i++) {
      let d = Number(digitos[digitos.length - 1 - i]);
      if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
      soma += d;
    }
    return soma % 10 === 0;
  }

  function cpfValido(valor) {
    const d = valor.replace(/\D/g, '');
    if (/^(\d)\1{10}$/.test(d)) return false;
    const digito = (n) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
  }

  function ibanValido(valor) {
    const limpo = valor.replace(/\s/g, '');
    if (limpo.length > 34) return false;
    const rearranjado = (limpo.slice(4) + limpo.slice(0, 4)).replace(/[A-Z]/g, (l) => String(l.charCodeAt(0) - 55));
    let resto = 0;
    for (const c of rearranjado) resto = (resto * 10 + Number(c)) % 97;
    return resto === 1;
  }

  function pareceSegredo(token) {
    if (token.length < 8) return false;
    const classes = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}]/u].filter((r) => r.test(token)).length;
    if (classes >= 3) return true;
    const digitos = (token.match(/\p{N}/gu) || []).length;
    return token.length >= 12 && digitos >= 3 && classes >= 2;
  }

  function encontrar(texto) {
    const achados = [];
    const livre = (inicio, fim) => achados.every((a) => fim <= a.inicio || inicio >= a.fim);
    for (const regra of REGRAS) {
      for (const m of texto.matchAll(regra.re)) {
        const valor = regra.limpar ? m[0].replace(FIM_DE_TOKEN, '') : m[0];
        const inicio = m.index;
        const fim = inicio + valor.length;
        if (!valor || (regra.valido && !regra.valido(valor, m)) || !livre(inicio, fim)) continue;
        achados.push({ tipo: regra.tipo || regra.tipoDe(m), inicio, fim, valor });
      }
    }
    return achados.sort((a, b) => a.inicio - b.inicio);
  }

  function mascarar(texto) {
    const contagem = {};
    const itens = [];
    let saida = '';
    let cursor = 0;
    for (const achado of encontrar(texto)) {
      contagem[achado.tipo] = (contagem[achado.tipo] || 0) + 1;
      const marcador = `[${achado.tipo}_${contagem[achado.tipo]}]`;
      saida += texto.slice(cursor, achado.inicio);
      itens.push({ ...achado, marcador, inicioMascarado: saida.length, fimMascarado: saida.length + marcador.length });
      saida += marcador;
      cursor = achado.fim;
    }
    return { texto: saida + texto.slice(cursor), itens };
  }

  function restaurar(texto, itens) {
    const porMarcador = new Map(itens.map((i) => [i.marcador, i.valor]));
    const usados = [];
    let desconhecido = false;
    const restaurado = texto.replace(MARCADOR, (bruto, tipo, n) => {
      const chave = `[${tipo}_${Number(n)}]`;
      if (!porMarcador.has(chave)) {
        desconhecido = true;
        return bruto;
      }
      usados.push(chave);
      return porMarcador.get(chave);
    });
    return { texto: restaurado, usados, desconhecido };
  }

  function posicaoOriginal(posicaoMascarada, itens) {
    let delta = 0;
    for (const item of itens) {
      if (posicaoMascarada < item.inicioMascarado) break;
      if (posicaoMascarada < item.fimMascarado) return null;
      delta += item.fim - item.inicio - (item.fimMascarado - item.inicioMascarado);
    }
    return posicaoMascarada + delta;
  }

  const INSTRUCAO = '- O texto traz marcadores em maiúsculas entre colchetes, como [EMAIL_1], [SENHA_1], [CPF_1] ou [TELEFONE_1], no lugar de dados que não podem sair do computador. Mantenha cada marcador exatamente igual e na mesma posição da frase; não o traduza, não o corrija, não o remova e não invente marcador novo. Trate o marcador como o dado que o nome dele indica.';

  raiz.RevisorProtecao = { TIPOS, INSTRUCAO, encontrar, mascarar, restaurar, posicaoOriginal, luhnValido, cpfValido, ibanValido, pareceSegredo };
})(globalThis);
