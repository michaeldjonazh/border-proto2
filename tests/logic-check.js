const fs = require('fs');
const html = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', 'index.html'), 'utf8');
const full = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const logic = full.split('// ==LOGIC_END==')[0];

new Function(full); // UI部分も含めた構文チェック

const api = new Function(logic + '; return {generate, analyze, voicesFor, splitByLine, fullLine, W, H};')();
const {generate, analyze, voicesFor, splitByLine, fullLine, W, H} = api;

let fail = 0;
const bad = (m) => { fail++; if (fail < 15) console.log('NG:', m); };
const rnd = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();

// 世界の性質
let minLand = 999, langMissing = 0, noRiver = 0, noCoast = 0, attrKeys = new Set();
const worlds = [];
for (let seed = 1; seed <= 150; seed++) {
  const w = generate(seed); worlds.push(w);
  if (w.langs.length !== 2) bad('langs != 2');
  const land = w.cells.filter(c => c.terrain !== 'sea');
  minLand = Math.min(minLand, land.length);
  if (!land.some(c => c.river)) noRiver++;
  if (!land.some(c => c.coast)) noCoast++;
  if (new Set(land.map(c => c.lang)).size < 2) langMissing++;
  if (land.some(c => c.lang !== 0 && c.lang !== 1)) bad('lang range');
  Object.keys(w.cells[0]).forEach(k => attrKeys.add(k));
}
console.log('世界: land min', minLand, '| river無し', noRiver, '| 海岸無し', noCoast, '| 2言語揃わず', langMissing);
console.log('セルのキー:', [...attrKeys].join(','));

// 線の種類
const lines = {
  縦:      () => [{x: 6, y: 0}, {x: 6, y: H}],
  斜め:    () => [{x: W, y: 0}, {x: 0, y: H}],
  横:      () => [{x: 0, y: 4}, {x: W, y: 4}],
  手書き蛇行: () => { const p = []; for (let i = 0; i <= 60; i++) p.push({x: 6 + Math.sin(i / 6) * 1.5 + (rnd() - .5) * .2, y: i / 60 * H}); return p; },
  途中まで: () => { const p = []; for (let i = 0; i <= 40; i++) p.push({x: 5.5 + i * 0.01, y: 1 + i * 0.1}); return p; }, // 端に届かない（延長される）
  曲がった線: () => { const p = []; for (let i = 0; i <= 40; i++) p.push({x: i / 40 * W, y: 4 + Math.cos(i / 5) * 2 + (rnd() - .5) * .15}); return p; },
};
for (const [name, mk] of Object.entries(lines)) {
  let ok = 0, nul = 0, tiny = 0, scores = [], undef = 0, noAB = 0;
  worlds.forEach(w => {
    const o = splitByLine(w, mk());
    if (!o) { nul++; return; }
    const a = o.filter(v => v === 1).length, b = o.filter(v => v === 2).length;
    const landN = w.cells.filter(c => c.terrain !== 'sea').length;
    if (a + b !== landN) bad(`${name}: 未割当が残る a+b=${a + b} land=${landN}`);
    if (w.cells.some((c, i) => c.terrain === 'sea' && o[i])) bad(`${name}: 海に所有者`);
    if (a < 3 || b < 3) { tiny++; }
    const res = analyze(w, o);
    if (!res.ready) { noAB++; return; }
    ok++; scores.push(res.score);
    voicesFor(w, res).forEach(v => { if (/undefined/.test(v.roman) || !v.ja || !v.lang) undef++; });
  });
  scores.sort((x, y) => x - y);
  console.log(name.padEnd(8), 'ok', ok, '| null', nul, '| 片側3マス未満', tiny,
    '| score', scores.length ? `${scores[0]}/${scores[scores.length >> 1]}/${scores[scores.length - 1]}` : '-', '| undefined', undef);
  if (undef) bad(name + ' undefined text');
  if (nul > 0) bad(name + ' null returned');
}

// 短すぎる線・点だけ は無効
if (splitByLine(worlds[0], [{x: 3, y: 3}, {x: 3.3, y: 3.2}])) bad('短い線が通った');
if (splitByLine(worlds[0], [{x: 3, y: 3}])) bad('1点が通った');

// 延長の確認
const ext = fullLine(lines.途中まで());
const e0 = ext[0], e1 = ext[ext.length - 1];
const onEdge = p => p.x < 1e-6 || p.y < 1e-6 || p.x > W - 1e-6 || p.y > H - 1e-6;
if (!onEdge(e0) || !onEdge(e1)) bad('延長が端に届かない');
else console.log('延長OK:', JSON.stringify(e0, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v), '→', JSON.stringify(e1, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v));

// サンプル
const w = worlds[41];
const o = splitByLine(w, lines.斜め());
const res = analyze(w, o);
console.log('--- sample seed42 斜め');
console.log(w.name, w.langs.map(l => l.name + ':水=' + l.lex.water).join(' / '));
console.log('score', res.score, res.level.label, res.issues.map(i => i.id + ':' + i.sev).join(' '));
voicesFor(w, res).forEach(v => console.log(v.side, v.lang, v.roman, '／', v.ja));

console.log(fail ? `FAILED ${fail}` : 'ALL OK');
process.exit(fail ? 1 : 0);
