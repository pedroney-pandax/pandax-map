/* Precos dos combustiveis informados (ou corrigidos) pelo usuario.

   A base embutida (data/postos-goiania.json) traz os precos da ANP, mas
   aquele numero pode estar errado ou velho. Ao tocar no posto e escolher
   "Editar precos", o que a pessoa digitar passa a valer no lugar do da base.
   Fica guardado no proprio aparelho (localStorage), no formato

     { "<id do posto>": { gc: 6.09, ga: 6.29, etanol: 4.15, diesel: 6.35 } }

   Combustivel deixado em branco nao e alterado (continua o da base). O
   localStorage pode estar bloqueado (modo privado, cota cheia) ou vindo
   corrompido; nada disso pode derrubar o app, entao tudo passa pelo
   sanitize e a gravacao fica dentro de try/catch.

   Contrato igual ao de settings.js/favoritos.js: o modulo so guarda dados,
   quem desenha a tela e o app.js. */

(function () {
  'use strict';

  var KEY = 'pandax.precos.v1';
  var COMBUSTIVEIS = ['gc', 'ga', 'etanol', 'diesel', 'gnv'];
  var MIN = 0.50;   // faixa plausivel de preco por litro no Brasil
  var MAX = 30;

  /* Aceita number ou texto ("6,09", "R$ 6,09") e devolve number com 2
     casas, ou null quando o valor nao e um preco de verdade. */
  function normalizar(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = (typeof v === 'number') ? v
      : Number(String(v).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.]/g, ''));
    if (!isFinite(n) || n < MIN || n > MAX) return null;
    return Math.round(n * 100) / 100;
  }

  function copiar(o) {
    var out = {};
    for (var i = 0; i < COMBUSTIVEIS.length; i++) {
      var k = COMBUSTIVEIS[i];
      if (o[k] != null) out[k] = o[k];
    }
    return out;
  }

  /* Um registro de posto: mantem so os combustiveis com valor valido.
     Devolve null quando nao sobrou nada (entrada nao serve). */
  function sanitizePosto(bruto) {
    if (!bruto || typeof bruto !== 'object') return null;
    var out = {};
    var tem = false;
    for (var i = 0; i < COMBUSTIVEIS.length; i++) {
      var k = COMBUSTIVEIS[i];
      var v = normalizar(bruto[k]);
      if (v !== null) { out[k] = v; tem = true; }
    }
    return tem ? out : null;
  }

  function sanitize(bruto) {
    var out = {};
    if (!bruto || typeof bruto !== 'object') return out;
    var chaves = Object.keys(bruto);
    for (var i = 0; i < chaves.length; i++) {
      var item = sanitizePosto(bruto[chaves[i]]);
      if (item) out[chaves[i]] = item;
    }
    return out;
  }

  function carregar() {
    var bruto = null;
    try {
      var txt = localStorage.getItem(KEY);
      if (txt) bruto = JSON.parse(txt);
    } catch (e) {
      bruto = null;
    }
    return sanitize(bruto);
  }

  function gravar(tudo) {
    var limpo = sanitize(tudo);
    try {
      localStorage.setItem(KEY, JSON.stringify(limpo));
    } catch (e) {
      // sem espaco: o que foi digitado vale so nesta sessao
    }
    return limpo;
  }

  function chave(id) { return String(id); }

  /* O que a pessoa informou para este posto ({} quando nada). */
  function doPosto(id) {
    var tudo = carregar();
    var item = tudo[chave(id)];
    return item ? copiar(item) : {};
  }

  /* Junta a base embutida com o que o usuario informou: o valor do usuario
     manda; onde ele nao falou nada vale o da base (hoje sempre nulo). */
  function efetivo(id, base) {
    base = base || {};
    var doUser = doPosto(id);
    var out = {};
    for (var i = 0; i < COMBUSTIVEIS.length; i++) {
      var k = COMBUSTIVEIS[i];
      var v = (doUser[k] != null) ? doUser[k] : normalizar(base[k]);
      out[k] = (v != null) ? v : null;
    }
    return out;
  }

  /* Salva o que a pessoa digitou para o posto. Campo em branco apaga o valor
     anterior; se sobrar nada, a entrada do posto e removida. */
  function definir(id, valores) {
    var tudo = carregar();
    var item = sanitizePosto(valores);
    if (item) tudo[chave(id)] = item;
    else delete tudo[chave(id)];
    gravar(tudo);
    return item || {};
  }

  function limpar(id) {
    var tudo = carregar();
    delete tudo[chave(id)];
    gravar(tudo);
  }

  function tem(id) {
    return Object.prototype.hasOwnProperty.call(carregar(), chave(id));
  }

  window.NAV_PRECOS = {
    KEY: KEY,
    COMBUSTIVEIS: COMBUSTIVEIS,
    MIN: MIN,
    MAX: MAX,
    normalizar: normalizar,
    sanitize: sanitize,
    carregar: carregar,
    gravar: gravar,
    doPosto: doPosto,
    efetivo: efetivo,
    definir: definir,
    limpar: limpar,
    tem: tem
  };

})();
