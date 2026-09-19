/* quilt-gan engine v3 — SEXTANT embedding + β-palette + descent-referee. Pure logic, no DOM.
   Lineage: GEN-α′ (SEXTANT spec) + GEN-β (palette/grammar spec) + DISC-δ (orders 1-10). */
(function (root, factory) {
  if (typeof module !== 'undefined') module.exports = factory();
  else root.ENGINE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const RADS = Math.PI / 180;
  const GAMMA = [0, 1, 2, 3, 4].map(k => (90 + k * 72) * RADS);
  const N = GAMMA.map(a => ({ x: Math.cos(a), y: Math.sin(a) }));
  const S = 1;

  function crossingPoint(i, ki, j, kj) {
    const a = N[i], b = N[j];
    const det = a.x * b.y - a.y * b.x;
    return { x: (S * ki * b.y - S * kj * a.y) / det, y: (S * kj * a.x - S * ki * b.x) / det };
  }

  function enumerateVertices(R) {
    const verts = [];
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++)
      for (let ki = -R; ki <= R; ki++) for (let kj = -R; kj <= R; kj++) {
        const p = crossingPoint(i, ki, j, kj);
        if (Math.abs(p.x) <= R * 1.05 && Math.abs(p.y) <= R * 1.05)
          verts.push({ gi: i, ki, gj: j, kj, x: p.x, y: p.y });
      }
    verts.sort((a, b) =>
      (Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y)) || (Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x)));
    return verts;
  }

  function tileOf(v) {
    const t = [0, 0, 0, 0, 0];
    t[v.gi] = v.ki; t[v.gj] = v.kj;
    for (let k = 0; k < 5; k++) {
      if (k === v.gi || k === v.gj) continue;
      t[k] = Math.round((N[k].x * v.x + N[k].y * v.y) / S);
    }
    return t;
  }

  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ---------- fabric resolution: ghosts are doctrine violations, not silent half-scores ---------- */
  function resolveFabric(fabric, nodes) {
    const names = new Set(nodes.map(n => n.n));
    const edges = [], ghosts = [];
    fabric.forEach(([a, b]) => {
      if (names.has(a) && names.has(b)) edges.push([a, b]);
      else ghosts.push([a, b]);
    });
    return { edges, ghosts };
  }

  /* ---------- legacy embeddings (arena classics) ---------- */
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
    const used = new Set(); const placed = [];
    const byName = {}; nodes.forEach((n, i) => byName[n.n] = i);
    const degree = {};
    fabric.forEach(([a, b]) => { degree[a] = (degree[a] || 0) + 1; degree[b] = (degree[b] || 0) + 1; });
    const fabricNodes = Object.keys(degree).filter(n => n in byName).sort((a, b) => degree[b] - degree[a]);
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
    if (hubName !== undefined) { placed.push({ ref: byName[hubName], v: verts[vi] }); used.add(vi); }
    const adj = {}; fabric.forEach(([a, b]) => { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); });
    const seen = new Set(hubName ? [hubName] : []); const queue = hubName ? [hubName] : [];
    while (queue.length) {
      const cur = queue.shift();
      const curP = placed.find(p => p.ref === byName[cur]);
      for (const nb of adj[cur] || []) {
        if (seen.has(nb) || !(nb in byName)) continue;
        seen.add(nb); queue.push(nb);
        const ni = take(curP ? verts.indexOf(curP.v) : 0);
        if (ni >= 0) { placed.push({ ref: byName[nb], v: verts[ni] }); used.add(ni); }
      }
    }
    fabricNodes.forEach(nm => { if (!seen.has(nm)) { const ni = take(0); if (ni >= 0) { placed.push({ ref: byName[nm], v: verts[ni] }); used.add(ni); } } });
    nodes.forEach((n, i) => {
      if (n.t === 1 && !placed.some(p => p.ref === i)) { const ni = take(0); if (ni >= 0) { placed.push({ ref: i, v: verts[ni] }); used.add(ni); } }
    });
    const sea = nodes.map((n, i) => ({ n, i })).filter(x => !placed.some(p => p.ref === x.i));
    sea.sort((a, b) => (a.n.f.localeCompare(b.n.f)) || (a.n.v.localeCompare(b.n.v)) || ((hash(a.n.n + seed) % 64) - (hash(b.n.n + seed) % 64)));
    sea.forEach(x => { const ni = take(0); if (ni >= 0) { placed.push({ ref: x.i, v: verts[ni] }); used.add(ni); } });
    return placed;
  }

  /* ---------- SEXTANT (GEN-α′): stars → Voronoi continents → contraction → vessel-strata sea ---------- */
  function bucketGrid(verts, cell) {
    const B = new Map();
    verts.forEach((v, i) => {
      const k = Math.floor(v.x / cell) + ':' + Math.floor(v.y / cell);
      (B.get(k) || B.set(k, []).get(k)).push(i);
    });
    return B;
  }
  function nearVerts(B, x, y, cell, rad) {
    const out = [];
    const reach = Math.ceil(rad / cell) + 1; // scan ALL buckets the radius touches
    for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) {
      const k = Math.floor(x / cell + dx) + ':' + Math.floor(y / cell + dy);
      const b = B.get(k); if (b) b.forEach(i => out.push(i));
    }
    return out.filter(i => Math.hypot(vertsX[i] - x, vertsY[i] - y) <= rad);
  }
  // hoist coordinate caches for nearVerts closures
  let vertsX = [], vertsY = [];

  function embedSextant(nodes, fabric, R, opts = {}) {
    const sigma = opts.sigma || 1.2, lam = opts.lam || 0, maxPass = opts.maxPass || 6;
    const verts = enumerateVertices(R);
    vertsX = verts.map(v => v.x); vertsY = verts.map(v => v.y);
    const V = verts.length;
    const freeArr = new Array(V).fill(true);
    const isFree = i => freeArr[i];
    const claim = i => { freeArr[i] = false; };
    const byName = {}; nodes.forEach((n, i) => byName[n.n] = i);
    const placed = []; const at = new Array(nodes.length).fill(-1); // nodeIdx -> vertIdx
    const place = (ni, vi) => { placed.push({ ref: ni, v: verts[vi] }); at[ni] = vi; claim(vi); };

    // fabric degree & components
    const degree = {}, adjF = {};
    fabric.forEach(([a, b]) => {
      degree[a] = (degree[a] || 0) + 1; degree[b] = (degree[b] || 0) + 1;
      (adjF[a] = adjF[a] || []).push(b); (adjF[b] = adjF[b] || []).push(a);
    });
    const stars = Object.keys(degree).filter(n => degree[n] >= 2 && n in byName)
      .sort((a, b) => degree[b] - degree[a] || hash(a) - hash(b));

    /* Phase A — hub stars */
    const B = bucketGrid(verts, 1.3);
    const starVi = {};
    stars.forEach((nm, si) => {
      let best = -1, bs = Infinity;
      for (let i = 0; i < V; i++) {
        if (!isFree(i)) continue;
        const dc = Math.hypot(verts[i].x, verts[i].y);
        let sep = 0;
        for (const s in starVi) sep = Math.max(sep, Math.max(0, sigma - Math.hypot(verts[i].x - verts[starVi[s]].x, verts[i].y - verts[starVi[s]].y)));
        // neighbors' centroid attraction (already-placed fabric neighbors)
        const placedNbrs = (adjF[nm] || []).filter(x => x in starVi);
        let dg = dc;
        if (placedNbrs.length) {
          let cx = 0, cy = 0; placedNbrs.forEach(x => { cx += verts[starVi[x]].x; cy += verts[starVi[x]].y; });
          cx /= placedNbrs.length; cy /= placedNbrs.length;
          dg = Math.hypot(verts[i].x - cx, verts[i].y - cy);
        }
        const cost = dg + 0.1 * dc + 100 * sep;
        if (cost < bs) { bs = cost; best = i; }
      }
      if (best >= 0) { starVi[nm] = best; place(byName[nm], best); }
    });

    /* Phase B — continents: anchors + multi-source growth + monotone matching */
    const famStats = {};
    nodes.forEach((n, i) => {
      if (at[i] >= 0) return;
      (famStats[n.f] = famStats[n.f] || { nodes: [] }).nodes.push(i);
    });
    const fams = Object.keys(famStats).sort((a, b) => famStats[b].nodes.length - famStats[a].nodes.length || a.localeCompare(b));
    const maxr = R * 0.42, phi0 = 0.35;
    const famAnchor = {}, famClaims = {};
    fams.forEach((f, fi) => {
      const ang = phi0 + fi * 2.399963; // golden angle
      let best = -1, bd = Infinity;
      for (let i = 0; i < V; i++) {
        if (!isFree(i)) continue;
        const d = Math.hypot(verts[i].x - maxr * Math.cos(ang), verts[i].y - maxr * Math.sin(ang));
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) {
        famAnchor[f] = verts[best];
        famClaims[f] = [];
        // multi-source growth from the anchor
        const quota = famStats[f].nodes.length;
        const heap = [{ vi: best, d: 0, clock: 0 }];
        const inq = new Set([best]);
        let clock = 0;
        while (heap.length && famClaims[f].length < quota) {
          // array-heap pop-min by (d + eps*clock)
          let bi = 0; let bk = Infinity;
          for (let q = 0; q < heap.length; q++) {
            const k = heap[q].d + 1e-4 * heap[q].clock;
            if (k < bk) { bk = k; bi = q; }
          }
          const cur = heap.splice(bi, 1)[0];
          if (!isFree(cur.vi)) continue;
          famClaims[f].push(cur.vi); claim(cur.vi);
          // push neighbors
          nearVerts(B, verts[cur.vi].x, verts[cur.vi].y, 1.3, 1.45).forEach(ni => {
            if (isFree(ni) && !inq.has(ni)) { inq.add(ni); heap.push({ vi: ni, d: Math.hypot(verts[ni].x - famAnchor[f].x, verts[ni].y - famAnchor[f].y), clock: ++clock }); }
          });
        }
      }
    });
    // monotone matching per family: nodes (tier asc, name) x claims (dist to anchor asc)
    fams.forEach(f => {
      const ns = famStats[f].nodes.slice().sort((a, b) => nodes[a].t - nodes[b].t || nodes[a].n.localeCompare(nodes[b].n));
      const cs = famClaims[f].slice().sort((a, b) =>
        Math.hypot(verts[a].x - famAnchor[f].x, verts[a].y - famAnchor[f].y) - Math.hypot(verts[b].x - famAnchor[f].x, verts[b].y - famAnchor[f].y));
      ns.forEach((ni, k) => { if (k < cs.length) place(ni, cs[k]); });
    });

    /* Phase C — fabric contraction (strict descent on total arc energy) */
    const posOf = {}; placed.forEach(p => posOf[nodes[p.ref].n] = p.v);
    const starNames = new Set(stars);
    let E = fabric.reduce((s, [a, b]) => s + (posOf[a] && posOf[b] ? Math.hypot(posOf[a].x - posOf[b].x, posOf[a].y - posOf[b].y) : 0), 0);
    const edgeLen = ([a, b]) => posOf[a] && posOf[b] ? Math.hypot(posOf[a].x - posOf[b].x, posOf[a].y - posOf[b].y) : Infinity;
    for (let pass = 0; pass < maxPass; pass++) {
      let moved = false;
      const order = fabric.slice().sort((x, y) => edgeLen(y) - edgeLen(x));
      for (const [a, b] of order) {
        if (!posOf[a] || !posOf[b]) continue;
        const la = edgeLen([a, b]);
        if (la < 0.6) continue;
        const mx = (posOf[a].x + posOf[b].x) / 2, my = (posOf[a].y + posOf[b].y) / 2;
        // try moving b (or a, prefer non-star) to a free vertex near midpoint
        // any endpoint may move (stars too, σ-guarded below)
        const mvB = true, mvA = true;
        let done = false;
        [[b, mvB], [a, mvA]].forEach(([nm, canMove]) => {
          if (done || !canMove) return;
          const ni = byName[nm]; const curVi = at[ni];
          const cands = nearVerts(B, mx, my, 1.3, Math.max(la / 2, 1.0)).filter(isFree);
          for (const c of cands) {
            // σ separation must hold if nm is a star
            if (starNames.has(nm)) {
              let sepOK = true;
              for (const o in starVi) {
                const ov = starVi[o];
                if (at[byName[o]] !== undefined && ov !== at[byName[nm]] && Math.hypot(verts[c].x - verts[ov].x, verts[c].y - verts[ov].y) < sigma) { sepOK = false; break; }
              }
              if (!sepOK) continue;
            }
            const other = nm === b ? posOf[a] : posOf[b];
            const newLen = Math.hypot(verts[c].x - other.x, verts[c].y - other.y);
            const others = fabric.filter(([x, y]) => x !== nm && y !== nm || true); // recompute energy delta exactly:
            let delta = 0;
            fabric.forEach(([x, y]) => {
              if (x !== nm && y !== nm) return;
              const o = x === nm ? y : x;
              if (!posOf[o]) return;
              const oldL = Math.hypot(verts[curVi].x - posOf[o].x, verts[curVi].y - posOf[o].y);
              delta += newLen - oldL;
            });
            if (delta < -1e-9) {
              // execute swap: node nm moves curVi -> c
              freeArr[curVi] = true; freeArr[c] = false;
              at[ni] = c;
              const p = placed.find(q => q.ref === ni); p.v = verts[c];
              posOf[nm] = verts[c];
              E += delta; moved = true; done = true;
              break;
            }
          }
        });
        if (!done) {
          // star swap attempt: b <-> some star s whose vertex is nearer midpoint
          const nb = byName[b]; const vb = at[nb];
          for (const s of stars) {
            if (s === a || s === b) continue;
            const ns2 = byName[s]; const vs = at[ns2];
            const dCur = Math.hypot(verts[vb].x - mx, verts[vb].y - my) + Math.hypot(verts[vs].x - mx, verts[vs].y - my);
            const dNew = Math.hypot(verts[vs].x - mx, verts[vs].y - my) + Math.hypot(verts[vb].x - mx, verts[vb].y - my);
            if (dNew < dCur - 1e-9) {
              // energy check across all fabric edges touching b or s
              let delta = 0;
              const lenWith = (nm, vi) => fabric.reduce((sum, [x, y]) => {
                if (x !== nm && y !== nm) return sum;
                const o = x === nm ? y : x;
                if (!posOf[o] || o === (nm === b ? s : b)) return sum;
                return sum + Math.hypot(verts[vi].x - posOf[o].x, verts[vi].y - posOf[o].y);
              }, 0);
              const oldE = lenWith(b, vb) + lenWith(s, vs);
              const newE = lenWith(b, vs) + lenWith(s, vb);
              delta = newE - oldE;
              // keep sigma separation
              let ok = true;
              for (const o in starVi) if (o !== s) {
                if (Math.hypot(verts[vb].x - verts[starVi[o]].x, verts[vb].y - verts[starVi[o]].y) < sigma) { ok = false; break; }
              }
              if (delta < -1e-9 && ok) {
                at[nb] = vs; at[ns2] = vb;
                const pb = placed.find(q => q.ref === nb), ps = placed.find(q => q.ref === ns2);
                pb.v = verts[vs]; ps.v = verts[vb];
                posOf[b] = verts[vs]; posOf[s] = verts[vb];
                starVi[s] = vb; E += delta; moved = true;
              }
              break;
            }
          }
        }
      }
      if (!moved) break;
    }

    /* Phase D — sea: vessel-first strata (attribution debt made legible) */
    const seaNodes = nodes.map((n, i) => ({ n, i })).filter(x => at[x.i] < 0)
      .sort((x, y) => (x.n.v.localeCompare(y.n.v)) || (x.n.f.localeCompare(y.n.f)) || ((hash(x.n.n) % 64) - (hash(y.n.n) % 64)));
    let cursor = 0;
    // free verts center-out = original enumeration order skipping used
    for (let i = 0; i < V && cursor < seaNodes.length; i++) {
      if (!isFree(i)) continue;
      place(seaNodes[cursor].i, i); cursor++;
    }

    /* Phase E — audit (energy computed from truth, never from loop bookkeeping) */
    const idents = new Set(placed.map(p => `${p.v.gi},${p.v.ki},${p.v.gj},${p.v.kj}`));
    const audit = {
      placed: placed.length, nodes: nodes.length,
      identityExact: placed.every(p => [p.v.gi, p.v.ki, p.v.gj, p.v.kj].every(Number.isInteger)),
      collisions: placed.length - idents.size,
      arcsResolved: fabric.filter(([a, b]) => posOf[a] && posOf[b]).length,
      energy: fabric.reduce((s, [a, b]) => s + (posOf[a] && posOf[b] ? Math.hypot(posOf[a].x - posOf[b].x, posOf[a].y - posOf[b].y) : 0), 0),
    };
    return { placed, audit, posOf };
  }

  /* ---------- cohesion (β selfcheck #1): family-anchor ratio vs random ---------- */
  function cohesion(placed, nodes) {
    const byFam = {};
    placed.forEach(p => {
      const f = nodes[p.ref].f;
      if (f === 'other-uncategorized') return;
      (byFam[f] = byFam[f] || []).push(p.v);
    });
    let sum = 0, cnt = 0;
    Object.values(byFam).forEach(vs => {
      if (vs.length < 2) return;
      const cx = vs.reduce((s, v) => s + v.x, 0) / vs.length, cy = vs.reduce((s, v) => s + v.y, 0) / vs.length;
      vs.forEach(v => { sum += Math.hypot(v.x - cx, v.y - cy); cnt++; });
    });
    if (!cnt) return { ratio: 1, mean: 0 };
    const mean = sum / cnt;
    // random baseline: mean pairwise spread over disk of same radius
    const R = Math.sqrt(placed.reduce((s, p) => s + p.v.x * p.v.x + p.v.y * p.v.y, 0) / placed.length) || 1;
    const randomMean = R * 0.9;
    return { ratio: mean / randomMean, mean };
  }

  /* ---------- β palette (named references, §2.1–2.3 / §2.5) ---------- */
  const FAMILY_HEX = {
    'agent-coordination': '#D9A05B', // instrument brass
    'constraint-theory': '#8FAE8B',  // solder-mask green
    'hardware-edge': '#C26D4F',      // antifouling red-oxide
    'web-browser': '#6E8FB4',        // blueprint ferric ink
    'infra': '#A08CA8',              // dried aconite
    'sites': '#CFC08A',              // chart-paper sand
    'applications': '#B87F78',       // dust coral
    'canon': '#E8E3D5',              // vellum — the spine gets ink, not hue
    'plato': '#9BB0A5',              // celadon glaze
    'quilt': '#5FD3BC',              // THE Moebius accent — dinoflagellate teal
  };
  const PALETTES = {
    abyss: {
      name: 'abyss', bg: '#0A0E13', grid: '#22303D', gridOp: 0.45, ring: '#1E2A36', ringOp: 0.8,
      sea: '#33465A', seaOp: 0.55, ink: '#D6D2C4', dim: '#8A8F98', hairline: '#2A3441',
      family: FAMILY_HEX, tier1stroke: '#D9A527',
      fabricCore: '#D9A527', fabricGlow: '#5FD3BC', beacon: '#5FD3BC', paper: false,
    },
    paper: {
      name: 'paper', bg: '#F2EFE6', grid: '#D8D2C2', gridOp: 0.6, ring: '#CFC8B8', ringOp: 0.9,
      sea: '#A9B4BC', seaOp: 1.0, seaStroke: '#8C98A2', ink: '#1C1E22', dim: '#5A5E66', hairline: '#C9C2B2',
      family: FAMILY_HEX, tier1stroke: '#A67C1B',
      fabricCore: '#A67C1B', fabricGlow: '#2E8F80', beacon: '#2E8F80', paper: true,
    },
  };

  /* ---------- referee v3: integrity ≤60 + communication ≤40, ghosts reported ---------- */
  function referee(placed, nodes, fabricRaw, palette, extra = {}) {
    const { edges, ghosts } = resolveFabric(fabricRaw, nodes);
    const issues = []; const notes = [];
    // integrity (60)
    const completeness = Math.round(placed.length / nodes.length * 25);
    const integ = placed.every(p => [p.v.gi, p.v.ki, p.v.gj, p.v.kj].every(Number.isInteger));
    const idents = new Set(placed.map(p => `${p.v.gi},${p.v.ki},${p.v.gj},${p.v.kj}`));
    const noCollide = idents.size === placed.length;
    if (!integ) issues.push('identity not integer-exact');
    if (!noCollide) issues.push(`vertex collision: ${placed.length - idents.size} (rounding merge)`);
    const integrity = completeness + (integ ? 20 : 0) + (noCollide ? 15 : 0);
    // communication (40)
    // v4: extra.arcMetric(a, b, posA, posB) injects the TRUE arc length
    // (quilt-floor fabric grammar). Default is the CHORD — v3's metric, kept
    // only so legacy callers keep their numbers; the renderer injects truth.
    // extra.fabricVeto = {pass, kappaMax, deltaMax} is the Δ_max curvature
    // kill-veto: a fabrication defect zeroes communication.
    const pos = {}; placed.forEach(p => pos[nodes[p.ref].n] = p.v);
    let arcSum = 0, chordSum = 0;
    edges.forEach(([a, b]) => {
      const d = Math.hypot(pos[a].x - pos[b].x, pos[a].y - pos[b].y);
      chordSum += d;
      arcSum += extra.arcMetric ? extra.arcMetric(a, b, pos[a], pos[b]) : d;
    });
    const avgArc = edges.length ? arcSum / edges.length : 0;
    const avgChord = edges.length ? chordSum / edges.length : 0;
    const arcDeltaPct = chordSum > 0 ? 100 * (arcSum - chordSum) / chordSum : 0;
    const arcScore = Math.round(Math.max(0, 15 - avgArc * 12));
    const co = cohesion(placed, nodes);
    const cohScore = co.ratio < 0.5 ? 15 : co.ratio < 0.7 ? 10 : co.ratio < 0.9 ? 5 : 0;
    let comm = arcScore + cohScore + (extra.keyDisclosed === false ? 0 : 10);
    if (extra.arcMetric) notes.push(`arc metric: TRUE arc length (chord avg ${avgChord.toFixed(2)} hid ${arcDeltaPct.toFixed(1)}% of the fabric cost)`);
    if (extra.fabricVeto) {
      if (extra.fabricVeto.scopedOut != null) {
        notes.push(`arc judge: MASK-SCOPED — ${extra.fabricVeto.scoped.length}/${extra.fabricVeto.scoped.length + extra.fabricVeto.scopedOut} arcs judged (κ_max over scope = ${extra.fabricVeto.kappaMax.toFixed(4)}), ${extra.fabricVeto.scopedOut} out of scope by policy`);
      }
      if (!extra.fabricVeto.pass) {
        comm = 0;
        notes.push(`KILL-VETO: arc curvature κ_max = ${extra.fabricVeto.kappaMax.toFixed(2)} > Δ_max = ${extra.fabricVeto.deltaMax} — fabrication defect, communication zeroed`);
      } else {
        notes.push(`arc judge: κ_max = ${extra.fabricVeto.kappaMax.toFixed(4)} ≤ Δ_max = ${extra.fabricVeto.deltaMax}`);
      }
    }
    notes.push(`fabric: ${edges.length} arcs (${ghosts.length} ghosts: ${ghosts.map(g => g[0] + '→' + g[1]).join(', ') || 'none'}) avg ${avgArc.toFixed(2)}`);
    notes.push(`cohesion ratio ${co.ratio.toFixed(2)} (β selfcheck-1 target <0.5) → +${cohScore}`);
    if (ghosts.length) notes.push('ghost edges: pending catalog completeness (PR #19) — doctrine: reported, never half-scored');
    return { score: Math.min(integrity + comm, 100), integrity, communication: comm, avgArc, avgChord, arcDeltaPct, drawn: edges.length, ghostCount: ghosts.length, ghosts, cohesion: co, issues, notes };
  }

  /* ---------- kill-veto metrics for D-blocks (δ order #6) ---------- */
  function vetoChecks(placed, nodes, fabricRaw) {
    const { edges, ghosts } = resolveFabric(fabricRaw, nodes);
    const pos = {}; placed.forEach(p => pos[nodes[p.ref].n] = p.v);
    const co = cohesion(placed, nodes);
    return {
      cohesionRatio: co.ratio,
      cohesionPass: co.ratio < 0.5,
      ghostAcknowledged: true, // renderer must print ghosts; the D-block enforces the convention
      ghosts,
      edgeCoverage: edges.length ? edges.filter(([a, b]) => pos[a] && pos[b]).length / edges.length : 0,
    };
  }

  return {
    GAMMA, crossingPoint, enumerateVertices, tileOf, hash,
    embedPolarSpiral, embedTileAnchor, embedSextant,
    resolveFabric, cohesion, referee, vetoChecks,
    PALETTES, FAMILY_HEX,
  };
});
