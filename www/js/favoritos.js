/* Favoritos: destinos que o usuario escolheu guardar.

   Lista simples de {nome, lat, lon} no localStorage. Vale o mesmo contrato
   do settings.js: localStorage pode estar bloqueado (modo privado, cota
   cheia) ou vindo corrompido -- nada disso pode travar o app. O sanitize
   descarta o que nao presta e mantem o limite de itens. */

(function () {
  'use strict';

  var KEY = 'pandax.favoritos.v1';
  var MAX = 30;

  function normalizeItem(bruto) {
    if (!bruto || typeof bruto !== 'object') return null;

    var nome = typeof bruto.nome === 'string' ? bruto.nome.trim().slice(0, 90) : '';
    var lat = (typeof bruto.lat === 'number') ? bruto.lat : NaN;
    var lon = (typeof bruto.lon === 'number') ? bruto.lon : NaN;

    if (!nome) return null;
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

    return { nome: nome, lat: lat, lon: lon };
  }

  function sanitize(bruto) {
    if (!Array.isArray(bruto)) return [];

    var out = [];
    for (var i = 0; i < bruto.length; i++) {
      var it = normalizeItem(bruto[i]);
      if (it) out.push(it);
      if (out.length >= MAX) break;
    }
    return out;
  }

  function load() {
    var bruto = null;
    try {
      var txt = localStorage.getItem(KEY);
      if (txt) bruto = JSON.parse(txt);
    } catch (e) {
      bruto = null;
    }
    return sanitize(bruto);
  }

  function save(lista) {
    var limpo = sanitize(lista);
    try {
      localStorage.setItem(KEY, JSON.stringify(limpo));
    } catch (e) {
      // sem espaco: os favoritos valem so nesta sessao
    }
    return limpo;
  }

  /* Salva se ainda nao existir (mesmo nome ou mesma coordenada, arredondada
     em 5 casas -- ~1m, suficiente para nao duplicar por ruido de GPS). */
  function add(destino) {
    var it = normalizeItem(destino);
    if (!it) return load();

    var lista = load();
    var chave = it.lat.toFixed(5) + ',' + it.lon.toFixed(5);
    var jaTem = lista.some(function (f) {
      return f.nome === it.nome || (f.lat.toFixed(5) + ',' + f.lon.toFixed(5)) === chave;
    });
    if (jaTem) return lista;

    lista.push(it);
    return save(lista);
  }

  function remove(idx) {
    var lista = load();
    if (idx < 0 || idx >= lista.length) return lista;
    lista.splice(idx, 1);
    return save(lista);
  }

  function tem(destino) {
    var it = normalizeItem(destino);
    if (!it) return false;
    var chave = it.lat.toFixed(5) + ',' + it.lon.toFixed(5);
    return load().some(function (f) {
      return f.nome === it.nome || (f.lat.toFixed(5) + ',' + f.lon.toFixed(5)) === chave;
    });
  }

  window.NAV_FAVORITOS = {
    KEY: KEY,
    MAX: MAX,
    sanitize: sanitize,
    load: load,
    save: save,
    add: add,
    remove: remove,
    tem: tem
  };

})();
