# Pandax - MAP

Protótipo de mapa, cálculo de trajetos e estimativa de tarifa. Feito com referência em **Goiânia/GO**.

Escolha a origem e o destino de três formas: digitando o nome do lugar,
clicando no mapa, ou usando a sua localização atual pelo GPS.

## Como rodar

```bash
cd pandax-map
npm start
```

Depois abra <http://localhost:8080>.

Rode pelo servidor (e não abrindo o `index.html` direto) porque o navegador
só libera a geolocalização em `localhost` ou `https`. O servidor imprime
também um endereço de rede para abrir no celular, na mesma Wi-Fi.

## App Android (empacotado nativo)

O mesmo código web também vira aplicativo de verdade, instalado pelo
Play ou por APK. Não é PWA: é um app empacotado com Capacitor, que abre
sem barra de navegador e sem depender de servidor na internet.

```bash
npm run android:apk
```

Esse comando faz tudo: monta o `www/`, sincroniza no projeto Android,
compila e deixa o APK pronto em **`dist/pandax-map-debug.apk`**.

Instalar no aparelho:

```bash
adb install -r dist\pandax-map-debug.apk
```

Ou copie o arquivo para o celular e abra lá. O Android vai pedir para
permitir instalação de fontes desconhecidas — é normal para APK que não
veio da Play Store.

### O que precisa estar instalado na máquina

| Ferramenta | Versão | Para quê |
|---|---|---|
| Node.js | 18 ou mais | rodar o projeto (testado no 24) |
| JDK | **21** | compilar o Android (o 17 não serve) |
| Android SDK | platform 36 + build-tools | `compileSdk`/`targetSdk` 36, `minSdk` 24 |

O SDK fica em `%LOCALAPPDATA%\Android\Sdk` por padrão, e o `JAVA_HOME`
aponta para o JDK 21. Se `gradlew` reclamar de `invalid source release`,
o `JAVA_HOME` está apontando para o JDK errado — é o erro mais comum aqui.

### O que muda dentro do app

A navegação por GPS é o motivo de existir um build nativo. No navegador,
o `watchPosition` é cortado quando a aba vai para segundo plano, e a voz
por `speechSynthesis` é inconsistente entre aparelhos. Dentro do app:

- o GPS vem de um **foreground service** (`NavService`), com notificação
  persistente e wake lock, então **continua funcionando com a tela apagada**;
- a voz sai do **TextToSpeech do sistema**, em pt-BR;
- o destino pode ser entregue ao **GPS do próprio aparelho** por `geo:`,
  que abre Google Maps, Waze ou o que o usuário tiver como padrão.

Toda a lógica de navegação está em `js/navegacao.js`, e lá dentro tem um
único wrapper que escolhe entre o plugin nativo e a API do navegador. O
`js/app.js` não sabe a diferença. No navegador continua funcionando tudo,
com as limitações de tela acesa citadas acima.

Ao abrir a rota, o app pergunta se você quer **navegar no Pandax** ou
**passar para o GPS do aparelho**. Dá para voltar para o mapa a qualquer
momento, e o desvio de rota dispara o recálculo sozinho.

### Atualização da base pelo próprio app

O APK abre com o conteúdo embutido, mas ele consegue se atualizar sozinho
para ficar igual à web — sem reinstalar nada. Neste teste a base é o
`server.js` rodando no PC; depois é só publicar o mesmo projeto num
servidor (https) e informar o endereço no app.

Como funciona:

1. Node boot, o app consulta `{base}/www/version.json` e compara com o
   `version.json` embutido (número de versão **e** hash do conteúdo —
   esqueceu de subir a versão, o hash acusa mesmo assim).
2. Versões diferentes → card **"Nova versão disponível"** com
   **[Atualizar agora] [Agora não]**. Sem base definida ainda, o card
   pede o endereço uma vez (fica salvo).
3. **[Atualizar agora]** baixa `{base}/dist/pandax-map-www.zip`, extrai
   nos arquivos internos do aparelho e recarrega o app servido dali. Os
   plugins nativos (GPS/TTS) seguem funcionando: a origem continua sendo
   a local do Capacitor.
4. Próxima abertura: versões iguais, nada aparece. O app continua de
   histórico/mapa igual à web base.

Publicar uma versão nova:

```bash
npm run publicar        # regenera www/ com version.json e o zip em dist/
npm run android:apk     # opcional: APK novo com o conteúdo embutido atualizado
```

Para o app achar a base no teste de PC, informe no card o endereço que o
`server.js` imprime ao iniciar (a linha **Celular**, com o IP da sua máquina,
ex.: `http://192.168.0.10:8080`). O aparelho precisa estar na mesma rede
Wi-Fi, e o build libera HTTP simples (`usesCleartextTraffic`) para isso.

O que **não** é atualizado: o APK em si e o código nativo (`NavGuidePlugin`,
`NavService`). Feature nativa nova continua exigindo um APK novo na mão.

## Como usar

- **Origem** — digite um lugar, use o botão de GPS, ou clique em `◎` e depois no mapa.
- **Destino** — do mesmo jeito.
- Os marcadores **A** e **B** podem ser arrastados para ajuste fino.
- O botão `⇅` inverte origem e destino.
- A lista de instruções mostra cada manobra com ícone, rua e distância.

## Engrenagem (configurações)

A engrenagem `⚙` fica no **canto superior esquerdo**, ao lado do logo. Ela abre
um painel com três blocos:

**Recursos** — o que ligar e desligar:

| Interruptor | O que faz |
|---|---|
| Mostrar estimativa de tarifa | acrescenta o detalhamento em Real no resultado |
| Mostrar lista de instruções | esconde/deixa visível o passo a passo |
| Calcular a rota sozinho | sem ele, só calcula quando você aperta o botão |
| Ajustar o ponto na rua mais próxima | evita que o trajeto saia para uma rua paralela |

**Tabela de tarifa** — escolhe entre Direto, Mercado, BSBgo! ou **Personalizada**.
Escolhendo Personalizada abre o editor com partida, por km, por minuto, tarifa
mínima, taxa de intermediador, reserva e bônus, mais o nome da tabela. Tem um
teste ao vivo que mostra o quanto fica na rota atual (ou em 5 km / 20 min se
ainda não houver rota).

**Bandeira e Rota** — multiplicadores de demanda e número de alternativas.

Tudo é gravado no `localStorage` e vale nas próximas visitas. **Restaurar
padrões** volta tudo ao original.

O botão **Sugerir tarifa** no painel principal e o interruptor na engrenagem
são o mesmo recurso: ligar em qualquer um dos dois liga nos dois.

## Sugestão de tarifa (em Real)

O botão **Sugerir tarifa** mostra quanto custaria a rota. Todos os valores saem
em Real brasileiro, formatados como `R$ 1.234,50` (via `Intl`, locale `pt-BR`).

A conta de cada tabela é:

```
corrida = partida + km × porKm + minutos × porMinuto
corrida = max(corrida, tarifa mínima)
total = (corrida + taxa de intermediador) × bandeira
```

O detalhamento aparece linha por linha (partida, quilometragem, tempo, piso
mínimo, bandeira) e mostra também quanto sobra para o motorista.

### Modelo direto: zero taxa de intermediador

**Não existe intermediário.** Quem pede e quem dirige negociam direto, então a
taxa é **0%** e o motorista fica com **100%** do valor — sem taxa de plataforma,
sem reserva e sem bônus retido.

Isso aparece na tela como uma linha explícita, e não como linha em branco:

```
Partida                      R$   2,00
5,00 km × R$ 1,40            R$   7,00
20 min × R$ 0,26             R$   5,20
Corrida                      R$  14,20
Intermediario                R$   0,00  direto, sem taxa
Total                        R$  14,20
Motorista recebe 100%        R$  14,20
```

Os campos `platformFeePercent`, `driverEmergencyPercent` e
`driverBonusPercent` estão em `0` **de propósito** — é o diferencial do
produto, não esquecimento. Quando houver intermediador de verdade, é só mexer
nesses campos e a interface se ajusta sozinha.

### Tabelas disponíveis

Você pode trocar a tabela em `js/config.js`, em `fare.profiles`:

| Perfil | Partida | Por km | Por min | Mínimo | Intermediador | Motorista |
|---|---|---|---|---|---|---|
| **Direto** (padrão) | R$ 2,00 | R$ 1,40 | R$ 0,26 | R$ 6,50 | **0%** | **100%** |
| Mercado (comparação) | R$ 2,00 | R$ 1,40 | R$ 0,26 | R$ 6,50 | 20% | 75% |
| BSBgo! (proposta) | R$ 2,00 | R$ 1,40 | R$ 0,26 | R$ 6,50 | **0%** | **100%** |

O perfil **Mercado** existe só para comparação — não é o preço do produto, é o
preço de mercado que o direto tenta bater. Numa rota de 5 km / 20 min:

- Direto: **R$ 14,20**
- Com 20% de intermediador: R$ 17,04
- Diferença: **R$ 2,84 a menos**, que vai inteiro para o motorista

Esse cálculo é automático: basta trocar a tabela na tela e os dois valores
aparecem lado a lado.

### Atenção: a Uber não publica tabela de tarifa

Não existe valor oficial e fixo de "R$ X por km" da Uber em Goiânia. O preço é
calculado no servidor a cada corrida e muda por cidade, horário do dia, demanda
e promoções. A página oficial de estimativa (`uber.com/price-estimate`) é
renderizada no navegador e não expõe nenhum valor no código-fonte — foi verificado.

Por isso o perfil **Mercado** é referência, não tabela oficial. E é exatamente
por isso que número de concorrente não deve entrar num pitch sem fonte: um
"R$ 1,40/km da Uber" sem observação de origem não se sustenta se o investidor
perguntar de onde saiu.

### Calibrar com a Uber de verdade

O jeito confiável de casar com o preço real é usar corridas que você mesmo fez:

1. Abra o app e anote 3 corridas em Goiânia, sempre UberX, sempre na bandeira
   normal, sempre no mesmo dia da semana para não misturar horário de pico.
2. Para cada uma, pegue `km` e `min` que o **este** app mostrou.
3. Some as três: se o preço médio do app ficou `X` reais acima/debaixo do que a
   Uber cobrou, ajuste `perKm` (e não a base) até fechar.

Para isolar só o quilômetro, escolha corridas longas e com pouco trânsito:
assim o peso de `perKm` domina e o de `perMinute` quase some. Depois teste uma
corrida curta e ajuste `perMinute` pelo que sobrar.

Com 2 ou 3 pares `(km, min, preço)` você resolve o sistema e chega numa tabela
que bate com a Uber de verdade na sua região — que vale muito mais do que um
número copiado da internet.

**Lembre que aqui o tempo é o de via livre.** Se a Uber inclui o trânsito real e
você não, os valores vão divergir em horário de pico. Para comparar juste,
sempre compare com corridas em horário de movimento normal.

## Busca: lugares, endereços e nomes

O campo de busca aceita nome de lugar, nome de rua, bairro, número ou
endereço completo.

### Duas bases gratuitas, sem chave e sem custo

A busca consulta as fontes abertas nessa ordem, e só desce para a próxima
quando a anterior não resolve:

1. **Photon** (`photon.komoot.io`) — índice próprio do OSM, rápido, bom para
   nome de lugar e logradouro.
2. **Overpass** (`overpass-api.de`) — lê o **OSM cru**. Só entra em ação quando
   o Photon volta vazio ou com menos de 4 resultados, então não custa nada no
   caso comum.

A segunda base existe porque o Photon **não expõe tudo** que está no OSM. O
exemplo real, na Avenida T-7, Setor Oeste:

```
Photon  "Saga Moto Yamaha"  ->  traz o nome, sem o número
Overpass "Saga Moto Yamaha" ->  Saga Moto Yamaha - Oficina T-7,
                                Avenida T-7, 408, Setor Oeste
```

O `408` só existe na base crua. Para prédio, essa diferença é o endereço.

Resultados ficam travados na região metropolitana (`bbox`). Sem isso o Photon
casa palavra solta e devolve *"San Lorenzo Post Office"* na California quando
você busca "Lorenco Office".

### Terceira base, opcional e também gratuita: Geoapify

O OSM está **comprovadamente vazio** de prédios em Goiânia. Consultando
`way["building"]` num raio de 120 m da Av. T-7, Setor Oeste, a resposta é
**zero buildings**. Sem pegada de prédio, não há nome, número nem forma para a
busca recuperar — nenhuma esperteza de código ressuscita dado que não foi
publicado.

Por isso a busca aceita uma **chave da Geoapify**, colada na engrenagem em
*Busca de lugares*:

- plano gratuito: **3.000 requisições por dia**;
- **não pede cartão de crédito**;
- a documentação permite explicitamente uso **comercial e em produção**;
- exige atribuição ao OpenStreetMap e à Geoapify.

Ela entra **por último**, em dois casos: quando as bases abertas não acharam
nada, ou quando o texto digitado tem **dígito** — ou seja, quando a pessoa quer
um endereço exato. Para `Banco do Brasil` (sem dígito e já resolvido pelo
Photon) a base paga nem é chamada, para não gastar cota à toa.

Sem chave, o app se comporta exatamente como antes. A chave fica só no
`localStorage` deste navegador e nunca é versionada no código.

**Endpoint: `v1/geocode/search`.** O `v2/places` é organizado por *categoria* e
ignora o que a pessoa digitou — chegar a ele devolveu hotel em vez do prédio
pedido. E **não mande `format=json`**: esse parâmetro é do v2 e no v1 faz a
resposta vir vazia. Ambos foram testados nesta base.

### O que a Geoapify resolve de fato (medido, não estimado)

O **endereço** com número ela resolve. O **nome do prédio**, não:

| Busca na Geoapify | Resultado |
|---|---|
| `Avenida T-7, 371, Setor Oeste, Goiânia` | **`Avenida T-7, 371`** — coordinate `-16.68951,-49.27489` |
| `Edifício Lourenço Office, Goiânia` | não está; devolve Montreal Office, Brookfield Towers |
| `Lourenço Office` | não está; devolve Rua São Lourenço, Senador Office |

Ou seja: existe `371` na base dela, **não existe "Lourenço Office"**. Nenhuma
base gratuita — nem paga — tem esse nome.

O que a cascata entrega na prática, para a busca acima:

```
 1-6. Avenida T-7, Setor Oeste/Bueno, Goiania   (Photon + Overpass)
 7.   Avenida T-7, 371, Setor Bueno, Goiania   <- o numero que identifica o predio
 8-9. Avenida T-7, Setor Oeste, Goiania        (Geoapify)
```

### O caso "Edifício Lourenço Office": o nome não existe em base nenhuma

Procurei em **todas** as bases, de 6 formas (nome completo, parcial, com e sem
acento, com e sem cidade):

| Onde | `Edifício Lourenço Office` |
|---|---|
| Photon | 0 resultado |
| Overpass (OSM cru) | 0 resultado |
| Nominatim | 0 resultado |
| Wikidata | 0 resultado |
| Geoapify | 0 resultado |

Uma consulta ampla confirma: existem 13 coisas com "Louren" mapeadas em Goiânia
(escola, ruas, parque) — **nenhuma é esse prédio**.

O que existe é o **endereço**: `Av. T-7, 371, Setor Oeste/Bueno, Goiânia`. O
número `371` aparece na Geoapify; no OSM puro não aparece, porque o OSM não tem
interpolação de número nessa avenida (o reverse devolve "sem número" na maior
parte dos pontos).

Para o dia a dia isso basta: **digite o endereço, não o nome.** Para o prédio
passar a ser encontrado pelo nome, o nome tem de ser publicado em algum lugar —
hoje não está em lugar nenhum.

### Sobre a ViaCEP (testada, não serve como base de busca)

A ViaCEP é gratuita e aceita CORS, o que a tornava candidata natural. Mas o
endpoint de busca por logradouro (`/busca/{rua}/{uf}/{cidade}`) responde
**HTTP 404**, e a consulta por CEP não tem nada de nome de lugar. Ela resolve
endereço por CEP, não nome de prédio — por isso não entrou na busca.

### Regras que a busca segue

- mínimo de 3 caracteres;
- resultado sempre dentro da região metropolitana;
- Overpass só roda quando o Photon falha, para não pesar;
- a base paga só roda depois das gratuitas, quando falta resultado **ou** o
  texto tem número, e só se houver chave;
- lugar que não existe nas bases devolve **zero**, sem inventar resultado;
- geocoders sempre devolvem "os mais parecidos" em vez de nada. É por isso que
  o `bbox` existe: sem ele, `Lorenco Office` trazia uma agência dos EUA.

## Ajuste na via

Um clique no mapa cai em qualquer lugar, quase sempre no meio de uma quadra
sem via. Antes de calcular, cada ponto é ajustado para a rua mais próxima
(endpoint `/locate` do Valhalla) — no centro de Goiânia o ajuste típico é de
20 a 30 m. Se não houver via próxima (área rural, por exemplo) o ponto
original é mantido, em vez de o trajeto saltar para uma rua distante.

O mesmo ajuste é aplicado na localização do GPS, porque erro de GPS de 50 m
pode te colocar no lado errado de uma pista dupla.

## Testes

```bash
npm test
```

Cinco suítes, **220 verificações, zero falhas**:

- `test/smoke.js` chama as APIs reais e confere o cálculo: polyline,
  geometria perto da origem e do destino, comprimento da rota batendo com o
  resumo do Valhalla, coerência das manobras, ajuste na via, tratamento
  de erro, a tabela de tarifa e a busca nas três bases.
  Entre elas: a Overpass tem de devolver um prédio **com número**, e um lugar
  inexistente tem de devolver **zero** em vez de resultado inventado.
- `test/navegacao.js` confere a matemática da navegação sem depender de
  aparelho: cumulativos, projeção do ponto na polyline, conversão das
  manobras do Valhalla para metros, próxima manobra, distância restante,
  chegada, e ainda o **rumo (bearing)**, a direção do traçado, o ponto da
  curva e o percurso restante — a base do carrinho e do sinal de manobra no
  mapa. Percorre uma **rota real do Valhalla de ponta a ponta** e
  verifica que as manobras aparecem na ordem, que nenhuma é anunciada
  antes da hora e que nenhuma é pulada.
- `test/atualizacao.js` simula o app nativo em Node (document/fetch/Capacitor
  falsos) e confere o fluxo de atualização da base: achar `version.json`
  remoto, comparar com o embutido, anunciar a versão nova no card e chamar
  o plugin com o endereço certo do pacote.
- `test/integridade.js` confere que todo `getElementById` do JS existe no
  HTML, que todo `<script>`/`<link>` local aponta para arquivo existente,
  que as classes usadas estão no CSS e que os endpoints usam https.
- `test/settings.js` confere as configurações da engrenagem **sem rede**, com
  foco no que acontece quando o usuário digita besteira: campo vazio, letra
  no lugar de número, `"1,90"` com vírgula, negativo, valor acima de 100,
  `NaN`, JSON corrompido no storage e `localStorage` bloqueado (modo privado).
  Nenhum desses pode virar `NaN` na tela.

Duas coisas que os testes encontraram e que valem ler antes de mexer na
navegação:

- **Unidade.** `steps[].distance` e `steps[].cumulative` chegam do Valhalla em
  **quilômetros**, o mesmo padrão de `route.distanceKm`, enquanto a geometria
  da rota é medida em **metros**. Misturar os dois faz o aviso de manobra cair
  no lugar errado.
- **Sentido do trecho.** No Valhalla, `length` é a distância percorrida
  **antes** da manobra, então a curva acontece no **fim** do trecho, em
  `cumulative` — não no começo.

Uma ressalva honesta sobre teste em Node: o Nominatim responde **HTTP 403**
para o User-Agent `node`, pela política de uso dele. No navegador a chamada
funciona. Por isso o teste do reverse geocoding exige texto válido e nunca
`undefined`/`NaN`, mas não exige o endereço em si.

## O que usa

| Parte | Serviço | Custo |
|---|---|---|
| Mapa base | Esri / OpenTopoMap | grátis, sem chave |
| Rotas | [Valhalla](https://valhalla.github.io/valhalla/) (FOSSGIS) | grátis |
| Busca de lugares | [Photon](https://photon.komoot.io) | grátis |
| Busca (2ª base) | [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) | grátis |
| Busca (3ª base, opcional) | [Geoapify](https://www.geoapify.com) | 3.000/dia grátis |
| Endereço por coordenada | Nominatim | grátis |
| Interface | Leaflet 1.9.4 (em `vendor/`) | grátis |

Nenhuma chave de API é necessária. Nenhum dado de usuário sai da máquina.
O seletor no canto superior direito do mapa troca entre Rua, Claro,
Topográfico, Satélite e OSM.

### Por que não usar os tiles do CARTO nem do OSM principal

Ambos foram testados e não servem:

- **`basemaps.cartocdn.com` (CARTO)** passou a exigir API key. Sem chave
  devolve HTTP 200 com uma imagem de 2 KB com a marca d'água
  "API KEY REQUIRED — carto.com/basemaps/apikey".
- **`tile.openstreetmap.org`** devolve um PNG de 6.987 bytes **idêntico em
  qualquer cidade e em qualquer zoom** — é o tile de bloqueio da política de
  uso do OSM. Em outra rede ele funciona normalmente.

Como os dois respondem 200, um teste que só olhe o status code passa
enganado. Por isso `npm test` compara o mesmo zoom em Goiânia e Manaus:
conteúdo igual entre cidades significa tile de bloqueio. Foram 48
verificações, e as 10 do teste de camadas ficam justamente para pegar isso.

## Limitações conhecidas

- **Alternativas de rota não funcionam.** O servidor demo do FOSSGIS ignora o
  parâmetro `alternatives` e devolve sempre uma rota. Com Valhalla self-hosted
  as opções passam a aparecer — a interface já está pronta para isso.
- **Sem trânsito em tempo real.** O tempo estimado é o da via livre, sem
  congestionamento. O ETA tende a ser otimista em horário de pico — e a
  tarifa, por consequência, fica baixa demais no pico.
- **A tarifa é uma estimativa, não uma cobrança.** Não há integração com
  nenhuma plataforma, e os valores da Uber/99 aqui são de referência.
- **Sem modo offline.** Precisa de internet para mapa e rota.
- **A navegação guiada só é contínua no app Android.** No navegador o
  rastreio e a voz são cortados quando a aba vai para segundo plano; por isso
  o app pede que a tela fique acesa. Quem navega com a tela apagada precisa
  do APK.
- **O GPS em background ainda não foi testado em aparelho.** O foreground
  service, as permissões e o wake lock estão implementados e compilam, mas a
  confirmação de que a leitura continua com o display desligado só sai num
  celular real.
- **Turn restrictions incompletas.** "Conversão livre à esquerda onde permitido"
  é mal mapeado no OSM no Brasil. É a causa clássica de erro de rota aqui.
- **Cobertura do OSM** é boa nas capitais e fraca no interior do Brasil.
- **Busca com dois caracteres** não dispara (o mínimo do Photon é 3).
- **Lugares sem registro no OSM não aparecem na busca.** O Photon só enxerga
  o que está mapeado no OpenStreetMap. Se o lugar é um escritório, uma loja ou
  um prédio comercial que ninguém mapeou, a busca não acha — não é bug da
  busca, é falta do dado. Ver "O caso "Edifício Lourenço Office"" e a seção
  "Duas bases gratuitas".

## Próximos passos sugeridos

1. Testar o app num aparelho Android de verdade: GPS com a tela apagada,
   voz, replanejamento no desvio e o botão de passar para o GPS do aparelho.
2. Migrar o roteamento para Valhalla self-hosted (custo marginal zero).
3. Camada de relatos crowdsourced (radar, blitz, acidente) — é o que
   diferencia do Google/Waze e funciona desde o dia 1.
4. Modo offline com tiles de grafo por região.
5. Assinatura de release e iOS (exige conta Apple e um Mac para o Xcode).

## Estrutura

```
pandax-map/
  index.html          estrutura da tela
  css/styles.css      estilos
  js/config.js        endpoints, parametros e tabelas de tarifa
  js/services.js      geocodificacao, rotas, manobras, estimativa de tarifa
  js/navegacao.js     matematica da navegacao + ponte navegador/Android
  js/app.js           interface e interacao
  js/settings.js      configuracoes da engrenagem
  server.js           servidor estatico sem dependencias
  scripts/build-web.js    monta o www/ que vai para dentro do APK
  scripts/copy-apk.js     traz o APK de %TEMP% para dist/
  capacitor.config.json    appId e webDir do app nativo
  android/            projeto Android (Capacitor + plugin de navegacao)
  test/smoke.js       teste de fumaca contra as APIs reais
  test/navegacao.js    teste da matematica de navegacao, com rota real
  test/integridade.js confere HTML, CSS, scripts e endpoints
  test/settings.js    configuracoes sem rede
  dist/               APK pronto para instalar
```
