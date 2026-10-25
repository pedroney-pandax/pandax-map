/* Pontos de configuracao do prototipo. Tudo que muda de ambiente fica aqui. */

window.NAV_CONFIG = {

  appName: 'Pandax - MAP',

  // Centro de referencia: Praca Civica, Setor Central, Goiania/GO
  center: { lat: -16.6869, lon: -49.2558 },
  defaultZoom: 13,

  // Limites aproximados da regiao metropolitana (para limitar a busca)
  bounds: {
    minLat: -17.35, maxLat: -16.05,
    minLon: -49.65, maxLon: -48.75
  },

  // Provedores de mapa testados um a um (setembro/2026) comparando o mesmo
  // zoom em 4 cidades: se o arquivo vier identico nas 4, e tile de bloqueio.
  //
  //  tile.openstreetmap.org  -> 6987b IGUAL nas 4 cidades: bloqueia este IP
  //  basemaps.cartocdn.com   -> 2049b IGUAL nas 4 cidades: exige API key
  //                             (a marca d'agua "API KEY REQUIRED")
  //
  // Os de baixo servem mapa de verdade (14-48 KB, arquivo proprio por local).
  basemaps: {
    'Rua': {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
      maxZoom: 19
    },
    'Claro (navegacao)': {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
      maxZoom: 19
    },
    'Topografico': {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
      maxZoom: 19
    },
    'Satelite': {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri, Maxar, Earthstar Geographics',
      maxZoom: 19
    },
    'OSM (instancia da Alemanha)': {
      url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap',
      maxZoom: 18
    }
  },

  // Roteamento: Valhalla (FOSSGIS, grafico do planeta, cobre Goiania)
  valhallaUrl: 'https://valhalla1.openstreetmap.de/route',
  costing: 'auto',              // auto | bicycle | pedestrian | truck
  alternatives: 3,
  language: 'pt-BR',

  // Ao escolher um ponto no mapa, ajusta na via mais proxima, mas so se
  // ela estiver a menos de N metros. Acima disso mantem o ponto original.
  snapMaxMeters: 250,

  // Navegacao: zoom da aproximacao ao entrar na rota e quantos pixels o
  // carro fica abaixo do meio da tela (mostra mais estrada a frente).
  // A engrenagem reescreve os dois; aqui esta o padrao.
  navZoom: 18,
  navOffsetY: 0,

  // ATENCAO: o servidor demo do FOSSGIS ignora "alternatives" e sempre
  // devolve uma rota so. Com Valhalla self-hosted as alternativas passam
  // a funcionar, e a interface passa a mostrar a lista de opcoes.
  // Trocar valhallaUrl pelo seu proprio Valhalla ja resolve.

  // Busca de enderecos / lugares: Photon (feito para autocomplete)
  photonUrl: 'https://photon.komoot.io/api/',
  // Segunda base, gratuita e sem chave: le o OSM cru. O Photon usa indice
  // proprio e nao expoe tudo que existe na base - tipicamente prdio com
  // addr:housenumber. So entra em acao quando o Photon volta curto.
  //
  // Vários espelhos rodam o mesmo Overpass. O principal vive lotado e
  // responde 502 "at capacity" na maioria das buscas; por isso a lista
  // tem varias opcoes e o app tenta uma por uma ate achar dado.
  overpassUrl: 'https://overpass-api.de/api/interpreter',
  overpassUrls: [
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ],
  // Terceira base, opcional. Plano gratuito: 3000 requisicoes/dia, sem cartao
  // e liberado para uso comercial. Traz base de POI bem mais densa que o OSM
  // em cidade brasileira - e o OSM esta comprovadamente vazio de predios em
  // boa parte de Goiania. A chave fica na engrenagem, nao no codigo.
  // Endpoint v1/geocode e o de TEXTO: ele entende endereco e nome de lugar.
  // O v2/places e por CATEGORIA e ignora o que o usuario digitou - testado.
  geoapifyUrl: 'https://api.geoapify.com/v1/geocode/search',

  // Reverse geocoding (usado para nomear o ponto quando vem do GPS)
  nominatimUrl: 'https://nominatim.openstreetmap.org/reverse',
  // Busca por texto livre (nome de predio, loja, praca). Mesma base do OSM,
  // mas com indice e ordenacao proprios: pega nome que o Photon nao devolve.
  // Entra quando as outras bases voltam curtas. Uso leve (1 req/s).
  nominatimSearchUrl: 'https://nominatim.openstreetmap.org/search',

  searchDebounceMs: 320,

  // Rotulos de pontos de interesse usados para montar o endereco legivel
  // na ordem em que aparecem no resultado do Photon.
  addressKeys: [
    'name', 'street', 'housenumber', 'district',
    'city', 'county', 'state', 'country'
  ],

/* Sugestao de preco da corrida, sempre em Real (BRL, pt-BR).

     MODELO DIRETO: nao existe intermediario. Quem pede e quem dirige
     negociam direto, entao a taxa de intermediador e ZERO e o motorista
     fica com 100% do valor.

        corrida = base + km x perKm + min x perMinute
        corrida = max(corrida, minFare)
        taxa    = corrida x platformFeePercent / 100     <- hoje 0%
        total   = (corrida + taxa) x bandeira

     platformFeePercent, driverEmergencyPercent e driverBonusPercent estao
     em 0 de proposito -- e o diferencial do produto, nao um esquecimento.
     Os campos continuam no config porque, quando houver intermediario de
     verdade, e so mexer aqui (ou no perfil) e a interface se ajusta sozinha.

     SEM TRANSITO EM TEMPO REAL: o tempo e o de via livre, entao em horario
     de pico o valor fica otimista.

     ATENCAO sobre os numeros da Uber:
     a Uber NAO publica tabela de tarifa por cidade. O preco e calculado
     no servidor a cada corrida e muda por cidade, horario, demanda e
     promocao. Nao existe valor oficial fixo de "R$ X por km" em Goiania.

     Os valores do perfil "ubex" sao a melhor aproximacao disponivel
     (faixas de mercado publicadas + o modelo do projeto BSBgo!, que foi
     desenhado em cima da estrutura da Uber). Trate como REFERENCIA, nao
     como tabela oficial. Para bater certo com a Uber de verdade, leia 2 ou
     3 precos reais de corridas em Goiania e recalibre o perfil -- o
     metodo esta no README.md, secao "Calibrar com a Uber de verdade".

     Comparacao util para o pitch: a 5 km / 20 min, o modelo direto cobra
     R$ 14,20. Com os 20% de intermediario da Uber seriam R$ 17,04 -- ou
     seja, R$ 2,84 a menos, que vai inteiro para o motorista.
   */
  fare: {
    currency: 'BRL',
    locale: 'pt-BR',
    defaultProfile: 'direto',

    // Multiplicador de demanda (aplicado em cima do subtotal)
    surgeOptions: [1.0, 1.2, 1.4, 1.6],

    profiles: {
      // Tabela principal: corrida direta, sem intermediario.
      direto: {
        label: 'Direto (sem intermediario)',
        note: 'motorista recebe 100%',
        basePrice: 2.00,
        perKm: 1.40,
        perMinute: 0.26,
        minFare: 6.50,
        platformFeePercent: 0,
        driverEmergencyPercent: 0,
        driverBonusPercent: 0
      },

      // Referencia do mercado, so para comparar preco: estes NAO sao o
      // preco do produto, sao o preco de mercado que o direto tenta bater.
      // A taxa de 20% existe aqui so para a comparacao aparecer na tela.
      mercado: {
        label: 'Mercado (com intermediario)',
        note: 'referencia para comparacao',
        basePrice: 2.00,
        perKm: 1.40,
        perMinute: 0.26,
        minFare: 6.50,
        platformFeePercent: 20,
        driverEmergencyPercent: 1,
        driverBonusPercent: 4
      },

      // Tabela fechada do pitch BSBgo!, ja sem intermediario.
      bsbg: {
        label: 'BSBgo! (proposta)',
        note: 'tabela fechada do pitch',
        basePrice: 2.00,
        perKm: 1.40,
        perMinute: 0.26,
        minFare: 6.50,
        platformFeePercent: 0,
        driverEmergencyPercent: 0,
        driverBonusPercent: 0
      }
    }
  }
};