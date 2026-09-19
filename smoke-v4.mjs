// v4 smoke test — run the REAL arena headless: real 2,003-repo graph, real
// engine, real fabric grammar. Prints the v3-vs-v4 delta: what the chord
// metric hid, what the κ judge sees, and that a round still scores.
import { createRequire } from 'node:module';
const require = createRequire('/tmp/quilt-gan/');
const { NODES, FABRIC } = require('/tmp/quilt-gan/graph.js');
const E = require('/tmp/quilt-gan/engine.js');
const { fabricLayout, fabricMetrics, killVeto } = await import('/tmp/quilt-gan/fabric.mjs');

const R = 9;
const placed = E.embedSextant(NODES, FABRIC, R, { seed: 0 }).placed;
const { edges, ghosts } = E.resolveFabric(FABRIC, NODES);
const pos = {};
placed.forEach(p => { pos[NODES[p.ref].n] = p.v; });
const resolved = edges.filter(([a, b]) => pos[a] && pos[b]);
console.log(`placed ${placed.length}/${NODES.length} · fabric ${resolved.length} arcs (${ghosts.length} ghosts)`);

// v3 numbers (chord metric — what the engine used to score)
const v3 = E.referee(placed, NODES, FABRIC, E.PALETTES.abyss);

// v4 numbers: exact rational arcs, true length, κ kill-veto
const sideFor = ([a, b]) => (E.hash(a + b) % 2 ? 1 : -1) * 0.16;
const layout = fabricLayout(resolved, pos, { sideFor });
const metrics = fabricMetrics(layout);
const veto = killVeto(layout, { deltaMax: 8.0 }); // the app.js policy constant
const arcOf = new Map(layout.map(r => [r.edge[0] + '→' + r.edge[1], r]));
const v4 = E.referee(placed, NODES, FABRIC, E.PALETTES.abyss, {
  arcMetric: (a, b) => arcOf.get(a + '→' + b).length,
  fabricVeto: veto,
});

console.log(`v3: avgArc(chord) = ${v3.avgArc.toFixed(4)}  score = ${v3.score}`);
console.log(`v4: avgArc(TRUE)  = ${v4.avgArc.toFixed(4)}  avgChord = ${v4.avgChord.toFixed(4)}  delta = ${v4.arcDeltaPct.toFixed(2)}%`);
console.log(`v4: κ_max = ${veto.kappaMax.toFixed(4)} (Δ_max = 8.0) → ${veto.pass ? 'PASS' : 'KILL'}`);
const tightest = [...veto.perArc].sort((x, y) => y.kappaMax - x.kappaMax).slice(0, 4);
for (const t of tightest) console.log(`  tightest: ${t.edge[0]}→${t.edge[1]} κ=${t.kappaMax.toFixed(2)} (chord ${arcOf.get(t.edge.join('→')).chord.toFixed(2)})`);
console.log(`v4: score = ${v4.score} (v3 ${v3.score})`);
for (const n of v4.notes) console.log('  ·', n);
if (v3.score !== v4.score && v4.communication !== v3.communication) {
  console.log(`scores differ: communication ${v3.communication} → ${v4.communication} — the truth costs points, as it must`);
}
