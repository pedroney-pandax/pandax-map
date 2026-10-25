/* Camada de servicos: geocodificacao, roteamento e normalizacao de manobras.
   Nenhuma UI aqui dentro. */

(function (global) {
  'use strict';

  var CFG = global.NAV_CONFIG;

  /* ------------------------------------------------------------------ *
   * Utilidades
   * ------------------------------------------------------------------ */

  function fetchWithTimeout(url, options, timeoutMs) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 20000);
    options = options || {};
    options.signal = ctrl.signal;
    return fetch(url, options).then(
      function (res) {
        clearTimeout(timer);
        return res;
      },
      function (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          throw new Error('Tempo esgotado ao falar com o servidor.');
        }
        throw err;
      }
    );
  }

  function getJson(url, timeoutMs, extraHeaders) {
    var headers = { 'User-Agent': 'pandax-map/1.0 (app de navegacao)' };
    if (extraHeaders) {
      Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
    }
    return fetchWithTimeout(url, { method: 'GET', headers: headers }, timeoutMs || 20000)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + url);
        return res.json().catch(function () {
          // Nominatim/Overpass respondem HTML quando recusam a requisicao
          // (403 sem User-Agent proprio, por exemplo); nao deixa estourar
          return null;
        });
      });
  }

  function postJson(url, body, timeoutMs) {
    return fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, timeoutMs || 25000)
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (txt) {
            var msg = 'HTTP ' + res.status;
            try {
              var parsed = JSON.parse(txt);
              if (parsed.error) msg += ' - ' + parsed.error;
            } catch (e) { /* resposta nao era JSON */ }
            throw new Error(msg);
          });
        }
        return res.json();
      });
  }

  /* Overpass responde POST form-urlencoded. */
  function postForm(url, fields, timeoutMs) {
    var body = Object.keys(fields).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(fields[k]);
    }).join('&');

    return fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Alguns espelhos do Overpass respondem 403 a requisicoes sem
        // User-Agent proprio (o navegador nao deixa definir esse cabecalho,
        // mas o app tambem roda em Node/testes). Da um nome estavel.
        'User-Agent': 'pandax-map/1.0 (app de navegacao)'
      },
      body: body
    }, timeoutMs || 25000)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + url);
        // Sobrecarga do Overpass vem como HTML de erro, nao JSON. Devolver
        // o texto faz o fallback ver que nao houve resultado e tentar o
        // proximo espelho, em vez de estourar a busca inteira.
        return res.json().catch(function () {
          return res.text().then(function (txt) {
            var m = /<strong[^>]*>Error<\/strong>:\s*([^<]+)/i.exec(txt);
            throw new Error(m ? m[1].trim() : 'HTTP ' + res.status + ' em ' + url);
          });
        });
      });
  }

  /* Varios servidores espelhos rodam o mesmo Overpass. O principal
     (overpass-api.de) vive lotado e responde 502 "at capacity" na maior
     parte das buscas; alguns espelhos param no meio. Em vez de tentar um
     por um (o primeiro podia gastar 9s e ainda falhar, atrasando tudo),
     dispara todos ao mesmo tempo e fica com o primeiro que trouxer dado. */
  function overpassEndpoints() {
    var lista = CFG.overpassUrls && CFG.overpassUrls.length
      ? CFG.overpassUrls.slice()
      : [CFG.overpassUrl];
    return lista.filter(Boolean);
  }

  function postFormComFallback(q, timeoutMs) {
    var eps = overpassEndpoints();
    if (!eps.length) return Promise.resolve(null);

    var melhor = null;   // primeiro resultado nao-vazio que chegou
    var resolver;
    var pendentes = eps.length;

    return new Promise(function (res) {
      resolver = res;

      eps.forEach(function (ep) {
        postForm(ep, { data: q }, timeoutMs).then(function (data) {
          pendentes--;
          var els = data && data.elements;
          if (!melhor && els && els.length) {
            melhor = data;
            resolver(melhor);
          } else if (pendentes === 0) {
            resolver(melhor);
          }
        }, function () {
          pendentes--;
          if (pendentes === 0) resolver(melhor);
        });
      });
    });
  }

  function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');  }

  /* Chave de comparacao para remover duplicata entre as duas bases. */
  function normKey(s) {
    return String(s || '')
      .normalize('NFD')
      // Remove os acentos que o NFD separou (faixa U+0300..U+036F). O
      // range aqui precisa ficar escrito com escape: o arquivo e lido como
      // latin1 em alguns ambientes e um range literal de acento virava
      // "['-?]", que nao tirava acento nenhum e derrubava a busca por nome
      // (o token "edificio" nao casava com "Edifício").
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ------------------------------------------------------------------ *
   * Polyline: Valhalla devolve precisao 6 por padrao
   * ------------------------------------------------------------------ */

function decodePolyline(encoded, precision) {
    if (!encoded) return [];

    var factor = Math.pow(10, precision || 6);
    var coords = [];
    var index = 0;
    var lat = 0;
    var lon = 0;

    while (index < encoded.length) {
      var result = 0;
      var shift = 0;
      var b;

      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);

      result = 0;
      shift = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lon += (result & 1) ? ~(result >> 1) : (result >> 1);

      coords.push([lat / factor, lon / factor]);
    }
    return coords;
  }

  /* O Valhalla nem sempre manda a polyline no topo da trip: quando ha
     alternativas ele a coloca dentro de cada perna. Aqui lemos os dois
     formatos e juntamos as pernas em uma unica geometria. */
  function tripGeometry(trip) {
    var coords = [];

    if (trip.shape) {
      return decodePolyline(trip.shape, 6);
    }

    trip.legs.forEach(function (leg) {
      if (!leg.shape) return;
      var pts = decodePolyline(leg.shape, 6);
      pts.forEach(function (p) {
        var last = coords[coords.length - 1];
        // a perna seguinte comeca no mesmo ponto: evita ponto duplicado
        if (!last || last[0] !== p[0] || last[1] !== p[1]) coords.push(p);
      });
    });

    return coords;
  }

  /* ------------------------------------------------------------------ *
   * Endereco legivel a partir das propriedades do Photon
   * ------------------------------------------------------------------ */

  function joinUnique(parts) {
    var out = [];
    parts.forEach(function (p) {
      if (!p) return;
      p = String(p).trim();
      if (!p) return;
      for (var i = 0; i < out.length; i++) {
        if (out[i].toLowerCase() === p.toLowerCase()) return;
      }
      out.push(p);
    });
    return out.join(', ');
  }

  function photonLabel(props) {
    var street = props.street || '';
    var house = props.housenumber || '';
    var streetFull = street ? street + (house ? ', ' + house : '') : '';

    return joinUnique([
      props.name,
      streetFull,
      props.district,
      props.city || props.county,
      props.state,
      props.country
    ]);
  }

  /* ------------------------------------------------------------------ *
   * Busca de lugares / predios / enderecos
   *
   * A busca e por NOME, nao so por endereco: "brookfield towers" acha o
   * predio cujo nome completo e "Edificio Brookfield Towers - Torre A".
   *
   * Tres bases gratuitas, sem chave:
   *   1) Photon     - autocomplete rapido (indice proprio)
   *   2) Overpass   - OSM cru; pega nome de predio que o Photon nao indexa
   *   3) Nominatim  - outra leitura do OSM, forte em nome proprio
   * A Geoapify continua opcional e por ultimo (chave na engrenagem).
   * ------------------------------------------------------------------ */

  /* Conectivos que nao ajudam a filtrar nome ("Edificio X do Y"). */
  var PALAVRAS_VAZIAS = {
    de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1, o: 1, a: 1, os: 1, as: 1,
    em: 1, no: 1, na: 1, the: 1, of: 1, and: 1
  };

  function tokensBusca(q) {
    return normKey(q).split(' ').filter(function (t) {
      return t.length > 1 && !PALAVRAS_VAZIAS[t];
    });
  }

  /* Termos que so dizem o TIPO do lugar, nao qual lugar e. Servem para o
     ranking, mas nao para filtrar: quem digita "edificio metropolitan" ou
     "predios residenciais" quer os predios cujo nome tem a outra palavra. */
  var TIPOS = {
    edificio: 1, edificios: 1, predio: 1, predios: 1, residencial: 1,
    residenciais: 1, condominio: 1, condominios: 1, torre: 1, torres: 1,
    shopping: 1, centro: 1, complexo: 1, bloco: 1, edificacao: 1
  };

  /* Palavra que de fato identifica o lugar: a mais longa que nao seja so o
     tipo. Se a busca for so o tipo ("residencial"), usa a propria. */
  function tokenSeletivo(tokens) {
    var uteis = tokens.filter(function (t) { return !TIPOS[t]; });
    var base = uteis.length ? uteis : tokens;
    return base.slice().sort(function (a, b) { return b.length - a.length; })[0] || '';
  }

  /* Mesma ideia, mas mantendo o texto todo: "edificio brookfield towers"
     vira "brookfield towers". O Nominatim Casa mal com a palavra de tipo
     grudada no nome ("edificio metropolitan" nao acha, "metropolitan" acha),
     entao a busca limpa e a consulta principal. */
  function termoSemTipo(termo) {
    var partes = String(termo).split(/\s+/).filter(function (p) { return p.length > 1; });
    var uteis = partes.filter(function (p) { return !TIPOS[normKey(p)]; });
    if (!uteis.length) return '';
    return uteis.join(' ');
  }

  /* OSM grava "Lourenco" ou "Lourenço" conforme quem editou: cada vogal vira
     uma classe para o regex casar com e sem acento. */
  var ACENTOS = {
    a: 'a\u00e1\u00e0\u00e2\u00e3\u00e4',
    e: 'e\u00e9\u00e8\u00ea\u00eb',
    i: 'i\u00ed\u00ec\u00ee\u00ef',
    o: 'o\u00f3\u00f2\u00f4\u00f5\u00f6',
    u: 'u\u00fa\u00f9\u00fb\u00fc',
    c: 'c\u00e7',
    n: 'n\u00f1',
    y: 'y\u00ff'
  };

  function regexAcento(token) {
    return String(token).split('').map(function (ch) {
      var grupo = ACENTOS[ch];
      return grupo ? '[' + grupo + ']' : escapeRegex(ch);
    }).join('');
  }

  /* Nome (primeiro pedaco do rotulo) e a parte que identifica o lugar. */
  function nomeDoResultado(r) {
    return String((r && r.label) || '').split(',')[0];
  }

  /* As duas palavras mais longas, em qualquer ordem: "lorenzo office",
     "office lorenzo" e "lorenzo office tower" casam com o mesmo regex. */
  function regexOverpass(tokens) {
    var ordenados = tokens.slice().sort(function (a, b) { return b.length - a.length; });
    var usados = ordenados.slice(0, Math.min(2, ordenados.length));
    var partes = usados.map(regexAcento);
    if (partes.length === 1) return partes[0];
    return '(' + partes[0] + '.*' + partes[1] + '|' + partes[1] + '.*' + partes[0] + ')';
  }

  /* Quem casa pelo nome vem antes de quem casa so pelo endereco. Mantem a
     ordem original entre empates (o sort do JS e estavel). */
  function ordenarResultados(lista, tokens, termo) {
    var alvo = normKey(termo);
    lista.forEach(function (r) {
      var nome = normKey(nomeDoResultado(r));
      var tudo = normKey(r.label);
      var pts = 0;
      tokens.forEach(function (t) {
        if (nome.indexOf(t) >= 0) pts += 3;
        else if (tudo.indexOf(t) >= 0) pts += 1;
      });
      if (nome === alvo) pts += 6;
      else if (alvo && nome.indexOf(alvo) === 0) pts += 3;
      r._pts = pts;
    });
    lista.sort(function (a, b) { return (b._pts || 0) - (a._pts || 0); });
    return lista;
  }

  function searchPlaces(query, limit, opts) {
    if (!query || query.trim().length < 3) return Promise.resolve([]);
    opts = opts || {};

    var termo = query.trim().replace(/\s+/g, ' ');
    var tokens = tokensBusca(termo);
    var lim = limit || 8;
    var notificar = typeof opts.onUpdate === 'function' ? opts.onUpdate : null;

    // Dispara as tres bases ao mesmo tempo. Antes o Overpass e o Nominatim
    // so saiam depois da resposta do Photon: se o Photon estivesse fora do
    // ar, a busca por nome de predio esperava o timeout dele para comecar -
    // e ainda tinha que esperar os outros dois. Em paralelo, o resultado
    // util chega assim que qualquer base responde.
    //
    // O Overpass e o mais fraco dos tres: os espelhos travam ou respondem
    // 502, e ele virou bonus. Photon e Nominatim respondem em <2s e sao
    // eles que fecham a busca; o Overpass so entra se chegar antes do teto.
    var pPhoton = searchPhoton(termo, lim);
    var pOverpass = searchOverpass(termo, 20);
    // O Nominatim nao casa bem com a palavra de tipo grudada no nome:
    // "edificio metropolitan" nao acha nada, "metropolitan" acha. Entao,
    // quando o texto tem palavra de tipo ("edificio", "residencial"...),
    // ele e consultado com o texto limpo E com o texto original.
    var limpo = termoSemTipo(termo);
    var pNominatim = (limpo && limpo !== termo)
      ? Promise.all([searchNominatim(termo, 20), searchNominatim(limpo, 20)]).then(function (duas) {
        var b = (duas[0] || []).slice();
        mergeInto(b, duas[1] || []);
        return b;
      })
      : searchNominatim(termo, 20);

    if (!notificar) {
      // Testes e sugestoes do painel: junta o que responder, mas nao fica
      // preso no Overpass. Um teto de 7s libera a resposta mesmo que um
      // espelho esteja pendurado. O Overpass ainda entra se chegar antes.
      var pronto = Promise.all([pPhoton, pNominatim]).then(function (lista) {
        var b = (lista[0] || []).slice();
        mergeInto(b, lista[1] || []);
        return b;
      });
      var comOverpass = Promise.all([pPhoton, pOverpass, pNominatim]).then(function (lista) {
        var b = (lista[0] || []).slice();
        mergeInto(b, lista[1] || []);
        mergeInto(b, lista[2] || []);
        return b;
      });
      var teto = new Promise(function (res) { setTimeout(function () { res(null); }, 7000); });

      return Promise.race([comOverpass, pronto, teto]).then(function (lista) {
        var base = (lista || []).slice();
        ordenarResultados(base, tokens, termo);
        return comGeoapify(base);
      });
    }

    // Com tela esperando: entrega o Photon/Nominatim assim que chegam (ou em
    // ate 2,5s, para nao travar o autocomplete); o Overpass so enriquece.
    var entregue = false;
    var resultado = [];

    function entrega() {
      if (entregue) return;
      entregue = true;
      ordenarResultados(resultado, tokens, termo);
      notificar(resultado.slice());
    }

    pPhoton.then(function (lista) {
      if (lista && lista.length) {
        mergeInto(resultado, lista);
        entrega();
      }
    });
    pNominatim.then(function (lista) {
      if (lista && lista.length) {
        mergeInto(resultado, lista);
        entrega();
      }
    });
    var prazo = setTimeout(entrega, 2500);

    var restantes = pOverpass.then(function (lista) {
      var tinha = resultado.length;
      mergeInto(resultado, lista || []);
      if (!entregue) {
        clearTimeout(prazo);
        entrega();
        return resultado;
      }
      if (resultado.length !== tinha) notificar(resultado.slice());
      return resultado;
    });

    return restantes.then(function (base) { return comGeoapify(base); });

    function comGeoapify(base) {
      // Terceira base: opcional e por ultimo. Ela entra em dois casos:
      //
      //  1) as bases abertas nao acharam nada;
      //  2) o texto tem digito, ou seja, o usuario quer um endereco
      //     exato. Ex: "Avenida T-7, 371" - o Photon acha a avenida,
      //     mas devolve SEM o numero 371. E o numero que identifica
      //     o predio.
      //
      // Para "Banco do Brasil" (sem digito e ja resolvido) a base paga
      // nem e chamada, para nao gastar cota a toa.
      if (!opts.geoapifyKey) return base;
      var querNumero = /\d/.test(termo);
      if (base.length > 0 && !querNumero) return base;

      return searchGeoapify(termo, opts.geoapifyKey, lim)
        .then(function (extra) {
          mergeInto(base, extra);
          ordenarResultados(base, tokens, termo);
          if (notificar && extra && extra.length) notificar(base.slice());
          return base;
        });
    }
  }

  function searchPhoton(query, limit) {
    var b = CFG.bounds || {};

    var url = CFG.photonUrl +
      '?q=' + encodeURIComponent(query) +
      '&limit=' + (limit || 6) +
      // vies de localizacao: traz resultados de Goiania primeiro
      '&lat=' + CFG.center.lat +
      '&lon=' + CFG.center.lon +
      // e o bbox segura o resultado na regiao metropolitana.
      // Sem isso o Photon casa por palavra solta e devolve "San Lorenzo
      // Post Office" na California ao buscar "Lorenzo Office".
      (b.minLon != null && b.maxLon != null && b.minLat != null && b.maxLat != null
        ? '&bbox=' + [b.minLon, b.minLat, b.maxLon, b.maxLat].join(',')
        : '');

    return getJson(url, 6000).then(function (data) {
      if (!data || !data.features) return [];
      return data.features.map(function (f) {
        var coords = f.geometry && f.geometry.coordinates;
        return {
          lat: coords[1],
          lon: coords[0],
          label: photonLabel(f.properties || {}),
          raw: f.properties || {}
        };
      }).filter(function (r) {
        return typeof r.lat === 'number' && typeof r.lon === 'number';
      });
    }).catch(function () {
      // Photon fora do ar nao pode derrubar a busca: as outras bases seguem
      return [];
    });
  }

  /* Junta resultados sem repetir o mesmo lugar. Duas bases podem devolver o
     mesmo predio com rotulo um pouco diferente (uma com "Edificio", outra
     sem): nome igual + menos de ~50 m de distancia = mesma coisa. */
  function mergeInto(base, extra) {
    var vistos = base.map(function (r) {
      return {
        chave: normKey(r.label),
        nome: normKey(nomeDoResultado(r)),
        lat: r.lat,
        lon: r.lon
      };
    });
    extra.forEach(function (r) {
      var k = normKey(r.label);
      if (!k) return;
      var nome = normKey(nomeDoResultado(r));
      for (var i = 0; i < vistos.length; i++) {
        var v = vistos[i];
        if (v.chave === k) return;
        if (v.nome && v.nome === nome &&
            Math.abs(v.lat - r.lat) < 0.0005 &&
            Math.abs(v.lon - r.lon) < 0.0005) return;
      }
      base.push(r);
      vistos.push({ chave: k, nome: nome, lat: r.lat, lon: r.lon });
    });
    return base;
  }

  /* ------------------------------------------------------------------ *
   * Segunda base gratuita: Overpass (OSM cru)
   * ------------------------------------------------------------------ */

  function overpassLabel(t) {
    var street = t['addr:street'] || '';
    var house = t['addr:housenumber'] || '';
    var streetFull = street
      ? street + (house ? ', ' + house : '')
      : (house ? 'N. ' + house : '');

    return joinUnique([
      t.name,
      streetFull,
      t['addr:suburb'] || t['addr:neighbourhood'],
      t['addr:city'] || t['addr:county'],
      t['addr:state'],
      t['addr:country']
    ]);
  }

  function searchOverpass(query, limit) {
    if (!query || query.trim().length < 3) return Promise.resolve([]);

    var b = CFG.bounds || {};
    if (b.minLat == null || b.maxLat == null ||
        b.minLon == null || b.maxLon == null) return Promise.resolve([]);

    var tokens = tokensBusca(query);
    if (!tokens.length) return Promise.resolve([]);

    // Dois problemas antigos:
    //
    //  1) o regex era o texto inteiro e exato ("Lorenzo Office"): qualquer
    //     acento, ordem ou palavra a mais nao casava;
    //  2) o filtro exigia TODAS as palavras, entao "Edificio Metropolitan"
    //     nao achava "Metropolitan" (o predio tem so esse nome) e
    //     "edificios residenciais" nao achava "Residencial Vila Nova".
    //
    // Agora o regex usa a palavra mais seletiva (a mais longa, ignorando o
    // termo generico "edificio"/"residencial") e o filtro so exige que ESSA
    // palavra apareca. As demais viram pontuacao no ranking (ordenarResultados).
    var seletivo = tokenSeletivo(tokens);
    // O bloco [timeout:25] e relevante: o espelho frances trava com
    // [timeout:15] (responde so com 20+, testado), entao mantem 25.
    var q = '[out:json][timeout:25];(' +
      'nwr["name"~"' + escapeRegex(seletivo) + '",i]' +
      '(' + b.minLat + ',' + b.minLon + ',' + b.maxLat + ',' + b.maxLon + ');' +
      ');out center ' + (limit || 20) + ';';

    return postFormComFallback(q, 6000)
      .then(function (data) {
        var els = (data && data.elements) || [];
        return els.map(function (e) {
          var lat = e.lat != null ? e.lat : (e.center && e.center.lat);
          var lon = e.lon != null ? e.lon : (e.center && e.center.lon);
          return {
            lat: lat,
            lon: lon,
            label: overpassLabel(e.tags || {}),
            raw: e.tags || {}
          };
        }).filter(function (r) {
          if (typeof r.lat !== 'number' || typeof r.lon !== 'number' || !r.label) return false;
          // normKey tira acento e caixa; basta a palavra mais seletiva estar
          // no rotulo. E isso que faz "edificio metropolitan" achar
          // "Metropolitan" e "shopping bougainville" achar o shopping.
          var alvo = normKey(r.label);
          return alvo.indexOf(seletivo) >= 0;
        });
      })
      .catch(function () {
        // fallback nunca pode derrubar a busca principal
        return [];
      });
  }

  /* ------------------------------------------------------------------ *
   * Nominatim: leitura do mesmo OSM com outra ordenacao. Forte em nome
   * proprio de predio/loja/praca. Uso leve: 1 requisicao por segundo,
   * como pede a politica de uso. As chamadas ficam em fila.
   * ------------------------------------------------------------------ */

  var ultimaNominatim = 0;

  function nominatimLabel(x) {
    var a = (x && x.address) || {};
    var rua = a.road || a.pedestrian || a.footway || a.path || a.square || '';
    var numero = a.house_number || '';
    var ruaFull = rua ? rua + (numero ? ', ' + numero : '') : (numero ? 'N. ' + numero : '');

    var rotulo = joinUnique([
      x && x.name,
      ruaFull,
      a.suburb || a.neighbourhood || a.quarter || a.city_district,
      a.city || a.town || a.village,
      a.state
    ]);

    if (!rotulo && x && x.display_name) {
      rotulo = String(x.display_name).split(',').slice(0, 4).join(',');
    }
    return rotulo;
  }

  function searchNominatim(query, limit) {
    if (!query || query.trim().length < 3) return Promise.resolve([]);

    var b = CFG.bounds || {};
    var url = CFG.nominatimSearchUrl +
      '?format=jsonv2&addressdetails=1' +
      '&limit=' + (limit || 20) +
      '&accept-language=pt-BR' +
      '&q=' + encodeURIComponent(query.trim()) +
      (b.minLon != null && b.maxLon != null && b.minLat != null && b.maxLat != null
        ? '&viewbox=' + [b.minLon, b.maxLat, b.maxLon, b.minLat].join(',') + '&bounded=1'
        : '');

    // 1 chamada por segundo, no maximo. A fila garante que um autocomplete
    // rapido nao vire rajada e que a ultima palavra digitada ainda consulte.
    var agora = Date.now();
    var espera = Math.max(0, 1100 - (agora - ultimaNominatim));
    ultimaNominatim = agora + espera;

    return new Promise(function (resolve) {
      setTimeout(function () {
        getJson(url, 9000).then(function (lista) {
          if (!Array.isArray(lista)) return resolve([]);
          resolve(lista.map(function (x) {
            return {
              lat: Number(x.lat),
              lon: Number(x.lon),
              label: nominatimLabel(x),
              raw: x
            };
          }).filter(function (r) {
            return isFinite(r.lat) && isFinite(r.lon) && r.label;
          }));
        }).catch(function () {
          resolve([]);
        });
      }, espera);
    });
  }

  /* ------------------------------------------------------------------ *
   * Terceira base, opcional: Geoapify (3000/dia gratis, uso comercial)
   * ------------------------------------------------------------------ */

  function geoapifyLabel(p) {
    // O v1/geocode costuma devolver o endereco completo ja em "name".
    // Quando devolve so o nome do logradouro, remontamos com as partes.
    var street = p.street || '';
    var house = p.housenumber || '';
    var streetFull = street ? street + (house ? ', ' + house : '') : '';

    return joinUnique([
      p.name,
      streetFull,
      p.district || p.suburb || p.county,
      p.city || p.town,
      p.state,
      p.country_code ? String(p.country_code).toUpperCase() : ''
    ]) || p.formatted || '';
  }

  function searchGeoapify(query, apiKey, limit) {
    if (!apiKey) return Promise.resolve([]);
    if (!query || query.trim().length < 3) return Promise.resolve([]);

    var b = CFG.bounds || {};
    var url = CFG.geoapifyUrl +
      '?text=' + encodeURIComponent(query.trim()) +
      '&apiKey=' + encodeURIComponent(apiKey) +
      // mantem o resultado na regiao metropolitana, como nas bases abertas
      (b.minLon != null && b.maxLon != null && b.minLat != null && b.maxLat != null
        ? '&filter=rect:' + [b.minLon, b.minLat, b.maxLon, b.maxLat].join(',')
        : '') +
      // e o vies de proximidade so desempata, nao restringe
      '&bias=proximity:' + [CFG.center.lon, CFG.center.lat].join(',') +
      '&limit=' + (limit || 8) +
      // NAO mandar format=json aqui: e parametro do v2/places. No
      // v1/geocode ele faz a resposta vir vazia - testado, com e sem
      // limite, com e sem lang.
      '&lang=pt';

    return getJson(url).then(function (data) {
      var fs = (data && data.features) || [];
      return fs.map(function (f) {
        var p = f.properties || {};
        var coords = f.geometry && f.geometry.coordinates;
        return {
          lat: coords[1],
          lon: coords[0],
          label: geoapifyLabel(p),
          raw: p
        };
      }).filter(function (r) {
        return typeof r.lat === 'number' && typeof r.lon === 'number' && r.label;
      });
    }).catch(function () {
      // chave ausente, quota estourada ou rede: nunca derruba a busca
      return [];
    });
  }

  /* ------------------------------------------------------------------ *
   * Reverse geocoding: transforma coordenada em um nome legivel
   * ------------------------------------------------------------------ */

  function reverseGeocode(lat, lon) {
    var url = CFG.nominatimUrl +
      '?format=jsonv2&zoom=18&addressdetails=1' +
      '&lat=' + lat + '&lon=' + lon;

    return getJson(url, 12000).then(function (data) {
      if (data && data.error) throw new Error(data.error);
      var a = (data && data.address) || {};
      // o numero do imovel faz parte do endereco completo. Sem isso o
      // resultado parava em "Avenida T-7, Setor Oeste, Goiania" e o
      // usuario perdia a referencia de onde e o predio.
      var via = a.house_number
        ? (a.road ? a.road + ', N. ' + a.house_number : 'N. ' + a.house_number)
        : a.road;
      return joinUnique([
        via,
        a.suburb || a.neighbourhood,
        a.city || a.town || a.village || a.municipality,
        a.state
      ]) || data.name || (lat.toFixed(5) + ', ' + lon.toFixed(5));
    }).catch(function () {
      // nunca deixe a UI quebrar por causa do reverse
      return 'Minha posicao (' + lat.toFixed(5) + ', ' + lon.toFixed(5) + ')';
    });
  }

  /* Escolhe o setor/bairro a partir do "address" do Nominatim.
   *
   * A ordem vai do mais especifico (bairro/setor) ao mais generico (cidade).
   * O reverse em zoom=14 costuma trazer o setor em "suburb" ("Setor Marista"),
   * mas em alguns pontos so vem a cidade -- e ai aparecia um "Goiania" seco.
   * Aqui a cidade e o ultimo recurso: antes dela entram bairro, vizinhanca,
   * distrito e vilarejo, e o nome do proprio objeto (que costuma ser o setor
   * quando ele nao tem tag de suburb). Pura: da para testar sem rede. */
  function escolherBairro(a) {
    a = a || {};
    var ordem = [
      a.suburb,
      a.neighbourhood,
      a.quarter,
      a.city_district,
      a.hamlet,
      a.village,
      a.town
    ];
    for (var i = 0; i < ordem.length; i++) {
      var v = ordem[i];
      if (v && String(v).trim()) return String(v).trim();
    }
    var cidade = String(a.city || a.municipality || '').trim();
    var nome = String(a.name || '').trim();
    // o nome do objeto so vale quando nao e so a cidade de novo ("Goiania")
    if (nome && nome !== cidade) return nome;
    return cidade || nome || null;
  }

  /* Bairro de uma coordenada, para o aviso "voce esta em Setor Bueno".
   * o reverseGeocode acima usa zoom=18: volta rua e numero do predio, que
   * nao dizem em que bairro o carro esta. zoom=14 e o nivel de bairro do
   * Nominatim. Responde null (sem lanca erro) quando nao acha, para o
   * chamador manter o bairro anterior em vez de apagar a placa. */
  function reverseBairro(lat, lon) {
    var url = CFG.nominatimUrl +
      '?format=jsonv2&zoom=14&addressdetails=1' +
      '&lat=' + lat + '&lon=' + lon;

    return getJson(url, 12000).then(function (data) {
      if (data && data.error) throw new Error(data.error);
      return escolherBairro((data && data.address) || {});
    }).catch(function () {
      return null;
    });
  }

  /* ------------------------------------------------------------------ *
   * Roteamento (Valhalla)
   * ------------------------------------------------------------------ */

  var MANEUVER_ICON = {
    1: '●', 2: '●', 3: '●',                    // kStart*
    4: '⚑', 5: '⚑', 6: '⚑',                    // kDestination*
    7: '↑', 8: '↑',                            // kBecomes, kContinue
    9: '↗',                                    // kSlightRight
    10: '→',                                   // kRight
    11: '↗',                                   // kSharpRight
    12: '↷',                                   // kUturnRight
    13: '↶',                                   // kUturnLeft
    14: '↖',                                   // kSharpLeft
    15: '←',                                   // kLeft
    16: '↙',                                   // kSlightLeft
    17: '↗', 18: '↗', 19: '↖',                 // ramp
    20: '↗', 21: '↖',                          // exit right / left
    22: '↑', 23: '↗', 24: '↖',                 // stay
    25: '↗',                                   // kMerge
    26: '↻', 27: '↻',                          // rotatoria entrar / sair
    28: '⛴', 29: '⛴',                          // balsa
    36: '↗', 37: '↖',                          // kMergeRight / Left
    42: '↗'                                    // kExit
  };

  function maneuverIcon(type) {
    return MANEUVER_ICON[type] || '↑';
  }

  function firstStreet(m) {
    return (m.street_names && m.street_names[0]) ||
           (m.sign && m.sign.exit_branch_elements &&
            m.sign.exit_branch_elements[0] &&
            m.sign.exit_branch_elements[0].text) ||
           '';
  }

  /* Achata as pernas da rota numa lista unica de instrucoes e junta
     pares entrar/sair (rotatoria, balsa) que vem duplicados.

     Unidade: distance e cumulative sao QUILOMETROS, o mesmo padrao de
     route.distanceKm. Quem navega precisa saber disso: a geometria da rota
     e medida em metros, e comparar os dois sem converter faz o aviso de
     manobra cair no lugar errado. Ver js/navegacao.js, prepararRota. */
  function buildSteps(trip) {
    var raw = [];
    trip.legs.forEach(function (leg) {
      (leg.maneuvers || []).forEach(function (m) {
        raw.push(m);
      });
    });

    var steps = [];
    var cumulative = 0;

    for (var i = 0; i < raw.length; i++) {
      var m = raw[i];
      var next = raw[i + 1];
      var isEnter = (m.type === 26 || m.type === 28);
      var isExit = (m.type === 27 || m.type === 29);

      // "entrar na rotatoria" seguido de "sair da rotatoria" -> uma linha so
      if (isEnter && next && (next.type === 27 || next.type === 29)) {
        // o trecho percorrido e a soma das duas manobras
        var trecho = (m.length || 0) + (next.length || 0);
        cumulative += trecho;
        steps.push({
          type: next.type,
          icon: maneuverIcon(next.type),
          instruction: next.instruction,
          street: firstStreet(next),
          distance: trecho,
          cumulative: cumulative,
          time: (m.time || 0) + (next.time || 0),
          roundaboutExit: next.roundabout_exit_count
        });
        i++;
        continue;
      }

      if (isExit) continue; // ja consumido acima, ou orfao

      cumulative += (m.length || 0);
      steps.push({
        type: m.type,
        icon: maneuverIcon(m.type),
        instruction: m.instruction,
        street: firstStreet(m),
        distance: m.length || 0,
        cumulative: cumulative,
        time: m.time || 0,
        roundaboutExit: m.roundabout_exit_count
      });
    }

    return steps;
  }

  /* Endpoint principal de roteamento. */
  function fetchRoutes(origin, destination) {
    if (!origin || !destination) {
      return Promise.reject(new Error('Informe origem e destino.'));
    }
    if (origin.lat === destination.lat && origin.lon === destination.lon) {
      return Promise.reject(new Error('Origem e destino sao o mesmo ponto.'));
    }

    var body = {
      locations: [
        { lat: origin.lat, lon: origin.lon },
        { lat: destination.lat, lon: destination.lon }
      ],
      costing: CFG.costing,
      directions_options: {
        units: 'kilometers',
        language: CFG.language
      },
      alternatives: CFG.alternatives
    };

    return postJson(CFG.valhallaUrl, body).then(function (data) {
      if (data.error) throw new Error(data.error);
      if (data.status_code && data.status_code !== 0) {
        throw new Error(data.status_message || 'Falha no roteamento.');
      }

      var trips = Array.isArray(data.trip) ? data.trip : [data.trip];
      trips = trips.filter(function (t) { return t && t.summary; });

      if (!trips.length) {
        throw new Error('Nenhuma rota encontrada entre esses pontos.');
      }

      return trips.map(function (trip, i) {
        return {
          index: i,
          distanceKm: trip.summary.length,
          durationSec: trip.summary.time,
          hasToll: !!trip.summary.has_toll,
          hasHighway: !!trip.summary.has_highway,
          geometry: tripGeometry(trip),
          steps: buildSteps(trip),
          raw: trip
        };
      }).sort(function (a, b) {
        return a.durationSec - b.durationSec;
      }).map(function (r, i) {
        r.index = i;
        return r;
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Ajuste do ponto na via mais proxima (Valhalla /locate)
   *
   * Tocar no mapa cai em qualquer lugar, muitas vezes no meio de uma
   * quadra onde nao existe via. Sem isso o calculo tenta sair de um
   * ponto inalcancavel. Se o ponto estiver longe demais de qualquer via
   * (area rural, por exemplo) mantemos a coordenada original em vez de
   * pular para uma rua distante.
   * ------------------------------------------------------------------ */

  function haversine(aLat, aLon, bLat, bLon) {
    var R = 6371000;
    var dLat = (bLat - aLat) * Math.PI / 180;
    var dLon = (bLon - aLon) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function snapToRoad(lat, lon) {
    var url = CFG.valhallaUrl.replace(/\/route$/, '/locate');
    var body = {
      locations: [{ lat: lat, lon: lon }],
      costing: CFG.costing
    };

    return postJson(url, body, 12000).then(function (data) {
      var entry = Array.isArray(data) ? data[0] : data;
      var edge = entry && entry.edges && entry.edges[0];
      if (!edge || typeof edge.correlated_lat !== 'number') {
        return { lat: lat, lon: lon, snapped: false };
      }

      var d = haversine(lat, lon, edge.correlated_lat, edge.correlated_lon);
      if (d > CFG.snapMaxMeters) {
        return { lat: lat, lon: lon, snapped: false };
      }
      return {
        lat: edge.correlated_lat,
        lon: edge.correlated_lon,
        snapped: true,
        meters: Math.round(d)
      };
    }).catch(function () {
      // ajuste e um luxo: se falhar, segue com a coordenada original
      return { lat: lat, lon: lon, snapped: false };
    });
  }

    /* ------------------------------------------------------------------ *
   * Sugestao de tarifa da corrida
   * ------------------------------------------------------------------ */

  /* Resolve o perfil de tarifa. Sem argumento, usa o defaultProfile. */
  function fareProfile(id) {
    var f = CFG.fare;
    var key = id || f.defaultProfile;
    return f.profiles[key] || f.profiles[f.defaultProfile];
  }

  function estimateFare(route, options) {
    var f = CFG.fare;
    options = options || {};
    var cfg = fareProfile(options.profile);

    var surge = options.surge || f.surgeOptions[0];
    var km = route.distanceKm;
    var minutes = route.durationSec / 60;

    var distanceCost = km * cfg.perKm;
    var timeCost = minutes * cfg.perMinute;
    var raw = cfg.basePrice + distanceCost + timeCost;

    var trip = Math.max(raw, cfg.minFare);
    var fee = trip * cfg.platformFeePercent / 100;

    // o que sobra para o motorista, e o destino das duas retiradas
    var driver = trip - fee;
    var emergency = driver * (cfg.driverEmergencyPercent / 100);
    var bonus = driver * (cfg.driverBonusPercent / 100);
    var driverNet = driver - emergency - bonus;

    var subtotal = trip + fee;

    return {
      profile: options.profile || f.defaultProfile,
      label: cfg.label,
      km: km,
      minutes: minutes,
      base: cfg.basePrice,
      distanceCost: distanceCost,
      timeCost: timeCost,
      rawTrip: raw,
      trip: trip,
      minApplied: raw < cfg.minFare,
      fee: fee,
      feePercent: cfg.platformFeePercent,
      driver: driver,
      emergency: emergency,
      bonus: bonus,
      driverNet: driverNet,
      surge: surge,
      subtotal: subtotal,
      total: subtotal * surge
    };
  }

  global.NAV_SERVICES = {
    decodePolyline: decodePolyline,
    searchPlaces: searchPlaces,
    searchPhoton: searchPhoton,
    searchOverpass: searchOverpass,
    searchNominatim: searchNominatim,
    searchGeoapify: searchGeoapify,
    reverseGeocode: reverseGeocode,
    reverseBairro: reverseBairro,
    escolherBairro: escolherBairro,
    fetchRoutes: fetchRoutes,
    estimateFare: estimateFare,
    fareProfile: fareProfile,
    snapToRoad: snapToRoad,
    maneuverIcon: maneuverIcon,
    termoSemTipo: termoSemTipo
  };

})(window);