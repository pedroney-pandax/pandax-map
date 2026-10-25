/* Fluxo de atualizacao da base, simulado em Node.
 *
 * Nao ha aparelho Android neste ambiente para testar o download real; o que
 * da para testar e toda a logica em js/atualizacao.js: detectar versao nova
 * na base, montar o card, e chamar o plugin nativo com o endereco certo do
 * pacote. O plugin em si (NavGuidePlugin.atualizarBase) exige aparelho.
 *
 * Para isso o Node finge ser um navegador: document vira stubs, fetch vira
 * um servidor fake com version.json local e remoto, e window.Capacitor vira
 * o plugin registrado.
 */

'use strict';

const fs = require('fs');
const path = require('path');

let falhas = 0;
function check(nome, ok, detalhe) {
  console.log('  OK    ' + nome + (detalhe ? '\n       -> ' + detalhe : ''));
  if (!ok) falhas += 1;
}

/* ------------------------------------------------------------------ *
 * Stubs do navegador
 * ------------------------------------------------------------------ */

function criarElemento(id) {
  let removidos = new Set();
  return {
    id,
    textContent: '',
    value: '',
    disabled: false,
    classList: {
      add() {},
      remove(c) { removidos.add(c); },
      toggle(c, forcar) {
        if (forcar === true) removidos.delete(c);
        else if (forcar === false) removidos.add(c);
      }
    },
    removidos, // exposicao para os testes
    addEventListener(t, fn) { this['on' + t] = fn; }
  };
}

const elementos = {};
function getElementById(id) {
  if (!elementos[id]) {
    elementos[id] = criarElemento(id);
    elementos[id].classList.add('hidden'); // tudo comeca escondido
  }
  return elementos[id];
}

const storage = { 'pandax.base': 'http://192.168.0.10:8080' };
const localStorageStub = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem(k, v) { storage[k] = String(v); },
  removeItem(k) { delete storage[k]; }
};

const chamadasFetch = [];
const chamadasUpdate = [];
function fetchStub(url) {
  const u = String(url);
  chamadasFetch.push(u);
  if (!/^https?:/.test(u)) {
    // version.json EMBUTIDO (instalado no APK)
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '1.0.0', hash: 'aaaa' }) });
  }
  if (/\/www\/version\.json$/.test(u)) {
    // base publicada: mais nova que a instalada
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '1.1.0', hash: 'bbbb' }) });
  }
  return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
}

let documentStub = { readyState: 'complete' };
documentStub.getElementById = getElementById;

const windowStub = {
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: {
      NavGuide: {
        atualizarBase(opcoes) {
          chamadasUpdate.push(opcoes);
          return Promise.resolve();
        }
      }
    }
  }
};

/* Esse texto nao pode aparecer no nome dos testes: sanitiza o console. */
const consoleLog = console.log;
console.log = function () { };

global.document = documentStub;
global.window = windowStub;
global.fetch = fetchStub;
global.localStorage = localStorageStub;

require(path.join(__dirname, '..', 'js', 'atualizacao.js'));

console.log = consoleLog;

/* ------------------------------------------------------------------ *
 * Espera o fluxo assincrono e confere
 * ------------------------------------------------------------------ */

setTimeout(function () {
  console.log('\nFluxo de atualizacao da base (test/atualizacao.js)\n');

  check('detectou a base publicada (www/version.json)',
    chamadasFetch.some((u) => /\/www\/version\.json$/.test(u)),
    chamadasFetch.join(' | '));
  check('leu o version.json embutido para comparar',
    chamadasFetch.some((u) => /version\.json$/.test(u) && !/^https?:/.test(u)));

  const msg = getElementById('update-msg').textContent;
  check('anunciou a versao nova no card',
    /Nova versao 1\.1\.0/.test(msg), msg);
  check('mostrou os botoes de acao',
    getElementById('update-acoes').removidos.has('hidden'), 'hidden na classe');

  // Clica em "Atualizar agora".
  getElementById('update-fazer').onclick();

  setTimeout(function () {
    check('chamou o plugin nativo com o pacote certo',
      chamadasUpdate.length === 1 &&
      chamadasUpdate[0].url === 'http://192.168.0.10:8080/dist/pandax-map-www.zip' &&
      chamadasUpdate[0].versao === '1.1.0',
      JSON.stringify(chamadasUpdate[0]));

    check('depois de atualizar, anuncia a versao aplicada',
      /Atualizado para a versao 1\.1\.0/.test(getElementById('update-msg').textContent),
      getElementById('update-msg').textContent);

    console.log('\n' + (falhas === 0 ? '>>> Tudo passou.' : '>>> ' + falhas + ' FALHA(S).') + '\n');
    process.exit(falhas === 0 ? 0 : 1);
  }, 60);
}, 80);