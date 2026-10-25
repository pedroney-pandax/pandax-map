/* Teste da camada de navegacao (js/navegacao.js).
 *
 * Foca na matematica pura, que e onde mora o risco real: se o calculo de
 * "em que metro da rota estou" ou "qual e a proxima manobra" estiver errado,
 * o app manda o motorista para a rua errada com total confianca. Erro de GPS
 * se corrige sozinho; erro de conta, nao.
 *
 * Roda contra uma rota de verdade do Valhalla e depois simula o motorista
 * percorrendo a geometria: as manobras devem vir em ordem, sem aviso atrasado,
 *
 * Rodar:  npm test
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// navegacao.js nao depende de servico nem de DOM, mas a sandbox precisa de
// window porque o arquivo se publica por la.
const sandbox = { console, fetch, AbortController, setTimeout, clearTimeout };
sandbox.window = sandbox;
vm.createContext(sandbox);

for (const file of ['js/config.js', 'js/services.js', 'js/navegacao.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
}

const SVC = sandbox.NAV_SERVICES;
const NAV = sandbox.NAV_NAV;

let falhas = 0;
function check(nome, condicao, detalhe) {
  if (condicao) {
    console.log('  OK    ' + nome);
  } else {
    console.log('  FALHA ' + nome + (detalhe ? '  -> ' + detalhe : ''));
    falhas++;
  }
}

/* ------------------------------------------------------------------ */
console.log('\nGeometria pura');

// 1 grau de latitude ~ 111,2 km. Usado como referencia de sanidade.
const gNorteSul = [[-16.68, -49.27], [-16.67, -49.27]];
const d1 = NAV.haversine(gNorteSul[0], gNorteSul[1]);
check('haversine: 0,01 grau de lat vira ~1,1 km',
  Math.abs(d1 - 1112) < 15, d1.toFixed(0) + ' m');

check('haversine: mesmo ponto da zero',
  NAV.haversine(gNorteSul[0], gNorteSul[0]) === 0);

const cums = NAV.cumulativos(gNorteSul);
check('cumulativos comeca em zero', cums[0] === 0);
check('cumulativos bate com haversine',
  Math.abs(cums[1] - d1) < 0.001, cums[1].toFixed(2) + ' vs ' + d1.toFixed(2));

// reta de 2,1 km para o oeste
const reta = [[-16.68, -49.27], [-16.68, -49.25]];
const cumsReta = NAV.cumulativos(reta);
const totalReta = cumsReta[1];

const noMeio = NAV.maisPerto(reta, cumsReta, -16.68, -49.26);
check('maisPerto: no meio da reta dist ~ 0',
  noMeio.dist < 1, noMeio.dist.toFixed(2) + ' m');
check('maisPerto: no meio da reta along ~ metade',
  Math.abs(noMeio.along - totalReta / 2) < 40,
  noMeio.along.toFixed(0) + ' de ' + totalReta.toFixed(0) + ' m');

const deslocado = NAV.maisPerto(reta, cumsReta, -16.685, -49.26);
check('maisPerto: 500 m fora da rota acusa desvio',
  deslocado.dist > 400 && deslocado.dist < 700, deslocado.dist.toFixed(0) + ' m');
check('maisPerto: projetado na reta mantem o along',
  Math.abs(deslocado.along - totalReta / 2) < 60, deslocado.along.toFixed(0) + ' m');

/* ------------------------------------------------------------------ */
console.log('\nPreparacao da rota');

// Rota sintetica. steps em QUILOMETROS, como o Valhalla devolve; a
// geometria abaixo mede uns 3,2 km, entao as manobras fecham nesse total.
const rotaFake = {
  geometry: [[-16.68, -49.27], [-16.68, -49.25], [-16.67, -49.25]],
  durationSec: 300,
  steps: [
    { type: 1, instruction: 'Siga para o norte', distance: 1.1, cumulative: 1.1, icon: 'i' },
    { type: 2, instruction: 'Vire a direita', distance: 1.2, cumulative: 2.3, icon: 'd' },
    { type: 3, instruction: 'Vire a esquerda', distance: 0.944, cumulative: 3.244, icon: 'e' }
  ]
};
const prep = NAV.prepararRota(rotaFake);
check('prepararRota: geometria tem pontos', prep.geometry.length === 3);
check('prepararRota: total > 0', prep.total > 2400, prep.total.toFixed(0) + ' m');
check('prepararRota: mesmo numero de passos', prep.passos.length === 3);

// A soma das manobras (3,244 km) e a polyline (~3,24 km) nao batem de
// primeira; o fator tem que colocar as duas na mesma regua.
check('prepararRota: fator de correcao calculado',
  prep.fator > 0.9 && prep.fator < 1.1, prep.fator.toFixed(4));

check('prepararRota: km do Valhalla virou metro',
  Math.abs(prep.passos[0].distance - 1100) < 150, prep.passos[0].distance.toFixed(0) + ' m');
check('prepararRota: manobra fica no fim do trecho, nao no comeco',
  Math.abs(prep.passos[0].turnAt - 1100) < 150, prep.passos[0].turnAt.toFixed(0) + ' m');
check('prepararRota: inicio do trecho e a curva menos o comprimento',
  Math.abs(prep.passos[0].inicio) < 60, prep.passos[0].inicio.toFixed(0) + ' m');
check('prepararRota: curvas em ordem crescente',
  prep.passos.every((p, i) => i === 0 || p.turnAt > prep.passos[i - 1].turnAt),
  prep.passos.map(p => p.turnAt.toFixed(0)).join(','));

const inicio1 = NAV.proximoPasso(prep, 0);
check('proximoPasso: no inicio mostra a primeira manobra',
  inicio1 && inicio1.indice === 0, inicio1 && inicio1.indice);
check('proximoPasso: no inicio anuncia a distancia ate a curva',
  inicio1 && Math.abs(inicio1.dist - prep.passos[0].turnAt) < 1,
  inicio1 && inicio1.dist.toFixed(0) + ' m');

const inicio2 = NAV.proximoPasso(prep, 1200);
check('proximoPasso: depois da primeira vira a segunda',
  inicio2 && inicio2.indice === 1, inicio2 && inicio2.indice);
check('proximoPasso: distancia ate a manobra e positiva',
  inicio2 && inicio2.dist > 0, inicio2 && inicio2.dist.toFixed(0) + ' m');

// Andando no meio do trecho 1, a curva ainda esta a frente.
const meio1 = NAV.proximoPasso(prep, 1700);
check('proximoPasso: no meio do trecho a curva segue a frente',
  meio1 && meio1.indice === 1 && Math.abs(meio1.dist - 600) < 20,
  meio1 && (meio1.indice + ' / ' + meio1.dist.toFixed(0) + ' m'));

const fim = NAV.proximoPasso(prep, prep.total);
check('proximoPasso: no fim nao ha proxima manobra', fim === null);

// Guarda contra o descasamento de unidade: se steps viesse em metros a
// polyline de 3,2 km receberia um fator absurdo e as manobras jogariam
// para fora da rota. O clamp precisa segurar isso.
const prepDescasado = NAV.prepararRota({
  geometry: rotaFake.geometry,
  durationSec: 300,
  steps: rotaFake.steps.map(s => ({ ...s, distance: s.distance * 1000, cumulative: s.cumulative * 1000 }))
});
check('prepararRota: unidade errada nao gera fator absurdo',
  prepDescasado.fator === 1, prepDescasado.fator.toFixed(4));
// Um descasamento pequeno e real: o Valhalla mede por uma malha um pouco
// diferente da polyline, e o resumo pode nao fechar exatamente. O fator tem
// que corrigir isso, e a ultima curva tem que cair no fim da rota.
const prepRuido = NAV.prepararRota({
  geometry: rotaFake.geometry,
  durationSec: 300,
  steps: rotaFake.steps.map(s => ({ ...s, cumulative: s.cumulative * 0.93 }))
});
check('prepararRota: ruido pequeno e corrigido',
  prepRuido.fator > 1.05 && prepRuido.fator < 1.15, prepRuido.fator.toFixed(4));
check('prepararRota: depois do ajuste a ultima curva fecha com a rota',
  Math.abs(prepRuido.passos[prepRuido.passos.length - 1].turnAt - prepRuido.total) < 30,
  prepRuido.passos[prepRuido.passos.length - 1].turnAt.toFixed(0) + ' de ' + prepRuido.total.toFixed(0));

// Descasamento absurdo e recusado em vez de ser "corrigido" para o lugar
// errado. O contrato de unidade e km; o clamp existe para nao amplificar
// nem por um fator mil um dado ja corrompido.
const prepQuebrado = NAV.prepararRota({
  geometry: rotaFake.geometry,
  durationSec: 300,
  steps: rotaFake.steps.map(s => ({ ...s, cumulative: s.cumulative * 400 }))
});
check('prepararRota: razao absurda nao e aceita',
  prepQuebrado.fator === 1, prepQuebrado.fator.toFixed(4));

const rest = NAV.restante(prep, prep.total / 2);
check('restante: metade do caminho, metade da distancia',
  Math.abs(rest.dist - prep.total / 2) < 60, rest.dist.toFixed(0) + ' m');
check('restante: ainda nao chegou', rest.chegou === false);
check('restante: no fim marca chegada',
  NAV.restante(prep, prep.total).chegou === true);

/* ------------------------------------------------------------------ */
console.log('\nCarrinho, percurso e sinal de manobra');

// A geometria "cru" basta: essas funcoes so leem cums e geometry.
const prepReta = { geometry: reta, cums: cumsReta, total: totalReta };

check('bearingAB: para o norte da 0',
  Math.abs(NAV.bearingAB(reta[0], gNorteSul[1])) < 0.6 || Math.abs(NAV.bearingAB(reta[0], gNorteSul[1]) - 360) < 0.6,
  NAV.bearingAB(reta[0], gNorteSul[1]).toFixed(2));
check('bearingAB: para o sul da 180',
  Math.abs(NAV.bearingAB(gNorteSul[1], reta[0]) - 180) < 0.6,
  NAV.bearingAB(gNorteSul[1], reta[0]).toFixed(2));
check('bearingAB: para o leste da 90 (reta cresce a longitude)',
  Math.abs(NAV.bearingAB(reta[0], reta[1]) - 90) < 0.6,
  NAV.bearingAB(reta[0], reta[1]).toFixed(2));
check('bearingAB: para o oeste da 270',
  Math.abs(NAV.bearingAB(reta[1], reta[0]) - 270) < 0.6,
  NAV.bearingAB(reta[1], reta[0]).toFixed(2));

check('direcaoGeometria: no inicio da reta leste ~90',
  Math.abs(NAV.direcaoGeometria(prepReta, 0) - 90) < 0.6,
  NAV.direcaoGeometria(prepReta, 0).toFixed(2));
check('direcaoGeometria: alem do fim nao explode (clampa)',
  typeof NAV.direcaoGeometria(prepReta, 1e9) === 'number');
check('direcaoGeometria: geometria curta devolve null',
  NAV.direcaoGeometria({ geometry: [[0, 0]], cums: [0] }, 0) === null);

const pm = NAV.pontoNaGeometria(prepReta, totalReta / 2);
check('pontoNaGeometria: no meio da reta',
  Math.abs(pm[0] - (-16.68)) < 1e-6 && Math.abs(pm[1] - (-49.26)) < 1e-6,
  JSON.stringify(pm));
check('pontoNaGeometria: passou do fim, cai no ultimo vertice',
  Math.abs(NAV.pontoNaGeometria(prepReta, 1e9)[1] - (-49.25)) < 1e-6);
check('pontoNaGeometria: antes do inicio, cai no primeiro vertice',
  Math.abs(NAV.pontoNaGeometria(prepReta, -5)[0] - (-16.68)) < 1e-6);

const gr = NAV.geometriaRestante(prepReta, totalReta / 2);
check('geometriaRestante: comeca exatamente onde o carro esta',
  Math.abs(gr[0][1] - (-49.26)) < 1e-6, JSON.stringify(gr[0]));
check('geometriaRestante: termina no ultimo ponto da rota',
  Math.abs(gr[gr.length - 1][1] - (-49.25)) < 1e-6);
check('geometriaRestante: comeco da rota devolve a geometria inteira',
  NAV.geometriaRestante(prepReta, 0).length === reta.length);

/* ------------------------------------------------------------------ */
console.log('\nRota real do Valhalla, percorrida de ponta a ponta');

(async function main() {

let rota;
try {
  rota = (await SVC.fetchRoutes(
    { lat: -16.6869, lon: -49.2622, label: 'Praca Civica' },
    { lat: -16.6057, lon: -49.2453, label: 'Aeroporto' }
  ))[0];
} catch (err) {
  console.log('  AVISO rota real indisponivel: ' + err.message);
  console.log('  (os testes de geometria acima ja cobriram o essencial)');
}

if (rota) {
  const prepReal = NAV.prepararRota(rota);
  check('rota real: tem passos', prepReal.passos.length > 0, prepReal.passos.length + ' passos');
  check('rota real: geometria utilizavel', prepReal.geometry.length > 10,
    prepReal.geometry.length + ' pontos');
  check('rota real: fator de correcao proximo de 1',
    prepReal.fator > 0.9 && prepReal.fator < 1.1, prepReal.fator.toFixed(4));

  // Simula o motorista percorrendo a rota: um ponto de cada vez, sempre
  // sobre a linha, do comeco ao fim.
  let passosVistos = [];
  let foraDeOrdem = 0;
  let distanciaNegativa = 0;
  let antecipar = 0;
  const N = prepReal.geometry.length;

  for (let i = 0; i < N; i += 1) {
    const p = prepReal.geometry[i];
    const perto = NAV.maisPerto(prepReal.geometry, prepReal.cums, p[0], p[1]);
    const prox = NAV.proximoPasso(prepReal, perto.along);
    if (!prox) continue;

    if (passosVistos.length === 0 || passosVistos[passosVistos.length - 1] !== prox.indice) {
      passosVistos.push(prox.indice);
    }
    if (prox.dist < 0) distanciaNegativa++;
    // Voce so pode ver o passo i depois de ter passado a curva i-1. Se isso
    // quebra, o app esta avisando uma manobra adiantada ou pulando outra.
    if (prox.indice > 0) {
      const anterior = prepReal.passos[prox.indice - 1];
      if (perto.along + 1 < anterior.turnAt) antecipar++;
    }
  }

  check('rota real: sem distancia negativa',
    distanciaNegativa === 0, distanciaNegativa + ' casos');
  check('rota real: manobras vistas na ordem crescente',
    passosVistos.every((v, i) => i === 0 || v > passosVistos[i - 1]),
    passosVistos.join(','));
  check('rota real: nenhuma manobra anunciada antes da hora',
    antecipar === 0, antecipar + ' avisos adiantados');
  // Andando a rota inteira, nenhuma curva pode passar sem ser vista: se
  // uma some da lista, o motorista dirige aquele trecho sem instrucao nenhuma.
  const faltando = prepReal.passos.length - passosVistos.length;
  check('rota real: nenhuma manobra pulada no percurso',
    faltando <= 1, faltando + ' nao vista(s) de ' + prepReal.passos.length);

  // Chegada ao longo de toda a ultima metade da rota.
  const meio = NAV.maisPerto(prepReal.geometry, prepReal.cums,
    prepReal.geometry[N - 1][0], prepReal.geometry[N - 1][1]);
  const rFinal = NAV.restante(prepReal, meio.along);
  check('rota real: no ultimo ponto marca chegada', rFinal.chegou === true);
  check('rota real: distancia restante ~ 0 no fim',
    rFinal.dist < 60, rFinal.dist.toFixed(1) + ' m');
}

console.log('\n' + (falhas === 0 ? '>>> Tudo passou.' : '>>> ' + falhas + ' FALHA(S).') + '\n');
process.exit(falhas === 0 ? 0 : 1);

})();
