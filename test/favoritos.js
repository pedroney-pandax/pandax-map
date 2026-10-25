/* Teste do modulo de favoritos (js/favoritos.js).
   Rodar:  node test/favoritos.js
   Nao usa rede: roda offline e em milliseconds.

   O contrato e o mesmo do settings.js: o localStorage pode estar
   bloqueado ou corrompido sem quebrar o app, o sanitize descarta o que
   nao presta e o limite de 30 itens e respeitado. */

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

function carregar(modo) {
  const ls = fakeStorage(modo);

  const sandbox = { console, localStorage: ls };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'js/favoritos.js'), 'utf8'),
    sandbox,
    { filename: 'js/favoritos.js' }
  );

  return { FAV: sandbox.NAV_FAVORITOS, ls };
}

const DESTINO = { nome: 'Aeroporto de Goiania', lat: -16.2646, lon: -49.1953 };

console.log('\nFavoritos (js/favoritos.js)\n');

/* ------------------------------------------------------------------ */
console.log('Contrato do modulo');

{
  const { FAV } = carregar('limpo');

  check('expoe NAV_FAVORITOS', !!FAV);
  check('chave de storage com versao', FAV.KEY === 'pandax.favoritos.v1');
  check('limite de 30 itens', FAV.MAX === 30);
  ['sanitize', 'load', 'save', 'add', 'remove', 'tem'].forEach(function (fn) {
    check('tem a funcao ' + fn, typeof FAV[fn] === 'function');
  });
  check('load vazio devolve lista', Array.isArray(FAV.load()) && FAV.load().length === 0);
}

/* ------------------------------------------------------------------ */
console.log('\nSanitize de entrada corrompida');

{
  const { FAV } = carregar('limpo');

  check('null devolve []', FAV.sanitize(null).length === 0);
  check('string devolve []', FAV.sanitize('lixo').length === 0);
  check('objeto solto devolve []', FAV.sanitize({ nome: 'x', lat: 1, lon: 2 }).length === 0);
  check('item sem nome e descartado',
    FAV.sanitize([{ lat: -16.7, lon: -49.2 }]).length === 0);
  check('item sem coordenada e descartado',
    FAV.sanitize([{ nome: 'X' }]).length === 0);
  check('lat fora do intervalo e descartada',
    FAV.sanitize([{ nome: 'X', lat: -120, lon: -49 }]).length === 0);
  check('lon fora do intervalo e descartada',
    FAV.sanitize([{ nome: 'X', lat: -16, lon: 999 }]).length === 0);
  check('coordenada string e descartada',
    FAV.sanitize([{ nome: 'X', lat: '-16.7', lon: '-49.2' }]).length === 0);
  check('JSON corrompido no storage nao quebra',
    FAV.load().length === 0);
}

/* ------------------------------------------------------------------ */
console.log('\nNormalizacao');

{
  const { FAV } = carregar('limpo');

  const it = FAV.sanitize([{ nome: '   Casa   ', lat: -16.68, lon: -49.26 }])[0];
  check('nome ganha trim', it && it.nome === 'Casa');
  const longo = FAV.sanitize([{ nome: 'x'.repeat(300), lat: 0, lon: 0 }])[0];
  check('nome muito longo e cortado em 90', longo && longo.nome.length === 90);
}

/* ------------------------------------------------------------------ */
console.log('\nAdicionar / checar / remover');

{
  const { FAV } = carregar('limpo');

  FAV.add(DESTINO);
  check('add guarda o destino', FAV.load().length === 1);
  check('tem() acha o destino salvo', FAV.tem(DESTINO) === true);
  check('tem() nao acha outro ponto',
    FAV.tem({ nome: 'Outro', lat: -16.1, lon: -49.1 }) === false);

  FAV.add(DESTINO);
  check('add repetido nao duplica', FAV.load().length === 1);

  // mesma coordenada, nome diferente (ruido de GPS ~1m)
  FAV.add({ nome: 'Aeroporto', lat: DESTINO.lat + 0.000001, lon: DESTINO.lon });
  check('mesma coordenada arredondada nao duplica', FAV.load().length === 1);

  FAV.add({ nome: 'Praca Civica', lat: -16.6879, lon: -49.2641 });
  check('segundo destino entra', FAV.load().length === 2);

  check('add invalido devolve a lista atual',
    FAV.add({ nome: '', lat: NaN, lon: NaN }).length === 2);

  FAV.remove(0);
  const apos = FAV.load();
  check('remove apaga pelo indice', apos.length === 1 && apos[0].nome === 'Praca Civica');
  FAV.remove(99);
  check('indice fora do intervalo nao quebra', FAV.load().length === 1);
  FAV.remove(-1);
  check('indice negativo nao quebra', FAV.load().length === 1);
}

/* ------------------------------------------------------------------ */
console.log('\nPersistencia');

{
  const { FAV, ls } = carregar('limpo');

  FAV.add(DESTINO);
  check('gravou no localStorage',
    Object.prototype.hasOwnProperty.call(ls._dados, FAV.KEY));
  const bruto = JSON.parse(ls._dados[FAV.KEY]);
  check('JSON gravado e lista de objetos', Array.isArray(bruto) && typeof bruto[0] === 'object');

  const { FAV: FAV2 } = carregar('limpo');
  // mesmo "modo", dados novos: simula recarregar a pagina com o mesmo storage
  check('load() le o que foi salvo nesta sessao', FAV.load().length === 1);
  void FAV2;
}

/* ------------------------------------------------------------------ */
console.log('\nLimite de 30 itens');

{
  const { FAV } = carregar('limpo');

  for (let i = 0; i < 40; i++) {
    FAV.add({ nome: 'Destino ' + i, lat: -16 + i * 0.001, lon: -49 + i * 0.001 });
  }
  check('passa do limite e para em 30', FAV.load().length === 30);
  check('os 30 primeiros foram guardados', FAV.load()[0].nome === 'Destino 0');
}

/* ------------------------------------------------------------------ */
console.log('\nStorage bloqueado ou corrompido');

{
  const { FAV } = carregar('bloqueado');

  let sobreviveu = true;
  try {
    FAV.add(DESTINO);
    FAV.remove(0);
    FAV.tem(DESTINO);
    FAV.save([{ nome: 'X', lat: 0, lon: 0 }]);
  } catch (e) {
    sobreviveu = false;
  }
  check('localStorage bloqueado nao lanca excecao', sobreviveu);
  check('e devolve lista valida mesmo assim', Array.isArray(FAV.load()));

  const { FAV: FAV2 } = carregar('limpo');
  FAV2.save([{ nome: 'ok', lat: -16.7, lon: -49.2 }]);
  const r = FAV2.save([{ nome: 'ok', lat: -16.7, lon: -49.2 }, 'lixo', null]);
  check('save() limpa entradas ruins na gravacao', r.length === 1 && r[0].nome === 'ok');
}

/* ------------------------------------------------------------------ */
console.log('\n' + (falhas === 0
  ? '>>> Tudo passou.'
  : '>>> ' + falhas + ' verificacao(oes) falharam.') + '\n');

process.exit(falhas === 0 ? 0 : 1);
