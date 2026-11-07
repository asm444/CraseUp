(function (raiz) {
  const METRICAS = {
    chamadas: { rotulo: 'Chamadas', valor: (r) => r.chamadas },
    tokens: { rotulo: 'Tokens', valor: (r) => r.entrada + r.saida },
    segundos: { rotulo: 'Tempo poupado', valor: (r) => r.segundos },
    equivalente: { rotulo: 'Se fosse pago', valor: (r, preco) => raiz.RevisorCore.custoEquivalente(r, preco) || 0 },
  };
  const OUTROS = 'Outros';
  const NS = 'http://www.w3.org/2000/svg';

  function chaveDoBalde(dia, periodo) {
    return periodo === 'ano' ? dia.slice(0, 4) : periodo === 'mes' ? dia.slice(0, 7) : dia;
  }

  function baldes(de, ate, periodo) {
    const lista = [];
    const atual = new Date(`${de}T12:00:00`);
    const fim = new Date(`${ate}T12:00:00`);
    while (atual <= fim && lista.length < 400) {
      const chave = chaveDoBalde(atual.toLocaleDateString('sv'), periodo);
      lista.push(chave);
      if (periodo === 'ano') atual.setFullYear(atual.getFullYear() + 1, 0, 1);
      else if (periodo === 'mes') atual.setMonth(atual.getMonth() + 1, 1);
      else atual.setDate(atual.getDate() + 1);
    }
    return lista;
  }

  function agrupar(consumo, precos, { de, ate, periodo, metrica, modelos }) {
    const chaves = baldes(de, ate, periodo);
    const porChave = new Map(chaves.map((c) => [c, {}]));
    const series = new Set();
    const totais = { chamadas: 0, tokens: 0, segundos: 0, equivalente: 0 };
    for (const [dia, doDia] of Object.entries(consumo)) {
      if (dia < de || dia > ate) continue;
      const balde = porChave.get(chaveDoBalde(dia, periodo));
      if (!balde) continue;
      for (const [modelo, registro] of Object.entries(doDia)) {
        const preco = precos.porModelo?.[modelo];
        const serie = modelos.includes(modelo) ? modelo : OUTROS;
        series.add(serie);
        balde[serie] = (balde[serie] || 0) + METRICAS[metrica].valor(registro, preco);
        for (const nome of Object.keys(totais)) totais[nome] += METRICAS[nome].valor(registro, preco);
      }
    }
    const ordem = [...modelos, OUTROS].filter((s) => series.has(s));
    return { series: ordem, baldes: chaves.map((chave) => ({ chave, valores: porChave.get(chave) })), totais };
  }

  function rotuloDoBalde(chave, periodo) {
    if (periodo === 'ano') return chave;
    if (periodo === 'mes') return new Date(`${chave}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    return new Date(`${chave}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function formatar(metrica, valor) {
    if (metrica === 'equivalente') return `US$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: valor < 1 ? 4 : 2 })}`;
    if (metrica === 'segundos') {
      const minutos = Math.round(valor / 60);
      return minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
    }
    return Math.round(valor).toLocaleString('pt-BR', { notation: valor >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 });
  }

  function escalaBonita(maximo) {
    if (maximo <= 0) return 1;
    const potencia = 10 ** Math.floor(Math.log10(maximo));
    return [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((v) => v >= maximo);
  }

  function svg(tag, atributos) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
    return el;
  }

  function animarNumero(el, alvo, metrica) {
    const inicio = performance.now();
    const de = Number(el.dataset.valor || 0);
    el.dataset.valor = alvo;
    const passo = (agora) => {
      const t = Math.min(1, (agora - inicio) / 600);
      const suave = 1 - (1 - t) ** 3;
      el.textContent = formatar(metrica, de + (alvo - de) * suave);
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  function desenharBarras(alvo, dados, { metrica, periodo, cor, dica }) {
    const largura = Math.max(alvo.clientWidth, 320);
    const altura = 280;
    const margem = { topo: 12, direita: 8, base: 28, esquerda: 56 };
    const area = { largura: largura - margem.esquerda - margem.direita, altura: altura - margem.topo - margem.base };
    const somas = dados.baldes.map((b) => Object.values(b.valores).reduce((a, v) => a + v, 0));
    const teto = escalaBonita(Math.max(...somas) / 4) * 4;
    const passo = area.largura / dados.baldes.length;
    const larguraBarra = Math.max(2, Math.min(36, passo * 0.62));
    const y = (v) => margem.topo + area.altura - (v / teto) * area.altura;

    const raizSvg = svg('svg', { viewBox: `0 0 ${largura} ${altura}`, role: 'img', 'aria-label': `${METRICAS[metrica].rotulo} por período` });
    for (let i = 0; i <= 4; i++) {
      const valor = (teto / 4) * i;
      raizSvg.append(svg('line', { x1: margem.esquerda, x2: largura - margem.direita, y1: y(valor), y2: y(valor), class: i ? 'grade-linha' : 'eixo' }));
      const texto = svg('text', { x: margem.esquerda - 8, y: y(valor) + 4, class: 'eixo-rotulo', 'text-anchor': 'end' });
      texto.textContent = formatar(metrica, valor);
      raizSvg.append(texto);
    }
    const saltoDeRotulo = Math.ceil(dados.baldes.length / Math.floor(area.largura / 56));
    dados.baldes.forEach((balde, i) => {
      const x = margem.esquerda + passo * i + (passo - larguraBarra) / 2;
      const grupo = svg('g', { class: 'barra', style: `--atraso:${Math.min(i * 12, 400)}ms` });
      let base = 0;
      const presentes = dados.series.filter((s) => balde.valores[s] > 0);
      presentes.forEach((serie, k) => {
        const valor = balde.valores[serie];
        const topo = y(base + valor);
        const fundo = y(base);
        const ultimo = k === presentes.length - 1;
        const alturaSeg = Math.max(0, fundo - topo - (k ? 2 : 0));
        const r = ultimo ? Math.min(4, larguraBarra / 2, alturaSeg) : 0;
        const d = `M${x},${topo + alturaSeg} V${topo + r} Q${x},${topo} ${x + r},${topo} H${x + larguraBarra - r} Q${x + larguraBarra},${topo} ${x + larguraBarra},${topo + r} V${topo + alturaSeg} Z`;
        grupo.append(svg('path', { d, fill: cor(serie) }));
        base += valor;
      });
      const alvoDeToque = svg('rect', { x: margem.esquerda + passo * i, y: margem.topo, width: passo, height: area.altura, class: 'toque' });
      alvoDeToque.addEventListener('mouseenter', (e) => dica(e, balde, somas[i]));
      alvoDeToque.addEventListener('mousemove', (e) => dica(e, balde, somas[i]));
      alvoDeToque.addEventListener('mouseleave', () => dica(null));
      grupo.append(alvoDeToque);
      raizSvg.append(grupo);
      if (i % saltoDeRotulo === 0) {
        const rotulo = svg('text', { x: margem.esquerda + passo * i + passo / 2, y: altura - 8, class: 'eixo-rotulo', 'text-anchor': 'middle' });
        rotulo.textContent = rotuloDoBalde(balde.chave, periodo);
        raizSvg.append(rotulo);
      }
    });
    alvo.replaceChildren(raizSvg);
  }

  raiz.RevisorGraficos = { baldes, agrupar, rotuloDoBalde, formatar, escalaBonita, animarNumero, desenharBarras };
})(globalThis);
