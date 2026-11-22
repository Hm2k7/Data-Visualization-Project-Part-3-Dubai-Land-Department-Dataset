/* =====================================================================
   Vis 2 - Grid map + connected scatterplot       owner: Khalid Albadda
   ---------------------------------------------------------------------
   Question: did every community ride the same boom, or did they take
   different paths?
   Left: a grid map, one square per community, coloured by how it
   compares with Dubai. The colour fades towards grey when the number
   rests on few sales (VSUP, Correll, Moritz & Heer, CHI 2018).
   Right: a connected scatterplot of up to 3 picked communities, one dot
   per year (x = homes sold, y = price per m²), plus a plain price line.

   The file reads top to bottom in the same five steps as Vis 1 and Vis 3:
     STEP 1  Load the data
     STEP 2  State and scales (incl. the VSUP colour scale)
     STEP 3  Draw (data join: one <g> square per community)
     STEP 4  Interactions (click a square, year slider, Play, buttons)
     STEP 5  Update (recolour the squares, redraw the paths)
   Number formats, the tooltip and button groups live in ../assets/helpers.js
   ===================================================================== */

// ---------------------------------------------------------------------
// Fixed settings
// ---------------------------------------------------------------------
const SLOT_HEX = ["#7b3fa0", "#1a9e8f", "var(--slot-3)"]; // colours for the 3 picked communities (purple, teal, black: neutral, so they never look like the map's orange/blue)
const DUBAI_GREY = "#8a8880";

// Grid map: 13 x 11 squares of 60 px
const COLS = 13, ROWS = 11, TS = 60, PAD = 2;

// Plain-language names for the squares (max ~2 short lines). Key = DLD area code.
const TILE = {681:"JVC",346:"Business Bay",392:"Dubai Marina",648:"DLRC",521:"Dubai South",347:"Sobha Hartland",631:"Dubai Hills",345:"Downtown",591:"Al Furjan",415:"Creek Harbour",393:"JLT",682:"Sports City",673:"Arjan",621:"Intl City 1",645:"Majan",922:"Town Square",684:"JVT",685:"Production City",626:"Silicon Oasis",321:"Maritime City",381:"Palm Jumeirah",674:"Motor City",676:"DAMAC Hills",672:"Science Park",343:"City Walk",326:"Al Jadaf",611:"Bu Kadra",665:"Wadi Al Safa 7",643:"Liwan",597:"DIP 2",915:"The Valley",683:"Remraam",101:"Dubai Islands",646:"City of Arabia",921:"Al Yalayis",388:"The Greens",618:"Meydan",598:"DIP 1",675:"Studio City",337:"Za'abeel 2",916:"DAMAC Hills 2",624:"Intl City 3",394:"Emirates Living",518:"Jebel Ali Dtn",612:"Ras Al Khor",366:"Umm Suqeim",664:"Arabian Ranches",324:"Al Kifaf",677:"Mudon",332:"La Mer",359:"Al Quoz",334:"Jumeirah Garden",325:"Za'abeel 1",531:"Saih Shuaib",251:"Mirdif",382:"Al Sufouh",383:"Barsha Heights",261:"Muhaisnah",918:"DAMAC Hills 2b",336:"Trade Centre"};

// Split a square's name into at most 2 lines of 9 characters or less
function tileLines(d) {
  const name = TILE[d.c] || d.known;
  const words = name.split(" ");
  if (name.length <= 9 || words.length === 1) return [name];
  let first = words[0], i = 1;
  while (i < words.length && (first + " " + words[i]).length <= 9) first += " " + words[i++];
  return [first, words.slice(i).join(" ")];
}

// =====================================================================
// STEP 1, Load the data
// vis2_trajectories.json is made by prep/prepare_data.py: per community,
// a yearly median price (nominal and inflation-adjusted with the World
// Bank UAE CPI), sales count, and three metrics with 90% bootstrap
// intervals (level, growth, off-plan share).
// =====================================================================
d3.json("../data/vis2_trajectories.json").then((data) => start(data));

function start(data) {
  // =====================================================================
  // STEP 2, State and scales
  // =====================================================================

  // metric:   what colours the squares: "level" | "growth" | "offplan"
  // vsup:     "on" = fade uncertain squares, "off" = plain 8 colour steps
  // real:     "nominal" AED or "real" (2015 AED, after inflation)
  // year:     the year shown by the slider (2015-2026)
  // selected: up to 3 community codes drawn in the scatterplot
    const state = { metric: "growth", vsup: "on", real: "nominal", year: 2026, selected: [681, 345, 648] };
   
  const comms = data.comms;
  const byC = new Map(comms.map((c) => [c.c, c]));
  d3.select("#ann").text(data.annualise2026.toFixed(3));

  // --- nominal vs real prices ------------------------------------------
  const isReal = () => state.real === "real";
  // The metric for one community, e.g. d.level or d.levelR (real). Off-plan share has no real version.
  const metricOf = (d) => d[state.metric + (isReal() && state.metric !== "offplan" ? "R" : "")];

  // Copy the right price into p.cur so every chart just reads p.cur
  function applyPriceMode() {
    const k = isReal() ? "medR" : "med";
    comms.forEach((c) => c.traj.forEach((p) => (p.cur = p[k])));
    data.dubai.forEach((p) => (p.cur = p[k]));
  }

  // Dubai-wide reference values (the grey middle of the colour scale)
  let REF = {};
  function setRef() {
    const r = data.ref;
    const R = isReal() ? "R" : "";
    REF = { level: r["level" + R], growth: r["growth" + R], offplan: r.offplan };
  }

  // --- the colour scale: value -> t in 0..1, where 0.5 = same as Dubai ----
  // toT turns a value into a position on the diverging colour scale;
  // fromT is its inverse (used to label the legend).
  // thr = interval half-widths that move a square to the next, greyer level.
  const METRICS = {
    level: {
      label: "Typical price per m², 2024-26",
      fmt: (v) => fmt(v),
      ufmt: (m) => `${fmt(m.lo)}-${fmt(m.hi)}`,
      // log ratio: 2.5x Dubai's price = darkest blue, 1/2.5 = darkest orange
      toT: (v) => 0.5 + Math.log(v / REF.level) / Math.log(2.5) / 2,
      fromT: (t) => REF.level * 2.5 ** ((t - 0.5) * 2),
      low: "cheaper than Dubai",
      high: "pricier than Dubai",
      thr: [0.02, 0.04, 0.07],
      uTicks: ["±<2%", "±2-4%", "±4-7%", "±>7%"],
    },
    growth: {
      label: "Price growth, 2018-20 --> 2024-26",
      fmt: (v) => pctSigned(v),
      ufmt: (m) => `${pctSigned(m.lo)} to ${pctSigned(m.hi)}`,
      toT: (v) => 0.5 + (v - REF.growth) / 2, // ±100 points from Dubai = darkest
      fromT: (t) => REF.growth + (t - 0.5) * 2,
      low: "grew slower than Dubai",
      high: "grew faster than Dubai",
      thr: [0.1, 0.2, 0.35],
      uTicks: ["±<10 pts", "±10-20", "±20-35", "±>35"],
    },
    offplan: {
      label: "Off-plan share of sales, 2024-26",
      fmt: (v) => pct(v),
      ufmt: (m) => `${pct(m.lo)}-${pct(m.hi)}`,
      toT: (v) => 0.5 + (v - REF.offplan) / 1.2, // ±60 points from Dubai = darkest
      fromT: (t) => REF.offplan + (t - 0.5) * 1.2,
      low: "fewer off-plan than Dubai",
      high: "more off-plan than Dubai",
      thr: [0.03, 0.05, 0.08],
      uTicks: ["±<3 pts", "±3-5", "±5-8", "±>8"],
    },
  };

  // Diverging colours: orange below Dubai, blue above, warm grey = the same
  const ORANGE = d3.interpolateLab("#f6d3c0", "#a3400f");
  const BLUE = d3.interpolateLab("#cfe0f6", "#0d366b");
  const NEUTRAL = "#e4e2dc";
  function divColor(t) {
    if (Math.abs(t - 0.5) < 1e-6) return NEUTRAL;
    return t < 0.5 ? ORANGE((0.5 - t) * 2) : BLUE((t - 0.5) * 2);
  }

  // Uncertainty level 0 (reliable) .. 3 (too uncertain) from the interval width u
  function uncertaintyLevel(metric, u) {
    const t = METRICS[metric].thr;
    if (u < t[0]) return 0;
    if (u < t[1]) return 1;
    if (u < t[2]) return 2;
    return 3;
  }

  // VSUP: the less certain, the fewer colour steps (8 --> 4 --> 2 --> 1)
  // and the more the colour is pulled towards grey.
  function vsupColor(metric, value, u, on = true) {
    const t = Math.max(0, Math.min(0.9999, METRICS[metric].toT(value)));
    const level = on ? uncertaintyLevel(metric, u) : 0;
    const steps = 2 ** (3 - level);
    const snapped = (Math.floor(t * steps) + 0.5) / steps; // centre of the step
    const fill = d3.interpolateLab(divColor(snapped), NEUTRAL)(level * 0.12);
    return { fill, level, t: snapped };
  }
  const isDark = (colour) => d3.lab(colour).l < 55; // white text on dark squares

  // --- grid-map position: greedy "nearest free cell" ------------------------
  // Biggest communities pick first, so they stay closest to their real place.
  const gx = d3.scaleLinear().domain(d3.extent(comms, (c) => c.lon)).range([0.5, COLS - 1.5]);
  const gy = d3.scaleLinear().domain(d3.extent(comms, (c) => c.lat)).range([ROWS - 1.5, 0.5]); // north up
  const taken = new Set();
  [...comms]
    .sort((a, b) => b.n - a.n)
    .forEach((c) => {
      const tx = gx(c.lon), ty = gy(c.lat);
      let best = null, bestDist = Infinity;
      for (let i = 0; i < COLS; i++) {
        for (let j = 0; j < ROWS; j++) {
          if (taken.has(i + "," + j)) continue;
          const dist = (i - tx) ** 2 + (j - ty) ** 2;
          if (dist < bestDist) { bestDist = dist; best = [i, j]; }
        }
      }
      taken.add(best.join(","));
      c.gi = best[0];
      c.gj = best[1];
    });

  // --- scales for the little sparkline inside each square --------------------
  const sparkX = d3.scaleLinear().domain([2015, 2026]).range([6, TS - PAD * 2 - 6]);
  const sparkY = d3.scaleLinear().domain([0, 40000]).range([TS - PAD * 2 - 4, 36]).clamp(true);
  const spark = d3.line().defined((d) => d.cur != null).x((d) => sparkX(d.y)).y((d) => sparkY(d.cur));

  // --- scatterplot scales ---------------------------------------------------
  // x is a LOG scale: sales per year range from ~5 to ~3,000, and a log
  // axis makes "twice as many sales" the same distance everywhere.
  const CW = 560, CH = 470, m = { l: 58, r: 120, t: 14, b: 44 };
  const x = d3.scaleLog().range([m.l, CW - m.r]);
  const y = d3.scaleLinear().range([CH - m.b, m.t]);

  // Price-over-time line chart under the scatterplot
  const LW = 560, LH = 190, lm = { l: 58, r: 120, t: 10, b: 26 };
  const lx = d3.scaleLinear().domain([2015, 2026]).range([lm.l, LW - lm.r]);
  const ly = d3.scaleLinear().range([LH - lm.b, lm.t]);

  applyPriceMode();
  setRef();

  // =====================================================================
  // STEP 3, Draw
  // =====================================================================

  // --- grid map ------------------------------------------------------------
  const GW = COLS * TS, GH = ROWS * TS;
  const grid = d3.select("#grid").attr("width", GW).attr("height", GH);
  grid.append("text").attr("x", 6).attr("y", 16).attr("font-size", 11).attr("fill", "var(--text-muted)")
    .text("Arabian Gulf (north-west)");
  grid.append("text").attr("x", GW - 6).attr("y", GH - 6).attr("text-anchor", "end").attr("font-size", 11)
    .attr("fill", "var(--text-muted)").text("desert / Dubailand (south-east)");

  // ---- THE DATA JOIN: one <g class="tile"> per community -------------------
  // Key = community code, so a square keeps its identity on every update.
  const tiles = grid
    .selectAll("g.tile")
    .data(comms, (d) => d.c)
    .join("g")
    .attr("class", "tile")
    .attr("transform", (d) => `translate(${d.gi * TS + PAD},${d.gj * TS + PAD})`);

  tiles.append("rect").attr("class", "bg").attr("width", TS - PAD * 2).attr("height", TS - PAD * 2).attr("rx", 5);
  tiles.append("rect").attr("class", "selring") // coloured ring when picked
    .attr("x", -1).attr("y", -1).attr("width", TS - PAD * 2 + 2).attr("height", TS - PAD * 2 + 2)
    .attr("rx", 6).attr("fill", "none").attr("stroke-width", 3);
  tiles.append("text").attr("class", "code").attr("x", 4).attr("y", 11)
    .each(function (d) {
      tileLines(d).forEach((line, i) => {
        d3.select(this).append("tspan").attr("x", 4).attr("dy", i ? 10 : 0).text(line);
      });
    });
  tiles.append("text").attr("class", "val").attr("x", TS - PAD * 2 - 4).attr("y", TS - PAD * 2 - 4)
    .attr("text-anchor", "end");
  tiles.append("path").attr("class", "spark").attr("d", (d) => spark(d.traj)).attr("fill", "none")
    .attr("stroke-width", 1.5);
  tiles.append("circle").attr("class", "ymark").attr("r", 2.6); // the slider's year on the sparkline

  // --- scatterplot frame (axes, labels, arrow heads) ------------------------
  const cs = d3.select("#cs").attr("width", CW).attr("height", CH).attr("viewBox", [0, 0, CW, CH]);
  cs.append("defs").html(
    SLOT_HEX.concat([DUBAI_GREY])
      .map((c, i) => `<marker id="arr${i}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1L9,5L0,9z" fill="${c}"/></marker>`)
      .join("")
  );
  const xAxisG = cs.append("g").attr("class", "axis").attr("transform", `translate(0,${CH - m.b})`);
  const yAxisG = cs.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`);
  const gridG = cs.append("g").attr("class", "gridline");
  const pathsG = cs.append("g");
  cs.append("text").attr("x", CW - m.r).attr("y", CH - 8).attr("text-anchor", "end").attr("font-size", 11)
    .text("sales per year in the 10% sample (log scale) -->");
  const yLabel = cs.append("text").attr("transform", `translate(16,${CH - m.b}) rotate(-90)`).attr("font-size", 11)
    .text("median AED per m² -->");
  cs.append("text").attr("class", "readhint").attr("x", m.l + 8).attr("y", m.t + 12).text("pricier");
  cs.append("text").attr("class", "readhint").attr("x", CW - m.r - 4).attr("y", CH - m.b - 8)
    .attr("text-anchor", "end").text("more homes sold -->");

  // --- price line chart frame ---------------------------------------------
  const lc = d3.select("#lc").attr("width", LW).attr("height", LH).attr("viewBox", [0, 0, LW, LH]);
  const lxAxisG = lc.append("g").attr("class", "axis").attr("transform", `translate(0,${LH - lm.b})`);
  const lyAxisG = lc.append("g").attr("class", "axis").attr("transform", `translate(${lm.l},0)`);
  const lgrid = lc.append("g").attr("class", "gridline");
  const lpaths = lc.append("g");
  const yearRule = lc.append("line").attr("stroke", "var(--faded)");

  d3.select("#g-title").text(`Grid map of ${comms.length} communities`);

  // =====================================================================
  // STEP 4, Interactions
  // Every handler changes `state`, then calls redraw().
  // =====================================================================

  // Hover a square -> tooltip. Click -> add it to / remove it from the scatterplot.
  tiles
    .on("mouseenter", (event, d) => showTip(event, tileTip(d)))
    .on("mousemove", moveTip)
    .on("mouseleave", hideTip)
    .on("click", (event, d) => toggle(d.c));

  // Keep at most 3 picked communities; the oldest pick drops out.
  function toggle(code) {
    const i = state.selected.indexOf(code);
    if (i >= 0) {
      state.selected.splice(i, 1);
    } else {
      state.selected.push(code);
      if (state.selected.length > 3) state.selected.shift();
    }
    redraw();
  }

  // Year slider
  const slider = d3.select("#year");
  const yearLabel = d3.select("#yrlabel");
  slider.on("input", function () {
    state.year = +this.value;
    yearLabel.text(state.year);
    redraw();
  });

  // Play: step through 2015 --> 2026, one year every 0.7 s
  let timer = null;
  d3.select("#play").on("click", function () {
    if (timer) {
      stopPlaying();
      return;
    }
    d3.select(this).text("❚❚ Pause");
    state.year = 2015;
    timer = d3.interval(() => {
      slider.property("value", state.year);
      yearLabel.text(state.year);
      redraw();
      if (state.year >= 2026) stopPlaying();
      else state.year++;
    }, 700);
  });
  function stopPlaying() {
    timer.stop();
    timer = null;
    d3.select("#play").text("▶ Play");
  }

  // Buttons: metric, nominal/real, VSUP on/off
  onButtonGroupClick((key, value) => {
    state[key] = value;
    markButtonGroups(state);
    applyPriceMode();
    setRef();
    redraw();
  });

  // --- tooltip text --------------------------------------------------------
  function tileTip(d) {
    const metric = metricOf(d);
    const M = METRICS[state.metric];
    let h = `<div class="t-title">${d.known}</div><div class="t-note" style="margin:0 0 4px">DLD: ${d.name}, ${fmt(d.n)} sales 2015-26</div>`;
    if (!metric) {
      const why = state.metric === "growth"
        ? "Fewer than 8 sales in 2018-20 or 2024-26: mostly communities that were not launched yet in 2018-20."
        : "Not enough recent sales to compute this.";
      return h + `<div class="t-note">${why}</div>`;
    }
    const level = vsupColor(state.metric, metric.v, metric.u).level;
    const reliability = [
      "Reliable: full colour detail",
      "Fairly reliable: 4 colour steps",
      "Uncertain: 2 colour steps",
      "Too uncertain: shown as grey",
    ][level];
    h += tipRow(M.label, M.fmt(metric.v));
    h += tipRow("Dubai average", M.fmt(REF[state.metric]));
    h += tipRow("90% interval", M.ufmt(metric));
    h += tipRow("Sample", metric.n || metric.nb + " --> " + metric.nn);
    return h + `<div class="t-note">${reliability}</div>`;
  }

  function pointTip(s, p) {
    return `<div class="t-title">${s.full}, ${p.y}</div>` +
      tipRow(`Sales (sample${p.y === 2026 ? ", annualised" : ""})`, fmt(p.nA)) +
      tipRow(`Median AED/m²${isReal() ? " (2015 AED)" : ""}`, fmt(p.cur)) +
      tipRow("Off-plan share", pct(p.op));
  }

  function tipRow(name, value) {
    return `<div class="t-row"><span>${name}</span><span>${value}</span></div>`;
  }

  // =====================================================================
  // STEP 5, Update
  // =====================================================================
  function redraw() {
    drawTiles();
    drawScatter();
  }

  // Recolour every square for the current metric, year and VSUP setting
  function drawTiles() {
    const T = d3.transition().duration(400);
    tiles.each(function (d) {
      const g = d3.select(this);
      const metric = metricOf(d);
      const colour = metric ? vsupColor(state.metric, metric.v, metric.u, state.vsup === "on") : null;
      const fill = colour ? colour.fill : "var(--land-faint)"; // no value -> pale, dashed square
      const dark = colour && isDark(fill);
      // text on a coloured square ignores the page theme; empty squares follow it
      const ink = !colour ? "var(--text-primary)" : dark ? "#fff" : "#0b0b0b";

      g.select(".bg").transition(T).attr("fill", fill);
      g.select(".bg").attr("stroke", colour ? "none" : "var(--rule-strong)").attr("stroke-dasharray", colour ? null : "2 2");
      g.select(".code").attr("fill", ink);
      g.select(".val")
        .attr("fill", !colour ? "var(--text-secondary)" : dark ? "#fff" : "#52514e")
        .text(metric ? (state.metric === "level" ? d3.format(".0f")(metric.v / 1000) + "k" : METRICS[state.metric].fmt(metric.v)) : "new");
      g.select(".spark").attr("d", spark(d.traj)).attr("stroke", ink);

      const thisYear = d.traj.find((t) => t.y === state.year);
      const hasYear = thisYear && thisYear.cur != null;
      g.select(".ymark")
        .attr("display", hasYear ? null : "none")
        .attr("cx", sparkX(state.year))
        .attr("cy", hasYear ? sparkY(thisYear.cur) : 0)
        .attr("fill", ink);

      const slot = state.selected.indexOf(d.c);
      g.select(".selring").attr("stroke", slot >= 0 ? SLOT_HEX[slot] : "none");
    });

    const M = METRICS[state.metric];
    const afterInflation = isReal() && state.metric !== "offplan" ? " after inflation" : "";
    d3.select("#g-sub").html(`Colour: ${M.label}${afterInflation} compared with Dubai (${M.fmt(REF[state.metric])}). The little line in each square is its price per m², 2015 --> 2026. "new" = not sold yet in 2018-20.`);
    drawLegend();
  }

  // Arc legend: left = below Dubai, right = above; outer rings = more reliable
  function drawLegend() {
    const svg = d3.select("#vsup-legend");
    svg.selectAll("*").remove();
    const M = METRICS[state.metric];
    const cx = 235, cy = 150, R0 = 30, RW = 26, a0 = -Math.PI / 3, a1 = Math.PI / 3;
    const arc = d3.arc();
    const levels = state.vsup === "on" ? [0, 1, 2, 3] : [0];

    levels.forEach((L) => {
      const steps = 2 ** (3 - L);
      const rOut = R0 + (4 - L) * RW;
      const rIn = rOut - RW + 1.5;
      for (let b = 0; b < steps; b++) {
        const t = (b + 0.5) / steps;
        const fakeU = L === 0 ? 0 : M.thr[L - 1] + 1e-6; // an interval width that lands on level L
        const colour = vsupColor(state.metric, M.fromT(t), fakeU, state.vsup === "on").fill;
        svg.append("path")
          .attr("transform", `translate(${cx},${cy})`)
          .attr("d", arc({
            innerRadius: rIn,
            outerRadius: rOut,
            startAngle: a0 + ((a1 - a0) * b) / steps + 0.004,
            endAngle: a0 + ((a1 - a0) * (b + 1)) / steps - 0.004,
          }))
          .attr("fill", colour);
      }
      if (state.vsup === "on") {
        svg.append("text")
          .attr("x", cx + Math.sin(a1) * (rOut - RW / 2) + 6)
          .attr("y", cy - Math.cos(a1) * (rOut - RW / 2) + 4)
          .attr("font-size", 10).attr("class", "num").text(M.uTicks[L]);
      }
    });

    const rTop = R0 + 4 * RW + 6;
    [[0, M.low], [0.5, "Dubai " + M.fmt(REF[state.metric])], [1, M.high]].forEach(([t, text]) => {
      const a = a0 + (a1 - a0) * t;
      svg.append("text")
        .attr("x", cx + Math.sin(a) * rTop)
        .attr("y", cy - Math.cos(a) * rTop - 2)
        .attr("text-anchor", t === 0 ? "end" : t === 1 ? "start" : "middle")
        .attr("font-size", 11).attr("fill", "var(--text-primary)").text(text);
    });
    if (state.vsup === "on") {
      svg.append("text").attr("x", cx).attr("y", cy + 18).attr("font-size", 10).attr("text-anchor", "middle")
        .attr("fill", "var(--text-muted)").text("outer rings are more reliable");
    }
    d3.select("#legend-text").html(state.vsup === "on"
      ? `How to read the colour: the left half of the arc is below Dubai (orange), the right half is above Dubai (blue) and the middle is about the same. Reliable numbers use the outer ring. When a community has fewer sales its colour moves inwards to fewer and greyer steps, and plain grey means we can't tell. This stops a community with a handful of sales from looking as certain as JVC.`
      : `Plain colours, uncertainty ignored. Every square gets one of 8 steps however few sales it rests on. Switch back to see which strong colours were really based on a few dozen sales.`);
  }

  // The lines to draw: the picked communities + all of Dubai
  function series() {
    const out = state.selected.map((c, i) => ({
      id: c, name: TILE[c] || byC.get(c).known, full: byC.get(c).known, color: SLOT_HEX[i], slot: i, pts: byC.get(c).traj,
    }));
    out.push({ id: "dubai", name: "All of Dubai", full: "All of Dubai", color: DUBAI_GREY, slot: 3, pts: data.dubai });
    return out;
  }

  // Push end labels apart so they never overlap (minimum gap in px)
  function spreadLabels(list, field, gap) {
    const sorted = list.filter((s) => s[field] != null).sort((a, b) => a[field] - b[field]);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i][field] - sorted[i - 1][field] < gap) sorted[i][field] = sorted[i - 1][field] + gap;
    }
  }

  function drawScatter() {
    const S = series();
    yLabel.text(isReal() ? "median AED per m², in 2015 dirhams (inflation-adjusted) -->" : "median AED per m² -->");

    // Fit the axes to the points on screen
    const allPts = S.flatMap((s) => s.pts.filter((p) => p.cur != null && p.nA > 0));
    x.domain([Math.max(3, d3.min(allPts, (p) => p.nA) * 0.8), d3.max(allPts, (p) => p.nA) * 1.25]).nice();
    y.domain([0, d3.max(allPts, (p) => p.cur) * 1.08]).nice();
    xAxisG.call(d3.axisBottom(x).ticks(6, "~s").tickSize(3));
    yAxisG.call(d3.axisLeft(y).ticks(6).tickFormat((d) => d / 1000 + "k").tickSize(3));
    gridG.selectAll("line").data(y.ticks(6)).join("line")
      .attr("x1", m.l).attr("x2", CW - m.r).attr("y1", (d) => y(d)).attr("y2", (d) => y(d));

    // One <g class="ser"> per series (enter builds the parts once)
    const groups = pathsG
      .selectAll("g.ser")
      .data(S, (d) => d.id)
      .join((enter) => {
        const g = enter.append("g").attr("class", "ser");
        g.append("path").attr("class", "trail").attr("fill", "none");
        g.append("g").attr("class", "pts");
        g.append("text").attr("class", "lbl").attr("font-size", 12);
        g.append("g").attr("class", "yrs");
        return g;
      });

    groups.each(function (s) {
      const g = d3.select(this);
      const pts = s.pts.filter((p) => p.cur != null && p.nA > 0 && p.y <= state.year); // up to the slider year
      const isDubai = s.id === "dubai";

      // The trail. Extra midpoints let marker-mid put an arrow halfway between years.
      const xy = pts.map((p) => [x(p.nA), y(p.cur)]);
      const withMid = xy.flatMap((q, i) => (i ? [[(xy[i - 1][0] + q[0]) / 2, (xy[i - 1][1] + q[1]) / 2], q] : [q]));
      g.select(".trail")
        .attr("d", d3.line()(withMid))
        .attr("stroke", s.color)
        .attr("stroke-width", 2)
        .attr("marker-mid", `url(#arr${s.slot})`);

      // One dot per year; the slider year is bigger, 2026 (partial year) is hollow
      g.select(".pts")
        .selectAll("circle")
        .data(pts, (p) => p.y)
        .join("circle")
        .attr("class", "pt")
        .attr("cx", (p) => x(p.nA))
        .attr("cy", (p) => y(p.cur))
        .attr("r", (p) => (p.y === state.year ? 6 : 4))
        .attr("fill", (p) => (p.y === 2026 ? "var(--halo)" : s.color))
        .attr("stroke", (p) => (p.y === 2026 ? s.color : "var(--halo)"))
        .attr("stroke-width", (p) => (p.y === 2026 ? 2 : 1.5))
        .on("mouseenter", (event, p) => showTip(event, pointTip(s, p)))
        .on("mousemove", moveTip)
        .on("mouseleave", hideTip);

      // Name at the end of the trail, first and last year above their dots
      const first = pts[0], last = pts[pts.length - 1];
      s._ly = last ? y(last.cur) + 4 : null;
      g.select(".lbl")
        .attr("display", last ? null : "none")
        .attr("x", last ? x(last.nA) + 9 : 0)
        .attr("y", last ? y(last.cur) + 4 : 0)
        .attr("fill", isDubai ? "var(--text-secondary)" : "var(--text-primary)")
        .text(s.name);
      const yearsToLabel = [first, last].filter((p, i, a) => p && (i === 0 || p !== a[0]));
      g.select(".yrs").selectAll("text").data(yearsToLabel, (p) => p.y).join("text")
        .attr("font-size", 10).attr("class", "num")
        .attr("x", (p) => x(p.nA)).attr("y", (p) => y(p.cur) - 9)
        .attr("text-anchor", "middle").attr("fill", "var(--text-muted)").text((p) => p.y);
    });

    spreadLabels(S, "_ly", 14);
    groups.each(function (s) {
      if (s._ly != null) d3.select(this).select(".lbl").attr("y", s._ly);
    });

    // Caption about the grey Dubai path (kept off the chart itself)
    const at = (yy) => data.dubai.find((p) => p.y === yy);
    d3.select("#phase-caption").html(
      `All of Dubai (grey): 2015-20 sat still, with flat sales and prices drifting down (${fmt(at(2015).cur)} --> ${fmt(at(2020).cur)} AED/m²). 2021-25 shot up and to the right: ${fmt(at(2025).cur)} AED/m² and ${d3.format(".1f")(at(2025).nA / at(2020).nA)}x the sales.`
    );

    drawLine(S);

    // Chips above the chart: click ✕ to remove a community
    d3.select("#chips").html("")
      .selectAll("span").data(S.filter((s) => s.id !== "dubai")).join("span")
      .attr("class", "chip on")
      .style("background", "var(--surface-1)").style("color", "var(--text-primary)").style("border-color", "var(--rule-strong)")
      .html((s) => `<span class="dot" style="background:${s.color}"></span>${s.full} <span class="muted">✕</span>`)
      .on("click", (event, s) => toggle(s.id));
  }

  // Plain price-over-time line chart (easier to read than the scatterplot)
  function drawLine(S) {
    const all = S.flatMap((s) => s.pts.filter((p) => p.cur != null));
    ly.domain([0, d3.max(all, (p) => p.cur) * 1.08]).nice();
    lxAxisG.call(d3.axisBottom(lx).ticks(12).tickFormat(d3.format("d")).tickSize(3));
    lyAxisG.call(d3.axisLeft(ly).ticks(4).tickFormat((d) => d / 1000 + "k").tickSize(3));
    lgrid.selectAll("line").data(ly.ticks(4)).join("line")
      .attr("x1", lm.l).attr("x2", LW - lm.r).attr("y1", (d) => ly(d)).attr("y2", (d) => ly(d));
    yearRule.attr("x1", lx(state.year)).attr("x2", lx(state.year)).attr("y1", lm.t).attr("y2", LH - lm.b);

    const lines = lpaths
      .selectAll("g")
      .data(S, (d) => d.id)
      .join((enter) => {
        const g = enter.append("g");
        g.append("path");
        g.append("circle");
        g.append("text").attr("class", "lbl").attr("font-size", 11.5);
        return g;
      });

    lines.each(function (s) {
      const g = d3.select(this);
      const pts = s.pts.filter((p) => p.cur != null);
      g.select("path")
        .attr("d", d3.line().x((p) => lx(p.y)).y((p) => ly(p.cur))(pts))
        .attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2);
      const now = pts.find((p) => p.y === state.year) || pts[pts.length - 1];
      g.select("circle").attr("cx", lx(now.y)).attr("cy", ly(now.cur)).attr("r", 4)
        .attr("fill", s.color).attr("stroke", "var(--halo)").attr("stroke-width", 1.5);
      const last = pts[pts.length - 1];
      s._ll = ly(last.cur) + 4;
      g.select("text").attr("x", lx(last.y) + 8).attr("fill", s.id === "dubai" ? "var(--text-secondary)" : "var(--text-primary)")
        .text(`${s.name} ${d3.format(".0f")(last.cur / 1000)}k`);
    });

    spreadLabels(S, "_ll", 13);
    lines.each(function (s) {
      d3.select(this).select("text").attr("y", s._ll);
    });
  }

    // First paint
  markButtonGroups(state); // make the buttons show the starting state
  redraw();
}
