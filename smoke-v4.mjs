// v4 smoke test — run the REAL arena headless: real 2,003-repo graph, real
// engine, real fabric grammar. Prints the v3-vs-v4 delta: what the chord
// metric hid, what the κ judge sees, and that a round still scores.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire('/tmp/quilt-gan/');
const { NODES, FABRIC } = require('/tmp/quilt-gan/graph.js');
const E = require('/tmp/quilt-gan/engine.js');
const { fabricLayout, fabricMetrics, killVeto, proportionalSide } = await import('/tmp/quilt-gan/fabric.mjs');

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
const RATIO = 0.1;
const sideFor = proportionalSide(RATIO, ([a, b]) => (E.hash(a + b) % 2 ? 1 : -1));
const layout = fabricLayout(resolved, pos, { sideFor });
const metrics = fabricMetrics(layout);
const veto = killVeto(layout, { deltaMax: 4 * RATIO * 2 }); // v5: judge = 2x the theoretical 4·ratio bound
const arcOf = new Map(layout.map(r => [r.edge[0] + '→' + r.edge[1], r]));
const v4 = E.referee(placed, NODES, FABRIC, E.PALETTES.abyss, {
  arcMetric: (a, b) => arcOf.get(a + '→' + b).length,
  fabricVeto: veto,
});

console.log(`chord metric: avgArc = ${v3.avgArc.toFixed(4)}  score = ${v3.score}`);
console.log(`v5: avgArc(TRUE)  = ${v4.avgArc.toFixed(4)}  avgChord = ${v4.avgChord.toFixed(4)}  delta = ${v4.arcDeltaPct.toFixed(2)}%`);
console.log(`v5: κ_max = ${veto.kappaMax.toFixed(4)} (Δ_max = ${(4 * RATIO * 2).toFixed(1)}) → ${veto.pass ? 'PASS' : 'KILL'}`);
const tightest = [...veto.perArc].sort((x, y) => y.kappaMax - x.kappaMax).slice(0, 4);
for (const t of tightest) console.log(`  tightest: ${t.edge[0]}→${t.edge[1]} κ=${t.kappaMax.toFixed(2)} (chord ${arcOf.get(t.edge.join('→')).chord.toFixed(2)})`);
console.log(`v5: score = ${v4.score} (chord-metric ${v3.score})`);
for (const n of v4.notes) console.log('  ·', n);

// mask-scoped judging (the floor's mask.mjs seam): DEMO POLICY — short arcs
// (chord < 1, the hairpin class) judged dense, long arcs scoped out. The
// note must disclose the scope; the scoped κ_max must cover its scope only.
const shortMask = { has: (a, b) => (arcOf.get(a + '→' + b)?.chord ?? 9) < 1.0, name: 'chord<1' };
const scopedVeto = { ...veto };
scopedVeto.scoped = veto.perArc.filter(r => shortMask.has(...r.edge));
scopedVeto.scopedOut = veto.perArc.length - scopedVeto.scoped.length;
scopedVeto.kappaMax = scopedVeto.scoped.reduce((m, r) => Math.max(m, r.kappaMax), 0);
scopedVeto.pass = scopedVeto.scoped.every(r => r.pass);
const v5 = E.referee(placed, NODES, FABRIC, E.PALETTES.abyss, {
  arcMetric: (a, b) => arcOf.get(a + '→' + b).length,
  fabricVeto: scopedVeto,
});
const scopeNote = v5.notes.find(n => /MASK-SCOPED/.test(n));
console.log(`mask: judged ${scopedVeto.scoped.length}/${veto.perArc.length} arcs (policy chord<1) → κ_max(scope) = ${scopedVeto.kappaMax.toFixed(4)}`);
console.log('  ·', scopeNote);
assert.ok(scopeNote && scopeNote.includes(`${scopedVeto.scopedOut} out of scope`), 'the judge discloses its scope');
assert.equal(v5.score, v4.score, 'scoped judging does not change the score when the scope passes');
assert.equal(veto.pass, true, 'default scope (⊤) still passes');
if (v3.score !== v4.score && v4.communication !== v3.communication) {
  console.log(`scores differ: communication ${v3.communication} → ${v4.communication} — the truth costs points, as it must`);
}

// the FIRST CROSSING: a hosted ℚ¹⁶ trajectory rides along as provenance.
// The referee must disclose it and the score must NOT move (zero impact law).
const prov = { name: 'arena-config', states: 3 };
const v6 = E.referee(placed, NODES, FABRIC, E.PALETTES.abyss, {
  arcMetric: (a, b) => arcOf.get(a + '→' + b).length,
  fabricVeto: veto,
  fabricProvenance: prov,
});
const provNote = v6.notes.find(n => /provenance/.test(n));
assert.ok(provNote && /never identity/.test(provNote) && /ZERO score impact/.test(provNote), 'provenance disclosed with the law in the note');
assert.equal(v6.score, v4.score, 'the crossing moves zero points — provenance is not a scoring term');
console.log(`crossing: trajectory provenance rides along — score ${v4.score} → ${v6.score} (identical, as the law demands)`);
