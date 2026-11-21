/* =====================================================================
   Vis 3 - "Where should I buy?" ranker          owner: Osama Mohammed
   ---------------------------------------------------------------------
   Question: given my budget, home type and priorities, which
   communities fit me best, and why?
   A LineUp-style ranking table (Gratzl et al., 2013): each row is a
   community; the stacked bar is its score, built from 8 criteria the
   user weights with sliders. A map shows the top 10 and a dot plot
   shows how many real sales fit the budget.

   The file reads top to bottom in the same five steps as Vis 1 and Vis 2:
     STEP 1  Load the data
     STEP 2  State, scoring and scales
     STEP 3  Draw (data join: one <g> row per community)
     STEP 4  Interactions (presets, sliders, buttons, hover, click, sort)
     STEP 5  Update (re-score, re-sort, animate rows into place)
   Number formats, the tooltip and button groups live in ../assets/helpers.js
   ===================================================================== */

// ---------------------------------------------------------------------
// Fixed settings
// ---------------------------------------------------------------------
// One fixed colour per criterion, always in this order
const COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

// The 8 criteria. higher: true = a bigger raw value is better.
// raw: true = keep the raw 0..1 share instead of a percentile rank.
const CRIT = [
  { k: "fit", name: "Budget fit", hint: "share of sales within budget", fmt: (v) => pct(v), higher: true, raw: true },
  { k: "value", name: "Value", hint: "low median AED/m²", fmt: (v) => fmt(v) + "/m²", higher: false },
  { k: "growth", name: "Momentum", hint: "real price growth since 2018-20 (after inflation)", fmt: (v) => pctSigned(v) + " real", higher: true },
  { k: "liq", name: "Liquidity", hint: "many recent sales", fmt: (v) => fmt(v) + " sales", higher: true },
  { k: "ready", name: "Ready / Off-plan", hint: "share matching your preference", fmt: (v) => pct(v), higher: true },
  { k: "metro", name: "Metro access", hint: "km to nearest station", fmt: (v) => v.toFixed(1) + " km", higher: false },
  { k: "amen", name: "Amenities", hint: "Foursquare venues", fmt: (v, c) => (c && c.venueCap ? "100+" : fmt(v)) + " venues", higher: true },
  { k: "estab", name: "Established", hint: "residents per km² (2019)", fmt: (v) => fmt(v) + "/km²", higher: true },
];

// Personas: home type, budget, ready/off-plan, and one weight (0-5) per criterion
const PRESETS = {
  "First-time buyer": { seg: "1BR", budget: 1.2e6, pref: "ready", w: [5, 3, 1, 2, 3, 4, 3, 1] },
  Family: { seg: "Villa", budget: 4e6, pref: "ready", w: [5, 2, 1, 1, 4, 1, 2, 3] },
  Investor: { seg: "1BR", budget: 1.5e6, pref: "offplan", w: [3, 4, 5, 5, 1, 2, 1, 0] },
  "Equal weights": { seg: "All", budget: 2e6, pref: "ready", w: [1, 1, 1, 1, 1, 1, 1, 1] },
};

// Table layout (pixels)
const RH = 23; //   row height
const HEAD = 46; // header height
const COL = { rank: 0, name: 58, score: 226, why: 392, attrs: 584 }; // column x positions
const SW = 128; //  width of a full score bar (score = 1)
const AW = 39, AG = 6; // width of one criterion cell and the gap between cells
const TW = COL.attrs + CRIT.length * (AW + AG); // table width

// Words for the "Strongest reasons" column
const REASON = {
  fit: "fits budget", value: "good value", growth: "rising prices", liq: "easy resale",
  ready: null, metro: "near metro", amen: "lots nearby", estab: "established",
};

// =====================================================================
// STEP 1, Load the data
// vis3_ranker.json is made by prep/prepare_data.py: one record per
// community (growth after inflation, metro distance, venues, density)
// plus every cleaned 2024-26 sale as [community, type, price, m², off-plan].
// =====================================================================
Promise.all([
  d3.json("../data/vis3_ranker.json"),
  d3.json("../data/communities.geojson"),
]).then(([data, geo]) => start(data, geo));

function start(data, geo) {
  // =====================================================================
  // STEP 2, State, scoring and scales
  // =====================================================================

  // seg: home type; budget in AED; pref: "ready" | "offplan"; w: 8 weights
  // sortBy: "score" or a criterion key; selected/hover: community codes
  const state = {
    seg: "1BR", budget: 1.2e6, pref: "ready", w: PRESETS["First-time buyer"].w.slice(),
    sortBy: "score", showAll: false, selected: null, hover: null,
  };
  let userPicked = false; // follow the #1 community until the user clicks a row

  const SEGS = ["All"].concat(data.segs);
  const comms = data.comms.map((c) => ({ ...c, sales: [] }));
  const byC = new Map(comms.map((c) => [c.c, c]));
  data.sales.forEach(([c, seg, price, m2, op]) => byC.get(c).sales.push({ seg, price, m2, op }));

  // --- scales -------------------------------------------------------------
  // Budget slider: a LOG scale, so AED 300k-1M gets as much slider room as 3M-10M.
  const budgetScale = d3.scaleLog().domain([3e5, 2e7]).range([0, 1000]);
  // Score 0..1 -> bar length in pixels
  const sx = d3.scaleLinear().domain([0, 1]).range([0, SW]);

  const reasonOf = (k) => (k === "ready" ? (state.pref === "ready" ? "mostly ready" : "mostly off-plan") : REASON[k]);
  const segIndex = (s) => (s === "All" ? null : data.segs.indexOf(s));

  // --- scoring -------------------------------------------------------------
  // 1. raw value of each criterion for each community
  // 2. turn it into a percentile rank 0..1 (robust to outliers)
  // 3. score = weighted average of the 8 ranks
  function compute() {
    const si = segIndex(state.seg);
    comms.forEach((c) => {
      const ss = si === null ? c.sales : c.sales.filter((x) => x.seg === si);
      c.cur = ss;
      c.n = ss.length;
      c.raw = {
        fit: ss.length ? ss.filter((x) => x.price <= state.budget).length / ss.length : null,
        value: ss.length ? d3.median(ss, (x) => x.price / x.m2) : null,
        growth: c.growthReal, // inflation-adjusted with the World Bank UAE CPI (outside data)
        liq: ss.length,
        ready: ss.length ? (state.pref === "ready" ? 1 - d3.mean(ss, (x) => x.op) : d3.mean(ss, (x) => x.op)) : null,
        metro: c.metroKm,
        amen: c.venues,
        estab: c.density,
      };
      c.ranked = c.n >= 10; // too few sales of this type -> listed, not ranked
    });

    const R = comms.filter((c) => c.ranked);
    CRIT.forEach((cr) => {
      const sorted = R.map((c) => c.raw[cr.k]).filter((v) => v != null).sort(d3.ascending);
      R.forEach((c) => {
        c.s = c.s || {};
        const v = c.raw[cr.k];
        if (v == null) {
          c.s[cr.k] = { v: 0.5, missing: true }; // unknown -> neutral, drawn hatched
          return;
        }
        let p;
        if (cr.raw) {
          p = v;
        } else {
          // percentile rank; ties share the average position
          const lo = d3.bisectLeft(sorted, v), hi = d3.bisectRight(sorted, v);
          p = sorted.length > 1 ? (lo + hi - 1) / 2 / (sorted.length - 1) : 0.5;
        }
        if (!cr.higher) p = 1 - p;
        c.s[cr.k] = { v: p, missing: false };
      });
    });

    const totalWeight = d3.sum(state.w) || 1;
    R.forEach((c) => {
      c.parts = CRIT.map((cr, i) => (state.w[i] * c.s[cr.k].v) / totalWeight); // one segment per criterion
      c.score = d3.sum(c.parts);
    });

    const sortKey = state.sortBy === "score" ? (c) => c.score : (c) => c.s[state.sortBy].v;
    R.sort((a, b) => d3.descending(sortKey(a), sortKey(b)) || d3.descending(a.n, b.n));
    R.forEach((c, i) => { c.prevRank = c.rank; c.rank = i + 1; });
    comms.filter((c) => !c.ranked).forEach((c) => { c.prevRank = c.rank; c.rank = null; });
    return R;
  }

  // =====================================================================
  // STEP 3, Draw
  // =====================================================================

  // --- controls built from data --------------------------------------------
  d3.select("#segbtns").selectAll("button").data(SEGS).join("button")
    .attr("data-v", (d) => d).text((d) => (d === "All" ? "All homes" : d));
  d3.select("#presets").selectAll("button").data(Object.keys(PRESETS)).join("button")
    .attr("class", "chip").text((d) => d);
  d3.select("#weights").selectAll("div").data(CRIT).join("div").attr("class", "w")
    .html((d, i) => `<div class="top"><span><span class="sw2" style="background:${COLORS[i]}"></span><span class="wname">${d.name}</span></span><span class="num" id="wv${i}"></span></div>
      <input type="range" min="0" max="5" step="1" id="w${i}"><div class="hint">${d.hint}</div>`);

  // --- table frame -------------------------------------------------------------
  const table = d3.select("#table").attr("width", TW);
  const hatch = table.append("defs").append("pattern").attr("id", "hatch") // for missing values
    .attr("patternUnits", "userSpaceOnUse").attr("width", 4).attr("height", 4).attr("patternTransform", "rotate(45)");
  hatch.append("rect").attr("width", 4).attr("height", 4).attr("fill", "#fff");
  hatch.append("line").attr("y2", 4).attr("stroke", "#b9b6ad").attr("stroke-width", 2);
  const head = table.append("g");
  const body = table.append("g").attr("transform", `translate(0,${HEAD})`);

  // --- map frame -----------------------------------------------------------------
  const mapSvg = d3.select("#map");
  const proj = d3.geoMercator().fitExtent([[4, 4], [362, 326]], {
    type: "MultiPoint", coordinates: [[55.03, 24.9], [55.47, 25.3]],
  });
  const path = d3.geoPath(proj);
  mapSvg.append("clipPath").attr("id", "mclip").append("rect").attr("width", 366).attr("height", 330);
  const mapG = mapSvg.append("g").attr("clip-path", "url(#mclip)");
  const baseFill = (code) => (byC.has(code) ? "#e2e0d9" : "#efeee9");
  const polys = mapG.append("g").selectAll("path").data(geo.features).join("path")
    .attr("d", path).attr("fill", (f) => baseFill(f.properties.c)).attr("stroke", "#fff").attr("stroke-width", 0.6);
  drawMetroLines();
  const markers = mapG.append("g");

  function drawMetroLines() {
    const toXY = (d) => proj([d[2], d[1]]); // d = [code, lat, lon]
    const lineOf = (pts) => d3.line()(pts.map(toXY));
    const L = data.metroLines;
    const redMain = L.Red.filter((d) => +d[0].slice(1) < 70);
    const branch = [L.Red.find((d) => d[0] === "R38")].concat(L.Red.filter((d) => +d[0].slice(1) >= 70)).concat(L.Expo);
    Object.keys(L).forEach((k) => {
      if (k === "Expo") return; // drawn as part of the Red branch
      if (k === "Red") {
        mapG.append("path").attr("d", lineOf(redMain)).attr("stroke", "var(--red-line)").attr("stroke-width", 2).attr("fill", "none");
        mapG.append("path").attr("d", lineOf(branch)).attr("stroke", tint("#e34948", 0.45))
          .attr("stroke-width", 2).attr("fill", "none");
        return;
      }
      mapG.append("path").attr("d", lineOf(L[k])).attr("stroke", "var(--green-line)").attr("stroke-width", 2).attr("fill", "none");
    });
  }

  // =====================================================================
  // STEP 4, Interactions
  // Every handler changes `state`, then calls update().
  // =====================================================================

  // Persona chips: load a whole preset
  d3.selectAll("#presets .chip").on("click", (event, name) => {
    const p = PRESETS[name];
    Object.assign(state, { seg: p.seg, budget: p.budget, pref: p.pref, w: p.w.slice(), sortBy: "score" });
    d3.selectAll("#presets .chip").classed("on", (d) => d === name);
    syncControls();
    update();
  });

  // Weight sliders (0-5). Moving one means "custom", so no preset is highlighted.
  CRIT.forEach((d, i) => {
    d3.select("#w" + i).on("input", function () {
      state.w[i] = +this.value;
      clearPreset();
      syncControls();
      update();
    });
  });

  // Budget slider: slider position -> AED via the log scale, rounded to 10k
  d3.select("#budget").on("input", function () {
    state.budget = Math.round(budgetScale.invert(+this.value) / 1e4) * 1e4;
    syncControls();
    update();
  });

  // Buttons: home type, ready / off-plan
  onButtonGroupClick((key, value) => {
    state[key] = value;
    clearPreset();
    syncControls();
    update();
  });

  d3.select("#toggleAll").on("click", () => {
    state.showAll = !state.showAll;
    update();
  });

  // Hover a row or map marker: highlight it in both places
  function onHover(event, d) {
    state.hover = d.c;
    linkHover();
    showTip(event, rowTip(d));
  }
  function onLeave() {
    state.hover = null;
    linkHover();
    hideTip();
  }
  // Click a row or marker: show it in the budget check
  function onPick(event, d) {
    userPicked = true;
    state.selected = d.c;
    drawDetail();
    body.selectAll("g.row").classed("sel", (r) => r.c === state.selected);
  }
  // Click a column header: sort by it
  function sortBy(key) {
    state.sortBy = key;
    update();
  }

  function clearPreset() {
    d3.selectAll("#presets .chip").classed("on", false);
  }

  // Put every control back in line with `state`
  function syncControls() {
    markButtonGroups(state);
    d3.select("#budget").property("value", budgetScale(state.budget));
    d3.select("#budgetlbl").text(aed(state.budget));
    CRIT.forEach((d, i) => {
      d3.select("#w" + i).property("value", state.w[i]);
      d3.select("#wv" + i).text(state.w[i]);
    });
  }

  // --- tooltip text --------------------------------------------------------
  function rowTip(d) {
    const typeWord = state.seg === "All" ? "" : state.seg + " ";
    let h = `<div class="t-title">${d.rank ? "#" + d.rank + " " : ""}${d.known}</div><div class="t-note" style="margin:0 0 4px">DLD: ${d.name}, ${d.n} ${typeWord}sales 2024-26</div>`;
    if (!d.ranked) return h + `<div class="t-note">Fewer than 10 sales of this home type, so not ranked.</div>`;
    CRIT.forEach((cr, i) => {
      const v = d.raw[cr.k];
      const shown = v == null ? "unknown" : cr.fmt(v, d);
      h += `<div class="t-row"><span><span class="sw2" style="background:${COLORS[i]}"></span>${cr.name}</span><span>${shown} (score ${Math.round(d.s[cr.k].v * 100)})</span></div>`;
    });
    const nominal = d.growth != null ? ` Nominal growth ${pctSigned(d.growth)}.` : "";
    return h + `<div class="t-note">Score ${Math.round(d.score * 100)} / 100. Nearest station: ${d.metro}.${nominal}</div>`;
  }

  // =====================================================================
  // STEP 5, Update
  // =====================================================================
  function update() {
    const R = compute();
    drawAnswer(R);
    drawHead();
    drawTable(R);
    drawMap(R);
    // follow the #1 community unless the user picked one that is still ranked
    if (!userPicked || !state.selected || !byC.get(state.selected).ranked) state.selected = R[0] && R[0].c;
    body.selectAll("g.row").classed("sel", (r) => r.c === state.selected);
    drawDetail();
  }

  // The one-sentence answer at the top
  function drawAnswer(R) {
    const what = state.seg === "All" ? "a home"
      : state.seg === "Villa" ? "a villa or townhouse"
      : state.seg === "Studio" ? "a studio"
      : "a " + state.seg + " flat";
    const top = R.slice(0, 3).map((d) => d.known.replace(/ \(.*\)/, ""));
    const fitTop = R[0] ? Math.round(R[0].raw.fit * 100) : 0;
    d3.select("#answer").html(top.length
      ? `With ${aed(state.budget)} for ${what}, your best matches are <b>${top[0]}</b>${top[1] ? `, <b>${top[1]}</b>` : ""}${top[2] ? ` and <b>${top[2]}</b>` : ""}. In ${top[0]}, ${fitTop}% of recent sales were within your budget.`
      : `No community has enough ${state.seg} sales to rank.`);
  }

  // Column headers (clickable to sort) and the mini weight bar
  function drawHead() {
    head.selectAll("*").remove();
    head.append("text").attr("x", 4).attr("y", HEAD - 8).attr("font-size", 11).text("Rank");
    head.append("text").attr("x", COL.name).attr("y", HEAD - 8).attr("font-size", 11).text("Community");
    head.append("text").attr("x", COL.why).attr("y", HEAD - 8).attr("font-size", 11).text("Strongest reasons");
    head.append("g").attr("class", "colhead" + (state.sortBy === "score" ? " on" : ""))
      .on("click", () => sortBy("score"))
      .append("text").attr("x", COL.score).attr("y", HEAD - 8).text("Score ▾ (out of 100)");

    const SHORT = {
      fit: "Budget", value: "Value", growth: "Growth", liq: "Resale", ready: state.pref === "ready" ? "Ready" : "Off-pl.",
      metro: "Metro", amen: "Places", estab: "Settled",
    };
    CRIT.forEach((cr, i) => {
      const g = head.append("g").attr("class", "colhead" + (state.sortBy === cr.k ? " on" : ""))
        .attr("transform", `translate(${COL.attrs + i * (AW + AG)},0)`)
        .on("click", () => sortBy(cr.k))
        .on("mouseenter", (event) => showTip(event, `<div class="t-title">${cr.name}</div><div class="t-note">${cr.hint}. Click to rank by this criterion alone.</div>`))
        .on("mousemove", moveTip)
        .on("mouseleave", hideTip);
      g.append("rect").attr("y", 26).attr("width", AW).attr("height", 3).attr("rx", 1.5).attr("fill", COLORS[i])
        .attr("fill", state.w[i] ? COLORS[i] : tint(COLORS[i], 0.3));
      g.append("text").attr("y", 14).attr("font-size", 10).text(SHORT[cr.k]);
      g.append("text").attr("y", HEAD - 8).attr("font-size", 10).attr("fill", "var(--text-muted)").text(state.sortBy === cr.k ? "▾" : "");
    });
  }

  function drawTable(R) {
    const unranked = comms.filter((c) => !c.ranked);
    const rows = state.showAll ? R.concat(unranked) : R.slice(0, 25);
    const typeWord = state.seg === "All" ? "" : state.seg + " ";
    d3.select("#toggleAll").text(state.showAll ? "Show top 25 only"
      : `Show all ${comms.length} communities (${unranked.length} without enough ${typeWord}sales)`);
    table.transition().duration(300).attr("height", HEAD + rows.length * RH + 6);
    const T = d3.transition().duration(650).ease(d3.easeCubicInOut);

    // ---- THE DATA JOIN: one <g class="row"> per community ------------------
    // Key = community code, so when the ranking changes the SAME row
    // slides to its new place instead of being redrawn.
    const sel = body.selectAll("g.row").data(rows, (d) => d.c);

    // EXIT: rows that left the top 25 fade out
    sel.exit().transition(T).attr("opacity", 0).remove();

    // ENTER: new rows start below the table, invisible, and get their parts once
    const enter = sel.enter().append("g").attr("class", "row").attr("opacity", 0)
      .attr("transform", `translate(0,${(rows.length + 2) * RH})`);
    enter.append("rect").attr("class", "hl").attr("x", 0).attr("width", TW).attr("height", RH - 1).attr("rx", 4);
    enter.append("text").attr("class", "rk num").attr("x", 6).attr("y", 15.5);
    enter.append("text").attr("class", "mv num").attr("x", 28).attr("y", 15.5).attr("font-size", 10);
    enter.append("text").attr("class", "nm").attr("x", COL.name).attr("y", 15.5);
    enter.append("g").attr("class", "stack").attr("transform", `translate(${COL.score},4)`);
    enter.append("text").attr("class", "sc num").attr("y", 15.5).attr("font-size", 11);
    enter.append("text").attr("class", "why").attr("x", COL.why).attr("y", 15.5);
    enter.append("g").attr("class", "attrs");
    enter.on("mouseenter", onHover).on("mousemove", moveTip).on("mouseleave", onLeave).on("click", onPick);

    // UPDATE (enter + existing): slide every row to its rank
    const all = enter.merge(sel);
    all.classed("excluded", (d) => !d.ranked).classed("sel", (d) => d.c === state.selected);
    all.transition(T).attr("opacity", 1).attr("transform", (d, i) => `translate(0,${i * RH})`);

    all.select(".rk").text((d) => d.rank || "-");
    all.select(".mv").each(function (d) { drawRankChange(d3.select(this), d); });
    all.select(".nm").text((d) => (d.known.length > 24 ? d.known.slice(0, 23) + "…" : d.known));
    all.select(".why").each(function (d) { drawReasons(d3.select(this), d); });
    all.select(".stack").each(function (d) { drawScoreBar(d3.select(this), d, T); });
    all.select(".sc").transition(T)
      .attr("x", (d) => COL.score + (d.ranked ? sx(d.score) : 0) + 5)
      .text((d) => (d.ranked ? Math.round(d.score * 100) : "too few sales"));
    all.select(".attrs").each(function (d) { drawCriterionCells(d3.select(this), d, T); });
  }

  // ▲3 / ▼2 next to the rank after a change
  function drawRankChange(t, d) {
    if (!d.rank || !d.prevRank || d.prevRank === d.rank) {
      t.text("");
      return;
    }
    const up = d.prevRank > d.rank;
    t.text((up ? "▲" : "▼") + Math.abs(d.prevRank - d.rank)).attr("fill", up ? "#006300" : "#b8312f");
  }

  // The two criteria that add most to the score (and score at least 0.6)
  function drawReasons(t, d) {
    t.text(null);
    if (!d.ranked) return;
    const top = CRIT.map((cr, i) => ({ k: cr.k, i, p: d.parts[i], v: d.s[cr.k].v }))
      .filter((o) => o.p > 0 && o.v >= 0.6 && !d.s[o.k].missing)
      .sort((a, b) => b.p - a.p)
      .slice(0, 2);
    top.forEach((o, j) => {
      t.append("tspan").attr("fill", COLORS[o.i]).text(j ? "  ● " : "● ");
      t.append("tspan").text(reasonOf(o.k));
    });
  }

  // Stacked score bar: segment length = weight x criterion score
  function drawScoreBar(g, d, T) {
    const parts = d.ranked ? d.parts : [];
    let acc = 0;
    const segs = parts
      .map((p, i) => { const o = { i, x: acc, w: p }; acc += p; return o; })
      .filter((o) => o.w > 0);
    g.selectAll("rect")
      .data(segs, (o) => o.i)
      .join((e) => e.append("rect").attr("height", RH - 9).attr("rx", 2).attr("x", 0).attr("width", 0))
      .attr("fill", (o) => COLORS[o.i])
      .transition(T)
      .attr("x", (o) => sx(o.x))
      .attr("width", (o) => Math.max(0, sx(o.w) - 1.5));
  }

  // 8 small bars: the community's 0..1 score on each criterion (hatched = unknown)
  function drawCriterionCells(g, d, T) {
    const cells = CRIT.map((cr, i) => ({ i, cr, s: d.ranked ? d.s[cr.k] : null }));
    g.selectAll("g.cell")
      .data(cells)
      .join((e) => {
        const c = e.append("g").attr("class", "cell");
        c.append("rect").attr("class", "track").attr("y", 5).attr("height", RH - 11).attr("rx", 2).attr("fill", "#f1f0ec").attr("width", AW);
        c.append("rect").attr("class", "bar").attr("y", 5).attr("height", RH - 11).attr("rx", 2).attr("width", 0);
        return c;
      })
      .attr("transform", (c) => `translate(${COL.attrs + c.i * (AW + AG)},0)`)
      .each(function (c) {
        d3.select(this).select(".bar")
          .attr("fill", c.s && c.s.missing ? "url(#hatch)" : state.w[c.i] ? COLORS[c.i] : tint(COLORS[c.i], 0.3))
          .transition(T)
          .attr("width", c.s ? Math.max(1.5, c.s.v * AW) : 0);
      });
  }

  // Map: numbered markers for the top 10, names for the top 3
  function drawMap(R) {
    const top = R.slice(0, 10);
    const at = (d) => proj([d.lon, d.lat]);
    const mk = markers
      .selectAll("g.mk")
      .data(top, (d) => d.c)
      .join((e) => {
        const g = e.append("g").attr("class", "mk").style("cursor", "pointer");
        g.append("circle").attr("r", 10).attr("stroke", "#fff").attr("stroke-width", 2);
        g.append("text").attr("text-anchor", "middle").attr("dy", 4).attr("font-size", 10.5).attr("font-weight", 600).attr("fill", "#fff");
        g.attr("transform", (d) => `translate(${at(d)})`);
        return g;
      })
      .on("mouseenter", onHover)
      .on("mousemove", moveTip)
      .on("mouseleave", onLeave)
      .on("click", onPick);
    mk.transition().duration(500).attr("transform", (d) => `translate(${at(d)})`);
    mk.select("circle").attr("fill", "var(--text-primary)");
    mk.select("text").text((d) => d.rank);
    mk.sort((a, b) => b.rank - a.rank); // #1 drawn last = on top

    const rightSide = (d) => at(d)[0] > 230;
    markers.selectAll("text.toplab").data(top.slice(0, 3), (d) => d.c).join("text").attr("class", "toplab")
      .attr("font-size", 11.5).attr("fill", "#0b0b0b")
      .style("paint-order", "stroke").style("stroke", "#fff").style("stroke-width", "4px").style("stroke-linejoin", "round")
      .attr("pointer-events", "none")
      .attr("x", (d) => at(d)[0] + (rightSide(d) ? -14 : 14))
      .attr("text-anchor", (d) => (rightSide(d) ? "end" : "start"))
      .attr("y", (d) => at(d)[1] + 4)
      .text((d) => d.known.replace(/ \(.*\)/, ""));
    linkHover();
  }

  // Same community highlighted in the table, on the markers and on the map
  function linkHover() {
    body.selectAll("g.row").classed("hover", (d) => d.c === state.hover);
    markers.selectAll("g.mk circle")
      .attr("fill", (d) => (d.c === state.hover ? "var(--accent)" : "var(--text-primary)"))
      .attr("r", (d) => (d.c === state.hover ? 13 : 10));
    polys.attr("fill", (f) =>
      f.properties.c === state.hover ? "#b7d3f6" : f.properties.c === state.selected ? "#cde2fb" : baseFill(f.properties.c));
  }

  // Budget check: one dot per sale (Wilkinson dot plot), left of the line = within budget
  function drawDetail() {
    const c = byC.get(state.selected);
    const svg = d3.select("#dots");
    svg.selectAll("*").remove();
    if (!c) return;
    d3.select("#d-title").text(c.known);

    const ss = c.cur.slice().sort((a, b) => a.price - b.price);
    const within = ss.filter((s) => s.price <= state.budget).length;
    const typeWord = state.seg === "All" ? "" : state.seg + " ";
    d3.select("#d-sub").html(ss.length
      ? `<span class="big">${pct(within / ss.length)}</span> of ${ss.length} ${typeWord}sales in 2024-26 were at or below ${aed(state.budget)}. Median ${aed(d3.median(ss, (s) => s.price))}, ${d3.format(",.0f")(d3.median(ss, (s) => s.m2))} m².`
      : `No ${state.seg} sales recorded here in 2024-26.`);
    if (!ss.length) return;

    const W = 366, H = 210, m = { l: 8, r: 8, t: 10, b: 26 };
    const x = d3.scaleLog().domain([2e5, 3e7]).range([m.l, W - m.r]).clamp(true);

    // Put each sale in one of 70 price bins, then stack dots in each bin
    const NB = 70, binW = (W - m.l - m.r) / NB;
    const bins = d3.range(NB).map(() => []);
    ss.forEach((s) => {
      const b = Math.min(NB - 1, Math.max(0, Math.floor((x(s.price) - m.l) / binW)));
      bins[b].push(s);
    });
    const per = Math.max(1, Math.ceil(d3.max(bins, (b) => b.length) / 32)); // 1 dot = `per` sales so stacks fit
    const r = Math.min(binW / 2 - 0.4, 2.6);
    const dots = [];
    bins.forEach((b, i) => {
      b.sort((a, b2) => a.op - b2.op); // ready at the bottom, off-plan on top
      for (let k = 0; k < b.length; k += per) dots.push({ x: m.l + (i + 0.5) * binW, k: k / per, s: b[k] });
    });

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickValues([3e5, 1e6, 3e6, 1e7, 3e7]).tickFormat((v) => (v >= 1e6 ? v / 1e6 + "M" : v / 1e3 + "k")).tickSize(3));
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", Math.max(0, x(state.budget) - m.l))
      .attr("height", H - m.b - m.t).attr("fill", "#f3f2ee");
    svg.selectAll("circle").data(dots).join("circle")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => H - m.b - 4 - d.k * (r * 2 + 0.6))
      .attr("r", r)
      .attr("fill", (d) => {
        const colour = d.s.op ? COLORS[1] : COLORS[0];
        return d.s.price <= state.budget ? colour : tint(colour, 0.4); // over budget = lighter
      });
    svg.append("line").attr("x1", x(state.budget)).attr("x2", x(state.budget)).attr("y1", m.t - 4).attr("y2", H - m.b)
      .attr("stroke", "var(--text-primary)").attr("stroke-width", 1.5);
    svg.append("text").attr("x", x(state.budget) + 4).attr("y", m.t + 6).attr("font-size", 11).attr("fill", "var(--text-primary)")
      .text("your budget " + aed(state.budget));
    d3.select("#d-unit").text(per > 1 ? `1 dot = ${per} sales` : "1 dot = 1 sale (10% sample)");
  }

  // First paint
  d3.selectAll("#presets .chip").classed("on", (d) => d === "First-time buyer");
  syncControls();
  update();
  comms.forEach((c) => (c.prevRank = c.rank)); // no ▲▼ arrows on the first paint
}
