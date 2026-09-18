/* quilt-gan engine — exact Penrose multigrid + embeddings + referee. Pure logic, no DOM. */
(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory();
  else root.ENGINE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const RADS = Math.PI / 180;
  // floor convention: 5 families at 90° + k·72°
  const GAMMA = [0, 1, 2, 3, 4].map(k => (90 + k * 72) * RADS);
  const N = GAMMA.map(a => ({ x: Math.cos(a), y: Math.sin(a) })); // normals
  const S = 1; // grid spacing (identity unit)

  // crossing of family-i line ki with family-j line kj -> exact point
  function crossingPoint(i, ki, j, kj) {
    const a = N[i], b = N[j];
    const det = a.x * b.y - a.y * b.x;
    // a·p = S*ki, b·p = S*kj
    return { x: (S * ki * b.y - S * kj * a.y) / det, y: (S * kj * a.x - S * ki * b.x) / det };
  }

  // enumerate all crossings in a patch of radius R (pairs: (0,k1),(1,k2),(2,k3) — canonical half)
  function enumerateVertices(R) {
    const verts = [];
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++)
      for (let ki = -R; ki <= R; ki++) for (let kj = -R; kj <= R; kj++) {
        const p = crossingPoint(i, ki, j, kj);
        if (Math.abs(p.x) <= R * 1.05 && Math.abs(p.y) <= R * 1.05) {
          verts.push({ gi: i, ki, gj: j, kj, x: p.x, y: p.y });
        }
      }
    // deterministic order: center-out, then angle
    verts.sort((a, b) =>
      (Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)) || (Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x)));
    return verts;
  }

  // the 5-int tile tuple (Penrose rhombus cell) — for annotation only, NEVER identity
  function tileOf(v) {
    const t = [0, 0, 0, 0, 0];
    t[v.gi] = v.ki; t[v.gj] = v.kj;
    for (let k = 0; k < 5; k++) {
      if (k === v.gi || k === v.gj) continue;
      const p = crossingPoint(v.gi, v.ki, k, 0);
      // which line of family k is p closest to (integer, exact via rounding the dot product)
      const kVal = Math.round((N[k].x * v.x + N[k].y * v.y) / S);
      t[k] = kVal;
    }
    return t;
  }

  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ---------- embeddings: nodes -> exact vertices ---------- */
  // Every embedding returns [{ref: nodeIdx, v: vertex}] with v from enumerateVertices (integer identity guaranteed).

  function embedPolarSpiral(nodes, R) {
    const verts = enumerateVertices(R);
    const order = nodes.map((n, idx) => idx)
      .sort((a, b) => (nodes[a].t - nodes[b].t) || nodes[a].n.localeCompare(nodes[b].n));
    const placed = [];
    for (let k = 0; k < Math.min(order.length, verts.length); k++)
      placed.push({ ref: order[k], v: verts[k] });
    return placed;
  }

  function embedTileAnchor(nodes, fabric, R, seed = 0) {
    const verts = enumerateVertices(R);
    const used = new Set();
    const placed = [];
    const byName = {}; nodes.forEach((n, i) => byName[n.n] = i);
    // fabric degree: hubs first
    const degree = {};
    fabric.forEach(([a, b]) => { degree[a] = (degree[a] || 0) + 1; degree[b] = (degree[b] || 0) + 1; });
    const fabricNodes = Object.keys(degree).filter(n => n in byName)
      .sort((a, b) => degree[b] - degree[a]);
    // BFS from highest-degree hub: each new node takes a nearby free vertex
    const frontier = [];
    const take = (nearIdx) => {
      let best = -1, bd = Infinity;
      const from = verts[nearIdx] || { x: 0, y: 0 };
      for (let i = 0; i < verts.length; i++) {
        if (used.has(i)) continue;
        const d = Math.hypot(verts[i].x - from.x, verts[i].y - from.y) + ((hash(verts[i].ki + ':' + verts[i].kj + seed) % 97) / 971);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    };
    const hubName = fabricNodes[0];
    let vi = take(0);
    if (hubName !== undefined) { placed.push({ ref: byName[hubName], v: verts[vi] }); used.add(vi); frontier.push(vi); }
    // walk fabric edges by BFS over the edge graph
    const adj = {}; fabric.forEach(([a, b]) => { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); });
    const seen = new Set(hubName ? [hubName] : []);
    const queue = hubName ? [hubName] : [];
    while (queue.length) {
      const cur = queue.shift(); const curVi = placed.find(p => p.ref === byName[cur]);
      for (const nb of adj[cur] || []) {
        if (seen.has(nb) || !(nb in byName)) continue;
        seen.add(nb); queue.push(nb);
        const ni = take(placed.indexOf(curVi) >= 0 ? verts.indexOf(curVi.v) : 0);
        if (ni >= 0) { placed.push({ ref: byName[nb], v: verts[ni] }); used.add(ni); }
      }
    }
    // remaining fabric nodes (unreachable)
    fabricNodes.forEach(nm => { if (!seen.has(nm)) { const ni = take(0); if (ni >= 0) { placed.push({ ref: byName[nm], v: verts[ni] }); used.add(ni); } } });
    // tier-1 non-fabric
    nodes.forEach((n, i) => {
      if (n.t === 1 && !placed.some(p => p.ref === i)) { const ni = take(0); if (ni >= 0) { placed.push({ ref: i, v: verts[ni] }); used.add(ni); } }
    });
    // sea: deterministic texture — order by (family, vessel, name) with hash micro-clustering
    const sea = nodes.map((n, i) => ({ n, i })).filter(x => !placed.some(p => p.ref === x.i));
    sea.sort((a, b) => (a.n.f.localeCompare(b.n.f)) || (a.n.v.localeCompare(b.n.v)) || ((hash(a.n.n + seed) % 64) - (hash(b.n.n + seed) % 64)));
    sea.forEach(x => {
      let ni = take(0);
      if (ni >= 0) { placed.push({ ref: x.i, v: verts[ni] }); used.add(ni); }
    });
    return placed;
  }

  /* ---------- palettes ---------- */
  const PALETTES = {
    v1: { bg: '#0b0e14', sea: '#4a5a75', t2: '#7a8bb0', t1: '#e8ecf4', fabric: '#d4a017', label: '#8b93a8', familyTint: { 'canon': '#8b5cf6', 'agent-coordination': '#22d3ee', 'constraint-theory': '#f59e0b', 'hardware-edge': '#34d399' } },
    abyss: { bg: '#050810', sea: '#16324a', t2: '#2e6b8a', t1: '#bfefff', fabric: '#ffd166', label: '#5f7f9f', familyTint: { 'canon': '#c084fc', 'agent-coordination': '#22d3ee', 'constraint-theory': '#fbbf24', 'hardware-edge': '#34d399' } },
    paper: { bg: '#f7f4ed', sea: '#c9c2b4', t2: '#8f8878', t1: '#2b2822', fabric: '#b3541e', label: '#6b6558', familyTint: { 'canon': '#7c3aed', 'agent-coordination': '#0369a1', 'constraint-theory': '#a16207', 'hardware-edge': '#15803d' } },
  };
  const FAMILY_FALLBACK = ['#5b6b8c', '#6d5f8f', '#4f7a6a', '#8f6d5f', '#5f8f7a', '#7a8f5f'];

  /* ---------- referee ---------- */
  function referee(placed, nodes, fabric, palette) {
    const issues = []; const notes = [];
    if (placed.length !== nodes.length) issues.push(`placed ${placed.length} != ${nodes.length} nodes`);
    // identity exactness: every vertex must carry integer grid lines
    const bad = placed.filter(p => ![p.v.gi, p.v.ki, p.v.gj, p.v.kj].every(Number.isInteger));
    if (bad.length) issues.push(`${bad.length} nodes lack integer grid identity`);
    const seen = new Set(placed.map(p => `${p.v.gi},${p.v.ki},${p.v.gj},${p.v.kj}`));
    if (seen.size !== placed.length) issues.push(`vertex collision: ${placed.length - seen.size} duplicate identities (rounding merge!)`);
    // fabric arc lengths
    const pos = {}; placed.forEach(p => pos[nodes[p.ref].n] = p.v);
    let arcLen = 0, drawn = 0;
    fabric.forEach(([a, b]) => { if (pos[a] && pos[b]) { arcLen += Math.hypot(pos[a].x - pos[b].x, pos[a].y - pos[b].y); drawn++; } });
    const avgArc = drawn ? arcLen / drawn : 0;
    notes.push(`fabric: ${drawn}/${fabric.length} arcs, avg length ${avgArc.toFixed(2)} (target < 4.0)`);
    const arcScore = drawn === fabric.length ? Math.max(0, 1 - avgArc / 8) : (drawn / fabric.length) * 0.5;
    // palette discipline
    const allowed = new Set(Object.values(palette).flatMap(v => typeof v === 'string' ? [v.toLowerCase()] : Object.values(v).map(x => x.toLowerCase())));
    // (renderer is constrained to palette by construction; count would need DOM — skip here, check on render)
    const score = Math.round((placed.length / nodes.length) * 40 + (seen.size === placed.length ? 30 : 0) + arcScore * 30);
    return { score: Math.min(score, 100), issues, notes, avgArc, drawn };
  }

  return { GAMMA, crossingPoint, enumerateVertices, tileOf, hash, embedPolarSpiral, embedTileAnchor, PALETTES, FAMILY_FALLBACK, referee };
});
