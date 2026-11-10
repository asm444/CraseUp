import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const contexto = vm.createContext({});
for (const arquivo of ['src/core.js', 'tests/corpus/casos.js']) vm.runInContext(readFileSync(join(raiz, arquivo), 'utf8'), contexto);
const { RevisorCore: C, CORPUS } = contexto;

const chave = process.env.CRASEUP_OPENROUTER_CHAVE;
if (!chave) {
  console.error('Defina CRASEUP_OPENROUTER_CHAVE com a chave do OpenRouter. Cada caso do corpus gasta uma chamada da cota.');
  process.exit(2);
}

const casos = CORPUS.filter((c) => c.modelo);
const porCategoria = {};
for (const c of casos) {
  const resposta = await fetch(`${C.ENDPOINT}chat/completions`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}`, 'X-Title': 'CraseUp corpus' },
    body: JSON.stringify(C.montarRequisicao(c.texto, { tom: c.tom, dicionario: c.dicionario })),
  });
  const conta = (porCategoria[c.categoria] ||= { casos: 0, acertos: 0, falsosPositivos: 0, erros: 0 });
  conta.casos++;
  if (!resposta.ok) {
    conta.erros++;
    console.log(`ERRO  [${c.categoria}] ${c.nome}: HTTP ${resposta.status}`);
    continue;
  }
  let sugestoes;
  try {
    sugestoes = C.filtrarSugestoes(c.texto, C.lerResposta(await resposta.json()).sugestoes, { dicionario: c.dicionario });
  } catch (erro) {
    conta.erros++;
    console.log(`ERRO  [${c.categoria}] ${c.nome}: ${erro.message}`);
    continue;
  }
  const acertou = (c.deveSugerir || []).every(([o, n]) => sugestoes.some((s) => s.original === o && s.substituicao === n));
  const sobrou = (c.naoDeveSugerir || []).filter((o) => sugestoes.some((s) => s.original === o));
  if (acertou) conta.acertos++;
  conta.falsosPositivos += sobrou.length;
  console.log(`${acertou && !sobrou.length ? 'ok   ' : 'FALHA'} [${c.categoria}] ${c.nome}: ${JSON.stringify(sugestoes.map((s) => [s.original, s.substituicao]))}`);
}
console.log('\ncategoria\tcasos\tacertos\tfalsos positivos\terros');
for (const [categoria, c] of Object.entries(porCategoria)) console.log(`${categoria}\t${c.casos}\t${c.acertos}\t${c.falsosPositivos}\t${c.erros}`);
