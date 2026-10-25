/* Teste da base embutida de postos de gasolina (data/postos-goiania.json).
   Rodar:  node test/postos.js
   Nao usa rede: so confere o retrato que veio no APK.

   A base e gerada por scripts/baixar-postos.js a partir do GasoRadar e os
   precos sao trocados pelos oficiais da ANP por scripts/atualizar-precos-anp.js.
   O usuario pode corrigir um valor pela interface (js/precos.js) sem mexer
   neste arquivo. Como ela vem de um site de terceiros, o teste serve de
   rede de seguranca: se uma coleta futura vier torta (posto sem coordenada,
   preco absurdo, id repetido), o build avisa antes de empacotar. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ARQUIVO = path.join(ROOT, 'data', 'postos-goiania.json');

let falhas = 0;

function check(nome, condicao, detalhe) {
  if (condicao) {
    console.log('  OK    ' + nome);
  } else {
    console.log('  FALHA ' + nome + (detalhe !== undefined ? '  -> ' + detalhe : ''));
    falhas++;
  }
}

console.log('Base de postos de gasolina (test/postos.js)\n');

check('o arquivo data/postos-goiania.json existe', fs.existsSync(ARQUIVO));
if (!fs.existsSync(ARQUIVO)) {
  console.log('\n>>> Falhou: sem a base nao ha o que testar.');
  process.exit(1);
}

const base = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
const postos = Array.isArray(base.postos) ? base.postos : [];

check('tem a lista de postos', postos.length > 0, postos.length);
check('o total bate com a lista', base.total === postos.length,
  base.total + ' vs ' + postos.length);
check('cita a fonte GasoRadar (enderecos/coordenadas)', /gasoradar/i.test(base.fonte || ''), base.fonte);
check('cita a fonte ANP (precos)', /anp/i.test((base.fonte || '') + ' ' + (base.precoFonte || '')),
  base.precoFonte);
check('tem a cidade', (base.cidade || '').length > 0, base.cidade);
check('tem a data da coleta', /^\d{4}-\d{2}-\d{2}$/.test(base.baixadoEm || ''),
  base.baixadoEm);

// Caixa generosa em volta de Goiania: pega erro grosseiro (coordenada de
// outro estado, sinal trocado) sem reprovar um posto na divisa.
const LIM = { minLat: -17.0, maxLat: -16.4, minLon: -49.6, maxLon: -49.0 };

const ids = new Set();
let semCoord = 0, comPreco = 0, coordFora = 0, precoEstranho = 0, semNome = 0;

for (const p of postos) {
  if (!p.nome || !String(p.nome).trim()) semNome++;
  if (p.lat == null || p.lon == null) semCoord++;
  else if (p.lat < LIM.minLat || p.lat > LIM.maxLat ||
           p.lon < LIM.minLon || p.lon > LIM.maxLon) coordFora++;

  if (p.precos && p.precos.gc != null) comPreco++;
  const precos = Object.values(p.precos || {}).filter((v) => v != null);
  for (const v of precos) {
    if (typeof v !== 'number' || v <= 0 || v > 20) precoEstranho++;
  }

  if (ids.has(p.id)) semNome++; // id repetido tambem e defeito
  ids.add(p.id);
}

check('todos os postos tem nome', semNome === 0, semNome + ' sem nome/id unico');
check('todos os postos tem coordenada', semCoord === 0, semCoord + ' sem lat/lon');
check('todas as coordenadas caem na regiao', coordFora === 0, coordFora + ' fora');
check('todo posto tem objeto precos', postos.every((p) => p.precos && typeof p.precos === 'object'),
  'falta precos');
check('todos os precos sao plausiveis', precoEstranho === 0, precoEstranho + ' estranhos');
check('a base vem com precos da ANP', comPreco > 0, comPreco + ' postos com gasolina comum');
check('os ids sao unicos', ids.size === postos.length,
  ids.size + ' unicos de ' + postos.length);

if (falhas) {
  console.log('\n>>> ' + falhas + ' falha(s).');
  process.exit(1);
}
console.log('\n>>> Tudo passou.');
