/* Teste do modulo de precos informados pelo usuario (js/precos.js).
   Rodar:  node test/precos.js
   Nao usa rede: roda offline e em milliseconds.

   Contrato igual ao de settings.js/favoritos.js: o localStorage pode estar
   bloqueado ou corrompido sem quebrar o app, e valor fora da faixa plausivel
   e descartado (nada de "R$ 0,00" nem "R$ 999" entrando no chip). */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

let falhas = 0;

function check(nome, condicao, detalhe) {
  if (condicao) {
    console.log('  OK    ' + nome);
  } else {
    console.log('  FALHA ' + nome + (detalhe !== undefined ? '  -> ' + detalhe : ''));
    falhas++;
  }
}

function fakeStorage(modo) {
  const dados = {};
  return {
    getItem(k) {
      if (modo === 'bloqueado') throw new Error('localStorage bloqueado');
      return Object.prototype.hasOwnProperty.call(dados, k) ? dados[k] : null;
    },
    setItem(k, v) {
      if (modo === 'bloqueado') throw new Error('sem espaco');
      dados[k] = String(v);
    },
    removeItem(k) {
      if (modo === 'bloqueado') throw new Error('localStorage bloqueado');
      delete dados[k];
    },
    _dados: dados
  };
}

function carregar(modo, conteudoInicial) {
  const ls = fakeStorage(modo);
  if (conteudoInicial !== undefined) ls._dados['pandax.precos.v1'] = conteudoInicial;

  const sandbox = { console, localStorage: ls };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'js/precos.js'), 'utf8'),
    sandbox,
    { filename: 'js/precos.js' }
  );

  return { P: sandbox.NAV_PRECOS, ls };
}

console.log('\nPrecos informados pelo usuario (js/precos.js)\n');

/* ------------------------------------------------------------------ */
console.log('Contrato do modulo');

{
  const { P } = carregar('limpo');

  check('expoe NAV_PRECOS', !!P);
  check('chave de storage com versao', P.KEY === 'pandax.precos.v1');
  check('lista os 5 combustiveis',
    Array.isArray(P.COMBUSTIVEIS) && P.COMBUSTIVEIS.join(',') === 'gc,ga,etanol,diesel,gnv');
  ['normalizar', 'sanitize', 'carregar', 'gravar', 'doPosto', 'efetivo',
   'definir', 'limpar', 'tem'].forEach(function (fn) {
    check('tem a funcao ' + fn, typeof P[fn] === 'function');
  });
  check('carregar vazio devolve objeto', typeof P.carregar() === 'object');
}

/* ------------------------------------------------------------------ */
console.log('\nNormalizacao do valor digitado');

{
  const { P } = carregar('limpo');

  check('numero fica numero', P.normalizar(6.09) === 6.09);
  check('texto com virgula ("6,09")', P.normalizar('6,09') === 6.09);
  check('com simbolo ("R$ 6,49")', P.normalizar('R$ 6,49') === 6.49);
  check('arredonda para 2 casas ("6,099")', P.normalizar('6,099') === 6.10);
  check('vazio vira null', P.normalizar('') === null);
  check('nulo vira null', P.normalizar(null) === null);
  check('texto sem numero vira null', P.normalizar('abc') === null);
  check('zero vira null', P.normalizar(0) === null);
  check('negativo vira null', P.normalizar(-3) === null);
  check('valor absurdo (999) vira null', P.normalizar(999) === null);
}

/* ------------------------------------------------------------------ */
console.log('\nGravar, ler e apagar o preco de um posto');

{
  const { P, ls } = carregar('limpo');

  P.definir(7242, { gc: '6,09', etanol: '4,15', diesel: '' });
  check('guarda so o que tem valor', P.tem(7242) === true);
  check('le de volta a gasolina comum', P.doPosto(7242).gc === 6.09);
  check('le de volta o etanol', P.doPosto(7242).etanol === 4.15);
  check('campo em branco nao entra', P.doPosto(7242).diesel === undefined);
  check('id numerico e o texto batem', P.doPosto('7242').gc === 6.09);
  check('gravou no localStorage',
    Object.prototype.hasOwnProperty.call(ls._dados, P.KEY));

  P.definir(7242, { gc: '6,19' });
  check('editar troca o valor', P.doPosto(7242).gc === 6.19);
  check('editar removeu o que nao foi informado', P.doPosto(7242).etanol === undefined);

  P.definir(7242, {});
  check('salvar vazio apaga a entrada do posto', P.tem(7242) === false);

  P.definir(9001, { gc: 5.5 });
  check('tem() confirma outro posto', P.tem(9001) === true);
  P.limpar(9001);
  check('limpar() apaga o posto', P.tem(9001) === false);
}

/* ------------------------------------------------------------------ */
console.log('\nJuntar com a base embutida (efetivo)');

{
  const { P } = carregar('limpo');

  const base = { gc: 5.89, ga: null, etanol: 3.99, diesel: null, gnv: null };
  const sem = P.efetivo(123, base);
  check('sem usuario, vale a base', sem.gc === 5.89 && sem.etanol === 3.99,
    JSON.stringify(sem));
  check('base nula vira null (nao some)', sem.ga === null && 'ga' in sem, JSON.stringify(sem));

  P.definir(123, { gc: '6,09' });
  const com = P.efetivo(123, base);
  check('usuario tem prioridade sobre a base', com.gc === 6.09);
  check('onde o usuario nao falou, base continua', com.etanol === 3.99);
  check('combustivel sem base e sem usuario fica null', com.gnv === null);

  const soUser = P.efetivo(123, {});
  check('sem base nenhuma ainda devolve os 5 campos', soUser.gc === 6.09 && soUser.ga === null);
}

/* ------------------------------------------------------------------ */
console.log('\nStorage corrompido');

{
  const { P } = carregar('limpo', '{isso nao e json');
  check('JSON quebrado nao lanca', typeof P.carregar() === 'object');
  check('e devolve vazio', Object.keys(P.carregar()).length === 0);

  const { P: P2 } = carregar('limpo', JSON.stringify({
    10: { gc: '6,09', lixo: 1 },
    11: { gc: 'nao e numero' },
    12: 'texto solto',
    13: null
  }));
  const limpo = P2.carregar();
  check('mantem o posto valido', limpo['10'] && limpo['10'].gc === 6.09);
  check('descarta valor invalido', !limpo['11']);
  check('descarta entrada que nao e objeto', !limpo['12'] && !limpo['13']);
  check('so a chave do combustivel valido fica',
    limpo['10'] && limpo['10'].lixo === undefined);
}

/* ------------------------------------------------------------------ */
console.log('\nStorage bloqueado');

{
  const { P } = carregar('bloqueado');

  let sobreviveu = true;
  try {
    P.definir(7242, { gc: '6,09' });
    P.doPosto(7242);
    P.tem(7242);
    P.limpar(7242);
    P.carregar();
  } catch (e) {
    sobreviveu = false;
  }
  check('localStorage bloqueado nao lanca excecao', sobreviveu);
  check('e devolve objeto valido mesmo assim', typeof P.carregar() === 'object');
}

/* ------------------------------------------------------------------ */
console.log('\n' + (falhas === 0
  ? '>>> Tudo passou.'
  : '>>> ' + falhas + ' verificacao(oes) falharam.') + '\n');

process.exit(falhas === 0 ? 0 : 1);
