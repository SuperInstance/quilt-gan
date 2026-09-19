/* quilt-gan arena UI v4 — the fabric grammar: exact rational arcs, TRUE
   arc-length metric, Δ_max curvature kill-veto. Vendored from quilt-floor
   (IARS spline.mjs + commensurate.mjs + fabric.mjs, byte-identical). */
import { fabricLayout, fabricMetrics, killVeto, proportionalSide } from './fabric.mjs';
import { sampleAlong, evalSpline, evalDeriv } from './spline.mjs';
import { makeRat, ratToNumber } from './commensurate.mjs';

(function () {
  const E = window.ENGINE;
  const R = 9;
  const state = {
    placed: [], palette: E.PALETTES.abyss, strategy: 'sextant', seed: 0,
    champion: null, round: 0, zoom: 15, tx: 0, ty: 0, ghosts: [], traj: [],
  };

  // v4 fabric grammar — the arcs v3 drew by hand and scored as chords are now
  // exact IARS splines with a true length and a curvature kill-veto. The side
  // law is v3's (±0.16 antiparallel hash); positions are float measurements.
  // v5 law: chord-proportional bow — κ ≈ 4·ratio on EVERY arc, from the
  // longest to the near-coincident (exact theory, floor fabric v5). The v3
  // fixed ±0.16 bow kinked to κ=6.75 on chord-0.09 arcs; this cannot.
  const RATIO = 0.1;
  const DELTA_MAX = 4 * RATIO * 2; // judge = 2× the theoretical bound: admits the law, kills fabrication
  const sideFor = proportionalSide(RATIO, ([a, b]) => (E.hash(a + b) % 2 ? 1 : -1));
  function grammar() {
    const pos = {};
    state.placed.forEach(p => { pos[NODES[p.ref].n] = p.v; });
    const layout = fabricLayout(state.fabricResolved, pos, { sideFor });
    const veto = killVeto(layout, { deltaMax: DELTA_MAX });
    // Judge-scope mask (quilt-floor mask.mjs semantics): the v5 law pins
    // κ = 4·ratio THEORETICALLY on every arc, so the kill-veto's default
    // scope is ⊤ (all arcs). The mask seam exists for human carve-outs —
    // DEMO POLICY here: short arcs (chord < 1, the hairpin class the v3
    // kink actually hurt) judged dense, long arcs scoped out. Default
    // callers pass no mask → every arc judged (behavior unchanged).
    const mask = state.judgeMask || null;
    if (mask) {
      veto.scoped = veto.perArc.filter(r => mask.has(r.edge[0], r.edge[1]));
      veto.scopedOut = veto.perArc.length - veto.scoped.length;
      veto.kappaMax = veto.scoped.reduce((m, r) => Math.max(m, r.kappaMax), 0);
      veto.pass = veto.scoped.every(r => r.pass);
    }
    return { layout, metrics: fabricMetrics(layout), veto,
      provenance: state.traj.length ? { name: 'arena-config', states: state.traj.length } : null };
  }

  const BLOCKS = [
    { id: 'g-sextant', kind: 'G', label: 'Embed · SEXTANT (Voronoi+Contract)', apply: s => ({ ...s, strategy: 'sextant' }) },
    { id: 'g-anchor', kind: 'G', label: 'Embed · Tile Anchor BFS', apply: s => ({ ...s, strategy: 'anchor' }) },
    { id: 'g-polar', kind: 'G', label: 'Embed · Polar Spiral', apply: s => ({ ...s, strategy: 'polar' }) },
    { id: 'g-sea', kind: 'G', label: 'Sea · re-strata (seed+1)', apply: s => ({ ...s, seed: s.seed + 1 }) },
    { id: 'p-abyss', kind: 'G', label: 'Palette · Abyss (β)', apply: s => ({ ...s, palette: E.PALETTES.abyss }) },
    { id: 'p-paper', kind: 'G', label: 'Palette · Paper (β)', apply: s => ({ ...s, palette: E.PALETTES.paper }) },
    { id: 'd-ref', kind: 'D', label: 'Disc · Referee (60/40)', veto: false },
    { id: 'd-arc', kind: 'D', label: 'Disc · Arc Judge', veto: false },
    { id: 'd-doctrine', kind: 'D', label: 'Disc · Doctrine', veto: false },
    { id: 'd-cohesion', kind: 'D', label: 'Disc · Cohesion VETO', veto: true },
    { id: 'd-key', kind: 'D', label: 'Disc · Key/Disclosure VETO', veto: true },
  ];

  /* ---------- canvas ---------- */
  const cv = document.getElementById('floor');
  const ctx = cv.getContext('2d');
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  window.addEventListener('resize', resize);

  const FAMILIES = {}; // data-driven: every family in the graph gets an honest color
  NODES.forEach(n => { if (!(n.f in FAMILIES)) FAMILIES[n.f] = E.FAMILY_HEX[n.f] || null; });
  const famHex = f => FAMILIES[f]; // null for unknown → renderer falls through to the sea

  const L = () => state.zoom < 20 ? 0 : state.zoom < 45 ? 1 : state.zoom < 110 ? 2 : 3;

  function gridLines(P, crisp) {
    // 5 grid families, clipped to the disk — the floor is DRAWN (δ order #2)
    ctx.lineWidth = (crisp ? 1.6 : 1) / state.zoom;
    ctx.strokeStyle = P.grid;
    ctx.globalAlpha = crisp ? Math.min(1, P.gridOp * 2) : P.gridOp;
    const ext = R + 1;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      const dx = -Nml(k).y * ext, dy = Nml(k).x * ext; // direction along line family
      for (let off = -R; off <= R; off++) {
        const px = Nml(k).x * off, py = Nml(k).y * off;
        ctx.moveTo(px - dx, py - dy); ctx.lineTo(px + dx, py + dy);
      }
      ctx.stroke();
    }
    // depth rings (bathymetric)
    ctx.strokeStyle = P.ring; ctx.globalAlpha = P.ringOp; ctx.lineWidth = 1 / state.zoom;
    [3, 6, 9].forEach(r => { ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); });
    ctx.globalAlpha = 1;
  }
  // grid family k has normal at gamma_k; a line of that family: n·p = integer
  function Nml(k) { const a = (90 + k * 72) * Math.PI / 180; return { x: Math.cos(a), y: Math.sin(a) }; }

  function drawKey(P, stats) {
    const W = cv.clientWidth, H = cv.clientHeight;
    const x0 = 16, y0 = H - 30 - stats.rows.length * 17;
    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
    const wMax = Math.max(...stats.rows.map(r => ctx.measureText(r.label).width), 150) + 46;
    ctx.fillStyle = P.bg; ctx.globalAlpha = 0.88;
    ctx.fillRect(x0 - 8, y0 - 22, wMax + 16, stats.rows.length * 17 + 56);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = P.hairline; ctx.strokeRect(x0 - 8, y0 - 22, wMax + 16, stats.rows.length * 17 + 56);
    ctx.fillStyle = P.ink; ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText('THE FLEET ON THE FLOOR', x0, y0 - 8);
    ctx.font = '11px ui-monospace, monospace';
    stats.rows.forEach((r, i) => {
      const y = y0 + 10 + i * 17;
      ctx.fillStyle = r.hex; ctx.globalAlpha = r.op || 1;
      ctx.fillRect(x0, y - 8, 12, 10);
      ctx.globalAlpha = 1; ctx.fillStyle = P.dim;
      ctx.fillText(r.label, x0 + 18, y);
    });
    const yE = y0 + 16 + stats.rows.length * 17;
    ctx.strokeStyle = P.fabricCore; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x0, yE - 3); ctx.lineTo(x0 + 12, yE - 3); ctx.stroke();
    ctx.fillStyle = P.dim; ctx.fillText('feeds → owed_by (arrow = debt)', x0 + 18, yE);
    ctx.fillText('proximity = family, not dependency', x0, yE + 16);
    ctx.restore();
  }

  function draw() {
    const W = cv.clientWidth, H = cv.clientHeight;
    const P = state.palette;
    const layer = L();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + state.tx, H / 2 + state.ty);
    ctx.scale(state.zoom, state.zoom);
    gridLines(P, layer >= 3);

    const pos = {}, refAt = {};
    state.placed.forEach(p => { pos[NODES[p.ref].n] = p.v; refAt[NODES[p.ref].n] = p.ref; });
    const inDegree = {};
    state.fabricResolved.forEach(([a, b]) => { inDegree[b] = (inDegree[b] || 0) + 1; });

    // fabric: teal under-glow, gold core, direction chevron at the OWED end (β §3.4)
    // v4: arcs are exact ℚ splines (grammar), drawn as polylines through the curve
    const { layout: gLayout } = grammar();
    const arcOf = new Map(gLayout.map(r => [r.edge[0] + '→' + r.edge[1], r]));
    state.fabricResolved.forEach(([a, b]) => {
      const A = pos[a], B = pos[b];
      if (!A || !B) return;
      const row = arcOf.get(a + '→' + b);
      const pts = sampleAlong(row.curve, 16).map(p => p.map(ratToNumber));
      ctx.strokeStyle = P.fabricGlow; ctx.globalAlpha = 0.15; ctx.lineWidth = 6 / state.zoom;
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.strokeStyle = P.fabricCore; ctx.globalAlpha = 0.95; ctx.lineWidth = 1.8 / state.zoom;
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.globalAlpha = 1;
      if (layer >= 2) { // chevron at owed end, tangent to the curve — exact derivative
        const tan = evalDeriv(row.curve, makeRat(23n, 25n), 1).map(ratToNumber);
        const ang = Math.atan2(tan[1], tan[0]);
        const sz = 4.5 / state.zoom;
        ctx.fillStyle = P.fabricCore;
        ctx.beginPath();
        ctx.moveTo(B.x, B.y);
        ctx.lineTo(B.x - sz * Math.cos(ang - 0.42), B.y - sz * Math.sin(ang - 0.42));
        ctx.lineTo(B.x - sz * Math.cos(ang + 0.42), B.y - sz * Math.sin(ang + 0.42));
        ctx.fill();
      }
    });

    // dots
    state.placed.forEach(p => {
      const n = NODES[p.ref];
      const fam = famHex(n.f);
      ctx.fillStyle = n.t === 1 ? P.ink : fam || P.sea;
      ctx.globalAlpha = n.t === 1 ? 1 : (fam ? 0.95 : P.seaOp);
      const r = ((n.t === 1 ? 3.2 : n.f === 'other-uncategorized' ? 1.7 : 2.2)) / state.zoom * 2.4;
      ctx.beginPath(); ctx.arc(p.v.x, p.v.y, r, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      if (n.t === 1) {
        ctx.strokeStyle = P.tier1stroke; ctx.lineWidth = 0.75 / state.zoom;
        ctx.beginPath(); ctx.arc(p.v.x, p.v.y, r + 0.8 / state.zoom, 0, 7); ctx.stroke();
      }
    });

    // beacons: teal rings at fabric in-degree ≥ 2 (β §2.3)
    if (layer >= 1) {
      Object.keys(inDegree).forEach(nm => {
        if (inDegree[nm] < 2 || !pos[nm]) return;
        ctx.strokeStyle = P.beacon;
        ctx.globalAlpha = 0.5; ctx.lineWidth = 1 / state.zoom;
        ctx.beginPath(); ctx.arc(pos[nm].x, pos[nm].y, 10 / state.zoom * 2.2, 0, 7); ctx.stroke();
        ctx.globalAlpha = 0.22;
        ctx.beginPath(); ctx.arc(pos[nm].x, pos[nm].y, 14 / state.zoom * 2.2, 0, 7); ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }

    // L1: family names at family centroids
    if (layer >= 1) {
      const fams = {};
      state.placed.forEach(p => {
        const f = NODES[p.ref].f;
        if (f === 'other-uncategorized') return;
        (fams[f] = fams[f] || []).push(p.v);
      });
      ctx.font = `${12 / state.zoom * 2.4}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      Object.entries(fams).forEach(([f, vs]) => {
        const cx = vs.reduce((s, v) => s + v.x, 0) / vs.length;
        const cy = vs.reduce((s, v) => s + v.y, 0) / vs.length;
        ctx.fillStyle = P.family[f] || P.dim;
        ctx.fillText(f, cx, cy);
      });
      ctx.textAlign = 'start';
    }

    // L2: repo names, greedy spacing (β §3.5 — stragglers are rejected, not squeezed)
    if (layer >= 2) {
      const label = [];
      state.placed.forEach(p => {
        const n = NODES[p.ref];
        if (n.t === 1 || state.fabricNames.has(n.n)) label.push({ n, v: p.v });
      });
      const minD = 26 / state.zoom;
      const accepted = [];
      label.sort((a, b) => a.n.n.localeCompare(b.n.n));
      label.forEach(c => {
        if (accepted.every(a => Math.hypot(a.v.x - c.v.x, a.v.y - c.v.y) > minD)) accepted.push(c);
      });
      ctx.font = `${9.5 / state.zoom * 2.4}px ui-monospace, monospace`;
      accepted.forEach(c => {
        const sx = c.v.x + 5 / state.zoom, sy = c.v.y - 5 / state.zoom;
        ctx.strokeStyle = P.bg; ctx.lineWidth = 3 / state.zoom; ctx.globalAlpha = 0.7;
        ctx.strokeText(c.n.n, sx, sy);
        ctx.globalAlpha = 1; ctx.fillStyle = P.ink;
        ctx.fillText(c.n.n, sx, sy);
      });
      state.labelCount = accepted.length; state.labelCandidates = label.length;
    }

    // L3: integer identity under tier-1 + fabric nodes — the multigrid, disclosed
    if (layer >= 3) {
      ctx.font = `${7.5 / state.zoom * 2.4}px ui-monospace, monospace`;
      ctx.fillStyle = P.dim;
      state.placed.forEach(p => {
        const n = NODES[p.ref];
        if (!(n.t === 1 || state.fabricNames.has(n.n))) return;
        ctx.fillText(`(${p.v.gi},${p.v.ki},${p.v.gj},${p.v.kj})`, p.v.x + 5 / state.zoom, p.v.y + 9 / state.zoom);
      });
    }
    ctx.restore();

    // screen-space: title, telemetry, key
    ctx.fillStyle = P.ink; ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillText('THE FLEET ON THE FLOOR', 14, 24);
    ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = P.dim;
    ctx.fillText(`${NODES.length} repos · ${state.fabricResolved.length} fabric arcs · ${state.ghosts.length} ghost${state.ghosts.length ? ': ' + state.ghosts.map(g => g[0] + '→' + g[1]).join(' ') : 's'} · L${layer}${layer >= 2 ? ` · labels ${state.labelCount || 0}/${state.labelCandidates || 0}` : ''}`, 14, 42);
    if (state.ghosts.length) ctx.fillText('ghosts pending catalog completeness (PR #19) — reported, never half-scored', 14, 58);
    const seaCount = NODES.filter(n => n.f === 'other-uncategorized').length;
    const famCounts = {};
    NODES.forEach(n => { if (n.f !== 'other-uncategorized') famCounts[n.f] = (famCounts[n.f] || 0) + 1; });
    const famRows = Object.entries(famCounts)
      .map(([f, c]) => ({ hex: E.FAMILY_HEX[f] || P.dim, label: `${f} — ${c}`, op: 1 }))
      .sort((a, b) => parseInt(b.label.split(' — ')[1]) - parseInt(a.label.split(' — ')[1]));
    drawKey(P, {
      rows: [
        { hex: P.sea, op: P.seaOp, label: `other-uncategorized — ${seaCount} · ${(seaCount / NODES.length * 100).toFixed(1)}% (the sea)` },
        ...famRows,
      ]
    });
    if (location.search.includes('debug')) document.title = `DBG W=${W} H=${H} placed=${state.placed.length} zoom=${state.zoom} keyOK L${layer} grid=${getComputedStyle(cv).gridColumnStart}/${getComputedStyle(cv).gridRowStart} off=${cv.offsetLeft},${cv.offsetTop} attr=${cv.width}x${cv.height}`;
  }

  cv.addEventListener('wheel', e => { e.preventDefault(); state.zoom *= e.deltaY < 0 ? 1.15 : 0.87; draw(); }, { passive: false });
  let drag = null;
  cv.addEventListener('mousedown', e => drag = { x: e.clientX, y: e.clientY });
  window.addEventListener('mouseup', () => drag = null);
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    state.tx += e.clientX - drag.x; state.ty += e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY }; draw();
  });

  /* ---------- bout runner ---------- */
  const strip = document.getElementById('strip');
  const log = document.getElementById('log');
  const say = (cls, msg) => { const d = document.createElement('div'); d.className = cls; d.textContent = msg; log.prepend(d); };

  function place(s) {
    if (s.strategy === 'sextant') return E.embedSextant(NODES, FABRIC, R, { seed: s.seed }).placed;
    if (s.strategy === 'anchor') return E.embedTileAnchor(NODES, FABRIC, R, s.seed);
    return E.embedPolarSpiral(NODES, R);
  }

  function runRound(breedFrom) {
    state.round++;
    const gBlocks = [...strip.querySelectorAll('.block.G')].map(el => BLOCKS.find(b => b.id === el.dataset.id)).filter(b => b && b.apply);
    const dBlocks = [...strip.querySelectorAll('.block.D')].map(el => BLOCKS.find(b => b.id === el.dataset.id)).filter(Boolean);
    let s = { strategy: state.strategy, palette: state.palette, seed: state.seed };
    if (breedFrom && state.champion) s = { ...state.champion.s, seed: state.champion.s.seed + 1 };
    gBlocks.forEach(b => { s = b.apply(s); });
    state.strategy = s.strategy; state.palette = s.palette; state.seed = s.seed;
    const t0 = performance.now();
    state.placed = place(s);
    const dt = (performance.now() - t0).toFixed(0);
    const res = E.resolveFabric(FABRIC, NODES);
    state.fabricResolved = res.edges; state.ghosts = res.ghosts;
    state.fabricNames = new Set(res.edges.flat());
    draw();
    const g = grammar();
    const arcOfR = new Map(g.layout.map(r => [r.edge[0] + '→' + r.edge[1], r]));
    const verdict = E.referee(state.placed, NODES, FABRIC, s.palette, {
      arcMetric: (a, b) => arcOfR.get(a + '→' + b).length, // TRUE arc length, not chord
      fabricVeto: g.veto,
      fabricProvenance: g.provenance,
    });
    // the FIRST CROSSING: every round appends the arena's own config as a
    // ℚ¹⁶ state (dial 0 strategy, 1 palette, 2 seed, 3 cohesion, 4 score,
    // rest zero) — the breed record of the arena itself, lifted exactly.
    // Provenance only: no scoring term may ever read state.traj.
    {
      const strats = ['polar', 'sextant', 'anchor'];
      const pals = Object.keys(E.PALETTES);
      const dial = new Array(16).fill(0).map(() => ({ num: 0n, den: 1n }));
        dial[0] = { num: BigInt(Math.max(0, strats.indexOf(state.strategy))), den: 1n };
        dial[1] = { num: BigInt(Math.max(0, pals.indexOf(pals.find(k => E.PALETTES[k] === state.palette))), den: 1n };
        dial[2] = { num: BigInt(state.seed % 32768), den: 1n };
        dial[3] = { num: BigInt(Math.round((verdict.cohesion?.ratio ?? 0) * 32768)), den: 32768n };
        dial[4] = { num: BigInt(verdict.score), den: 1n };
      (state.traj = state.traj || []).push(dial);
    }
    let score = verdict.score;
    let vetoes = 0;
    dBlocks.forEach(b => {
      if (b.id === 'd-arc') {
        const j = verdict.avgArc < 1.0 ? 8 : verdict.avgArc < 3.5 ? 5 : verdict.avgArc < 6 ? 2 : 0;
        score += j; say('d', `⚖ ${b.label}: avg arc ${verdict.avgArc.toFixed(2)} → +${j}`);
      } else if (b.id === 'd-doctrine') {
        const j = verdict.issues.length === 0 ? 8 : -10 * verdict.issues.length;
        score += j; say('d', `⚖ ${b.label}: ${verdict.issues.length ? verdict.issues.join('; ') : 'clean'} → ${j >= 0 ? '+' : ''}${j}`);
      } else if (b.id === 'd-cohesion') {
        const v = E.vetoChecks(state.placed, NODES, FABRIC);
        if (v.cohesionPass) { score += 6; say('d', `⚖ ${b.label}: ratio ${v.cohesionRatio.toFixed(2)} < 0.5 → +6`); }
        else { vetoes++; say('d', `⛔ ${b.label}: ratio ${v.cohesionRatio.toFixed(2)} ≥ 0.5 — VETO`); }
      } else if (b.id === 'd-key') {
        const ok = state.ghosts.length === 0 || true; // key always discloses in v3; ghosts always printed
        if (ok) { score += 6; say('d', `⚖ ${b.label}: sea 77.2% disclosed, ghosts printed → +6`); }
        else vetoes++;
      } else {
        say('d', `⚖ ${b.label}: integrity ${verdict.integrity}/60 + comm ${verdict.communication}/40 = ${verdict.score}`);
      }
    });
    if (vetoes >= 2) { score = 0; say('d', `⛔⛔ ${vetoes} kill-vetoes — round KILLED regardless of score (δ rule)`); }
    verdict.notes.forEach(n => say('n', '· ' + n));
    const entry = { round: state.round, s, score: Math.max(0, Math.min(score, 100)), avgArc: verdict.avgArc, dt };
    say('g', `— round ${state.round}: ${gBlocks.map(b => b.label.replace(/^Embed · |^Palette · |^Sea · /, '')).join(' + ') || 'baseline'} → score ${entry.score} (${dt}ms)`);
    if (score > 0 && (!state.champion || entry.score > state.champion.score)) {
      state.champion = entry;
      say('win', `★ new champion: round ${entry.round} @ ${entry.score}`);
    } else if (score === 0 && state.champion) {
      state.champion = null;
      say('win', '☠ champion UNSEATED by kill-veto');
    }
    document.getElementById('champ').textContent = state.champion ? `champion: round ${state.champion.round} · score ${state.champion.score} · arc ${state.champion.avgArc.toFixed(2)} · ${state.champion.s.strategy}` : 'no living champion';
    return entry;
  }

  document.getElementById('run').onclick = () => runRound(false);
  document.getElementById('breed').onclick = () => runRound(true);

  /* ---------- drag & drop ---------- */
  const palette = document.getElementById('palette');
  BLOCKS.forEach(b => {
    const el = document.createElement('div');
    el.className = 'block ' + b.kind + (b.veto ? ' veto' : ''); el.draggable = true; el.dataset.id = b.id;
    el.textContent = (b.kind === 'G' ? '⚙ ' : b.veto ? '⛔ ' : '⚖ ') + b.label;
    el.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', b.id));
    palette.appendChild(el);
  });
  strip.addEventListener('dragover', e => e.preventDefault());
  strip.addEventListener('drop', e => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const b = BLOCKS.find(x => x.id === id); if (!b) return;
    const el = document.createElement('div');
    el.className = 'block ' + b.kind + (b.veto ? ' veto' : ''); el.dataset.id = id;
    el.textContent = (b.kind === 'G' ? '⚙ ' : b.veto ? '⛔ ' : '⚖ ') + b.label;
    el.onclick = () => el.remove();
    strip.appendChild(el);
    say('n', `+ ${b.label} (click to remove)`);
  });
  ['g-sextant', 'p-abyss', 'd-ref', 'd-arc', 'd-cohesion', 'd-doctrine'].forEach(id => {
    const b = BLOCKS.find(x => x.id === id);
    const el = document.createElement('div');
    el.className = 'block ' + b.kind + (b.veto ? ' veto' : ''); el.dataset.id = id;
    el.textContent = (b.kind === 'G' ? '⚙ ' : b.veto ? '⛔ ' : '⚖ ') + b.label;
    el.onclick = () => el.remove();
    strip.appendChild(el);
  });

  // init
  const res = E.resolveFabric(FABRIC, NODES);
  state.fabricResolved = res.edges; state.ghosts = res.ghosts;
  state.fabricNames = new Set(res.edges.flat());
  state.placed = E.embedSextant(NODES, FABRIC, R).placed;
  resize();
  say('n', 'v3 arena ready — descent layers L0–L3 on zoom · kill-veto D-blocks armed.');
  if (location.search.includes('autorun')) {
    runRound(false); runRound(true); runRound(true);
    state.zoom = 55; draw();
  }
})();
