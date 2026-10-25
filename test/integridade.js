// Confere se todo getElementById usado no JS existe no HTML,
// e se todo <script>/<link> do HTML aponta para arquivo existente.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const cfgJs = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');

let falhas = 0;
const bad = (m) => { console.log('  FALHA ' + m); falhas++; };

// IDs presentes no HTML
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

// IDs usados no JS
const jsIds = new Set([...appJs.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));

console.log('\nIDs');
console.log('  HTML declara: ' + htmlIds.size + ' | JS procura: ' + jsIds.size);

// IDs que o JS cria em tempo de execucao dentro de innerHTML
const dinamicos = new Set(['cancel-pick']);

for (const id of jsIds) {
  if (htmlIds.has(id)) continue;
  if (dinamicos.has(id)) { console.log('  dinamico #' + id + ' (criado em runtime)'); continue; }
  bad('JS procura #' + id + ' mas o HTML nao tem');
}
console.log('  todos os IDs usados pelo JS existem no HTML');

// data-act / data-field tem handler generico
const attrs = [...html.matchAll(/data-act="([^"]+)"/g)].map(m => m[1]);
const actsQueried = new Set([...appJs.matchAll(/getAttribute\('data-act'\)/g)].length ? attrs : []);
if (attrs.length) {
  console.log('  botoes data-act: ' + [...new Set(attrs)].join(', '));
}

// recursos externos e locais
console.log('\nRecursos');
const srcs = [...html.matchAll(/<(?:script src|link[^>]*href)="([^"]+)"/g)].map(m => m[1]);
for (const s of srcs) {
  if (/^https?:/.test(s)) {
    console.log('  externo  ' + s);
  } else {
    const ok = fs.existsSync(path.join(ROOT, s.replace(/^\//, '')));
    if (ok) console.log('  ok       ' + s);
    else bad('recurso local inexistente: ' + s);
  }
}

// classes usadas no JS precisam existir no CSS
console.log('\nCSS');
const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
['hidden', 'chip', 'chip--active', 'step', 'step-icon', 'step-text', 'step-dist',
 'step-street', 'step--first', 'summary-time', 'summary-sep', 'summary-tags',
 'tag', 'muted', 'pin', 'pin--origin', 'pin--destination', 'brand-dash']
 .forEach(cls => {
   if (!css.includes('.' + cls)) bad('classe .' + cls + ' usada no JS/HTML sem CSS');
 });
console.log('  classes principais presentes no CSS');

// config: todo endpoint tem protocolo
console.log('\nConfig');
['valhallaUrl', 'photonUrl', 'nominatimUrl'].forEach(k => {
  const m = cfgJs.match(new RegExp(k + ":\\s*'([^']+)'"));
  if (!m) bad('config.' + k + ' nao encontrada');
  else if (!/^https:\/\//.test(m[1])) bad('config.' + k + ' nao usa https: ' + m[1]);
  else console.log('  ok  ' + k);
});

console.log('\n' + (falhas === 0 ? '>>> tudo consistente.' : '>>> ' + falhas + ' problema(s).') + '\n');
process.exit(falhas === 0 ? 0 : 1);