/* Copia o APK gerado para dentro do projeto, em dist/.
 *
 * Por que preciso disso: o build.gradle manda a saida do Gradle para
 * %LOCALAPPDATA%\Temp\opencode\gradle-build porque o OneDrive trava a pasta
 * de build normal e o assemble falha na limpeza. O lado ruim e que %TEMP%
 * e temporario de verdade: o Windows limpa sozinho e o APK some.
 *
 * Entao o build deixa de entregar um arquivo em lugar nenhum e passa a
 * entregar um lugar estavel, que da para mandar por WhatsApp, anexar num
 * e-mail ou instalar depois.
 *
 * Roda depois do Gradle: npm run android:apk
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const NOME = 'pandax-map-debug.apk';

// Mesmo destino do layout.buildDirectory do android/build.gradle.
const BUILD = path.join(
  os.tmpdir(), 'opencode', 'gradle-build',
  'app', 'outputs', 'apk', 'debug', 'app-debug.apk'
);

if (!fs.existsSync(BUILD)) {
  console.error('APK nao encontrado em:\n  ' + BUILD);
  console.error('O build falhou, ou rodou antes de "gradlew assembleDebug"?');
  process.exit(1);
}

fs.mkdirSync(DIST, { recursive: true });
const destino = path.join(DIST, NOME);
fs.copyFileSync(BUILD, destino);

const mb = (fs.statSync(destino).size / 1024 / 1024).toFixed(2);
console.log('\nAPK pronto: ' + destino + '  (' + mb + ' MB)');
console.log('Instalar com:  adb install -r "' + destino + '"');
console.log('Ou copie para o celular e abra o arquivo (permita "instalar de fontes desconhecidas").');
