/* =====================================================================
   Vis 1 - Metro line diagrams                 owner: Hassan Mousa
   ---------------------------------------------------------------------
   Question: does living near a metro or tram stop change what homes cost?
   Each metro line is drawn as a vertical line of stations. Each station
   row shows a bar (homes sold / riders / places nearby) and a dot for
   the typical price per m², with a band for the middle half of sales.

   The file reads top to bottom in the same five steps as Vis 2 and Vis 3:
     STEP 1  Load the data
     STEP 2  State and scales
     STEP 3  Draw (data join: one <g> row per station)
     STEP 4  Interactions (hover, click, brush, buttons, finding cards)
     STEP 5  Update (move everything to match the state)
   Number formats, the tooltip and button groups live in ../assets/helpers.js
   ===================================================================== */

// ---------------------------------------------------------------------
// Fixed settings
// ---------------------------------------------------------------------
const LINE_COLOR = { Red: "#e34948", Green: "#008300", Tram: "#6250d6" };

// Interchange stations are drawn on both lines, but their sales are
// counted once, under the first line's code.
const INTERCHANGE = { G20: "R18", G26: "R19", T3: "R37", T5: "R36" };
const BIG_STOPS = ["R18", "R19", "R37", "R36"]; // drawn with a bigger circle

// Foursquare venue categories grouped into 5 readable groups (side panel)
const VENUE_GROUPS = [
  { name: "Food & nightlife", cats: ["Food", "Nightlife Spot"] },
  { name: "Shops & services", cats: ["Shop & Service"] },
  { name: "Leisure & outdoors", cats: ["Arts & Entertainment", "Outdoors & Recreation", "Event"] },
  { name: "Work & study", cats: ["Professional & Other Places", "College & University"] },
  { name: "Travel & homes", cats: ["Travel & Transport", "Residence"] },
];
const SEG_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

// Layout of one line diagram (pixels, left to right)
const ROW = 20; //                            height of one station row
const HEAD = 58; //                           space above the first row
const NAME_W = 140; //                        station names end here
const LINE_X = NAME_W + 14; //                the coloured metro line
const BAR_X = LINE_X + 16; //                 bars start here
const BAR_W = 62; //                          longest bar
const PRICE_X = BAR_X + BAR_W + 46; //        price axis starts here
const PRICE_W = 166; //                       price axis width
const W = PRICE_X + PRICE_W + 14; //          total width

// =====================================================================
// STEP 1, Load the data
// vis1_stations.json is made by prep/prepare_data.py (cleaned DLD sales
// grouped by nearest station, plus RTA riders and Foursquare venues).
// =====================================================================
Promise.all([
  d3.json("../data/vis1_stations.json"),
  d3.json("../data/communities.geojson"),
]).then(([data, geo]) => start(data, geo));

function start(data, geo) {
  // =====================================================================
  // STEP 2, State and scales
  // =====================================================================

  // Everything the user can change lives in one object.
  // period: "recent" (2021-26) | "early" (2015-20) | "all"
  // reg:    "all" | "offplan" | "ready"
  // bar:    what the bar shows: "sales" | "riders" | "venues"
  // band:   price range picked with the brush, e.g. [10000, 20000], or null
  const state = { period: "recent", reg: "all", bar: "sales", selected: "R26", band: null };

  // --- look-ups ---------------------------------------------------------
  const byCode = new Map(data.stations.map((s) => [s.code, s]));
  const codeNumber = (code) => +code.replace(/\D/g, ""); // "R26" -> 26
  const statsKey = () => `${state.period}|${state.reg}`; // e.g. "recent|all"
  const dataOf = (st) => byCode.get(INTERCHANGE[st.code] || st.code); // the station that holds the data
  const stat = (st) => dataOf(st).stats[statsKey()]; // { n, q:[p10,p25,p50,p75,p90], dist, … }
  const venues = (st) => (st.venues ? d3.sum(Object.values(st.venues)) : null);

  // Latest published RTA ridership for a station (outside data), or null
  function riders(st) {
    const byYear = dataOf(st).riders;
    if (!byYear) return null;
    const year = d3.max(Object.keys(byYear), Number);
    return { year, v: byYear[year], all: byYear };
  }

  // Short display names
  function label(st) {
    if (/^Stations? R7/.test(st.name)) return "Route 2020 station " + st.code;
    return st.name
      .replace("Burj Khalifa / Dubai Mall", "Burj Khalifa/Dubai Mall")
      .replace("Abu Dhabi Commercial Bank", "ADCB")
      .replace("Dubai Airport Free Zone", "Airport Free Zone")
      .replace("Jumeirah Lakes Towers", "JLT");
  }

  // --- the three lines, stations in order ---------------------------------
  const byNumber = (a, b) => codeNumber(a.code) - codeNumber(b.code);
  const redMain = data.stations
    .filter((s) => s.route === "Red" && codeNumber(s.code) < 70)
    .sort(byNumber);
  // Route 2020 branch: R70+ first, then the Expo stations
  const route2020 = data.stations
    .filter((s) => (s.route === "Red" && codeNumber(s.code) >= 70) || s.route === "Expo")
    .sort((a, b) => (a.route === "Expo") - (b.route === "Expo") || byNumber(a, b));
  const green = data.stations.filter((s) => s.route === "Green").sort(byNumber);
  const tram = data.stations.filter((s) => s.route === "Tram" && s.code !== "T2").sort(byNumber);

  const LINES = [
    { key: "Red", name: "Red Line", col: "#col-a", stations: redMain, branch: route2020 },
    { key: "Green", name: "Green Line", col: "#col-b", stations: green },
    { key: "Tram", name: "Dubai Tram", col: "#col-b", stations: tram },
  ];

  // --- scales -------------------------------------------------------------
  // x: price per m² -> horizontal position on the price axis.
  // Linear (not log) because people compare prices by difference;
  // clamp so the few stations above 50k stay on the chart.
  const x = d3
    .scaleLinear()
    .domain([0, 50000])
    .range([PRICE_X, PRICE_X + PRICE_W])
    .clamp(true);

  // The bar scale depends on what the bar shows, so it is rebuilt in update().
  const barMax = {
    sales: () =>
      d3.max(data.stations, (s) => (s.code !== "NONE" && s.stats[statsKey()] ? s.stats[statsKey()].n : 0)),
    riders: () => d3.max(data.stations, (s) => (s.riders ? d3.max(Object.values(s.riders)) : 0)),
    venues: () => d3.max(data.stations, (s) => venues(s) || 0),
  };

  // Value of the bar for one station (null = no bar)
  function barValue(st) {
    if (state.bar === "sales") {
      if (INTERCHANGE[st.code]) return null; // counted on the other line
      return stat(st) ? stat(st).n : 0;
    }
    if (state.bar === "riders") return riders(st) ? riders(st).v : null;
    return venues(st);
  }
  const barText = (v) => (state.bar === "riders" ? v + "M" : fmt(v));

  // =====================================================================
  // STEP 3, Draw
  // =====================================================================
  LINES.forEach(drawLineDiagram);

  function drawLineDiagram(L) {
    // Rows: one per station, plus a gap before the Route 2020 branch
    const rows = L.stations.map((s) => ({ s, kind: "st" }));
    if (L.branch) {
      rows.push({ kind: "gap" });
      L.branch.forEach((s) => rows.push({ s, kind: "st", branch: true }));
    }
    const H = HEAD + rows.length * ROW + 10;
    const svg = d3
      .select(L.col)
      .append("svg")
      .attr("width", W)
      .attr("height", H)
      .attr("viewBox", [0, 0, W, H])
      .style("display", "block")
      .style("margin-bottom", "10px");
    L.svg = svg;

    // Title and axis captions
    svg.append("rect").attr("x", 0).attr("y", 6).attr("width", 6).attr("height", 18).attr("rx", 2)
      .attr("fill", LINE_COLOR[L.key]);
    svg.append("text").attr("class", "line-title").attr("x", 12).attr("y", 20).text(L.name);
    L.barCap = svg.append("text").attr("class", "axis-cap").attr("x", BAR_X).attr("y", HEAD - 8);
    svg.append("text").attr("class", "axis-cap").attr("x", PRICE_X).attr("y", 20)
      .text("Typical price, AED per m²");

    // Price axis and light gridlines
    svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${HEAD - 4})`)
      .call(
        d3.axisTop(x)
          .tickValues([0, 10000, 20000, 30000, 40000, 50000])
          .tickFormat((d) => (d ? d / 1000 + "k" : "0"))
          .tickSize(3)
      );
    svg
      .append("g")
      .attr("class", "gridline")
      .selectAll("line")
      .data([10000, 20000, 30000, 40000])
      .join("line")
      .attr("x1", (d) => x(d))
      .attr("x2", (d) => x(d))
      .attr("y1", HEAD - 2)
      .attr("y2", H - 6);

    // Dubai median (dashed) and the brushed price band; positioned in update()
    L.dubaiLine = svg.append("line").attr("y1", HEAD - 2).attr("y2", H - 6)
      .attr("stroke", "#8a8880").attr("stroke-dasharray", "3 3");
    L.dubaiLabel = svg.append("text").attr("class", "axis-cap")
      .attr("y", HEAD + 9 + rows.length * ROW).attr("text-anchor", "middle");
    L.band = svg.append("rect").attr("y", HEAD - 2).attr("height", H - HEAD)
      .attr("fill", "#efede8").attr("display", "none");

    // The metro line itself (and the faded Route 2020 branch)
    const firstY = HEAD + ROW / 2;
    const lastMainY = HEAD + (L.stations.length - 1) * ROW + ROW / 2;
    svg.append("line").attr("x1", LINE_X).attr("x2", LINE_X).attr("y1", firstY).attr("y2", lastMainY)
      .attr("stroke", LINE_COLOR[L.key]).attr("stroke-width", 6).attr("stroke-linecap", "round");
    if (L.branch) {
      const lastY = HEAD + (rows.length - 1) * ROW + ROW / 2;
      svg.append("line").attr("x1", LINE_X).attr("x2", LINE_X).attr("y1", lastMainY).attr("y2", lastY)
        .attr("stroke", tint(LINE_COLOR.Red, 0.35)).attr("stroke-width", 6)
        .attr("stroke-linecap", "round");
      svg.append("text").attr("class", "axis-cap").attr("x", NAME_W)
        .attr("y", HEAD + L.stations.length * ROW + 14).attr("text-anchor", "end")
        .text("Route 2020 branch");
    }

    // ---- THE DATA JOIN: one <g class="row"> per station ----------------
    // Key = station code, so D3 matches the same station on every update.
    const stationRows = rows.map((r, i) => ({ ...r, i })).filter((r) => r.kind === "st");
    const g = svg
      .selectAll("g.row")
      .data(stationRows, (r) => r.s.code)
      .join("g")
      .attr("class", "row")
      .attr("transform", (r) => `translate(0,${HEAD + r.i * ROW})`);

    // Each row gets the same parts. Their sizes and positions are set in update().
    g.append("rect").attr("class", "bg").attr("x", 0).attr("width", W).attr("height", ROW - 1).attr("rx", 4);
    g.append("text").attr("class", "name").attr("x", NAME_W).attr("y", 14).attr("text-anchor", "end")
      .text((r) => label(r.s) + (INTERCHANGE[r.s.code] ? " ⇄" : ""));
    g.append("circle") // station stop on the line
      .attr("cx", LINE_X).attr("cy", ROW / 2)
      .attr("r", (r) => (INTERCHANGE[r.s.code] || BIG_STOPS.includes(r.s.code) ? 5.5 : 4))
      .attr("fill", "#fff")
      .attr("stroke", (r) => (r.branch ? "#f1a4a3" : LINE_COLOR[L.key]))
      .attr("stroke-width", 2.5);
    g.append("rect").attr("class", "bar").attr("x", BAR_X).attr("y", 5).attr("height", ROW - 10)
      .attr("rx", 2).attr("width", 0);
    g.append("text").attr("class", "val").attr("y", 14);
    g.append("line").attr("class", "iqr") // middle half of sales (P25-P75)
      .attr("y1", ROW / 2).attr("y2", ROW / 2).attr("stroke-width", 6).attr("stroke-linecap", "round")
      .attr("stroke", tint(LINE_COLOR[L.key], 0.3));
    g.append("circle").attr("class", "med") // typical (median) price
      .attr("cy", ROW / 2).attr("r", 4.8).attr("stroke", LINE_COLOR[L.key]).attr("stroke-width", 2);
    g.append("text").attr("class", "none").attr("x", PRICE_X + 2).attr("y", 14);
    L.rows = g;
  }

  // --- the static base of the side-panel map ------------------------------
  const proj = d3.geoMercator().fitExtent([[2, 2], [338, 238]], {
    type: "MultiPoint", // fit to a box around Dubai (avoids polygon winding problems)
    coordinates: [[55.02, 24.95], [55.45, 25.3]],
  });
  const path = d3.geoPath(proj);
  const mapSvg = d3.select("#p-map");
  mapSvg.append("clipPath").attr("id", "mapclip").append("rect").attr("width", 340).attr("height", 240);
  const mapG = mapSvg.append("g").attr("clip-path", "url(#mapclip)");
  const commPaths = mapG.append("g").selectAll("path").data(geo.features).join("path")
    .attr("d", path).attr("fill", "#e9e7e1").attr("stroke", "#fff").attr("stroke-width", 0.6);

  // Dashed outline: areas in the 2006 freehold list (outside data)
  const FREEHOLD = new Set(data.freehold2006);
  mapG.append("g").selectAll("path")
    .data(geo.features.filter((f) => FREEHOLD.has(f.properties.c)))
    .join("path")
    .attr("d", path).attr("fill", "none").attr("stroke", "var(--text-primary)")
    .attr("stroke-width", 0.9).attr("stroke-dasharray", "2.5 2").attr("pointer-events", "none");

  // Red and Green lines on the map
  function stationPoints(route) {
    return data.stations
      .filter((s) => s.lat && (route === "Red" ? s.route === "Red" && codeNumber(s.code) < 70 : s.route === route))
      .sort(byNumber)
      .map((s) => proj([s.lon, s.lat]));
  }
  [["Red", LINE_COLOR.Red], ["Green", LINE_COLOR.Green]].forEach(([route, colour]) => {
    mapG.append("path").attr("d", d3.line()(stationPoints(route)))
      .attr("stroke", colour).attr("stroke-width", 2).attr("fill", "none");
  });
  const branchPoints = [byCode.get("R38")].concat(route2020).map((s) => proj([s.lon, s.lat]));
  mapG.append("path").attr("d", d3.line()(branchPoints)).attr("stroke", tint(LINE_COLOR.Red, 0.45))
    .attr("stroke-width", 2).attr("fill", "none");
  const selMark = mapG.append("g"); // white station dot + spokes, drawn in drawMap()

  // --- finding cards and the "no station" box -----------------------------
  drawFindingCards();
  drawNoStationBox();

  function findingItems() {
    const st = (code) => byCode.get(code);
    const recent = (code) => st(code).stats["recent|all"];
    const none = st("NONE").stats["recent|all"];
    const total = data.dubai["recent|all"].n;
    return [
      {
        big: `${st("R19").riders[2025]}M riders`,
        txt: `use BurJuman each year, the busiest station, yet no home sales near it were recorded in 2021-26. The old core is not a freehold area.`,
        go: () => { state.bar = "riders"; state.selected = "R19"; },
      },
      {
        big: `${recent("R34").dist} km`,
        txt: `is how far JVC buyers live from their "nearest" station, Dubai Internet City. Hollow dots mean the same along most of the Red Line.`,
        go: () => { state.bar = "sales"; state.selected = "R34"; },
      },
      {
        big: pct(none.n / total),
        txt: `of homes sold in 2021-26 have no metro or tram stop at all: new desert-edge communities.`,
        scrollOnly: true,
      },
      {
        big: `${fmt(recent("G30").q[2] / 1000)}k vs ${fmt(recent("R25").q[2] / 1000)}k`,
        txt: `AED/m² at Creek (Green Line) vs Burj Khalifa/Dubai Mall: the new waterfront now out-prices Downtown.`,
        go: () => { state.bar = "sales"; state.selected = "G30"; },
      },
    ];
  }

  function drawFindingCards() {
    d3.select("#findings")
      .selectAll("button")
      .data(findingItems())
      .join("button")
      .attr("class", "finding")
      .html((d) => `<div class="big">${d.big}</div><div class="txt">${d.txt}</div><div class="go">Show me --></div>`);
  }

  function drawNoStationBox() {
    const t = byCode.get("NONE").stats["recent|all"];
    const total = data.dubai["recent|all"].n;
    const topFive = t.comms.slice(0, 5).map(([c]) => data.comms[c].known).join(", ");
    d3.select("#nostation").html(`
      <div class="kicker">Not on any line</div>
      <h2>${pct(t.n / total)} of homes sold in 2021-2026 have no metro or tram stop in the DLD file</h2>
      <div class="sub" style="margin-bottom:0">${fmt(t.n)} of ${fmt(total)} sales.
        Typical price AED ${fmt(t.q[2])} per m²; ${pct(t.offplan)} off-plan.
        Mostly new master communities on the desert edge: ${topFive}.</div>`);
  }

  // =====================================================================
  // STEP 4, Interactions
  // Every handler does the same two things: change `state`, call update().
  // =====================================================================

  // Hover a station row -> tooltip. Click it -> show it in the side panel.
  LINES.forEach((L) => {
    L.rows
      .on("mouseenter", (event, r) => showTip(event, stationTip(r.s)))
      .on("mousemove", moveTip)
      .on("mouseleave", hideTip)
      .on("click", (event, r) => {
        state.selected = dataOf(r.s).code;
        update();
      });
  });

  // Drag across a price axis -> highlight stations whose median is in that range.
  LINES.forEach((L) => {
    L.brush = d3
      .brushX()
      .extent([[PRICE_X, HEAD - 22], [PRICE_X + PRICE_W, HEAD - 2]])
      .on("brush end", (event) => onBrush(event, L));
    L.brushG = L.svg.append("g").attr("class", "brush").call(L.brush);
  });

  function onBrush(event, L) {
    if (!event.sourceEvent) return; // ignore moves made by code (clearing)
    LINES.filter((o) => o !== L).forEach((o) => o.brushG.call(o.brush.move, null)); // one band at a time
    state.band = event.selection ? event.selection.map(x.invert) : null; // pixels -> AED/m²
    update(false);
  }

  function clearBand(event) {
    event.preventDefault();
    state.band = null;
    LINES.forEach((o) => o.brushG.call(o.brush.move, null));
    update(false);
  }

  // Buttons: period, off-plan/ready, what the bar shows
  onButtonGroupClick((key, value) => {
    state[key] = value;
    markButtonGroups(state);
    update();
  });

  // Finding cards: jump to the station that proves the point
  d3.selectAll("#findings button").on("click", (event, d) => {
    if (d.scrollOnly) {
      document.getElementById("nostation").scrollIntoView({ behavior: "smooth" });
      return;
    }
    d.go();
    Object.assign(state, { period: "recent", reg: "all" });
    markButtonGroups(state);
    update();
    document.getElementById("panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  // Map: hover a community for its name
  commPaths
    .on("mouseenter", (event, f) => showTip(event, communityTip(f)))
    .on("mousemove", moveTip)
    .on("mouseleave", hideTip);

  // --- tooltip text --------------------------------------------------------
  function stationTip(st) {
    const t = stat(st);
    const R = riders(st);
    const v = venues(st);
    let h = `<div class="t-title">${label(st)} <span class="muted">${st.code}</span></div>`;
    if (INTERCHANGE[st.code]) {
      h += `<div class="t-note">Interchange: sales are counted under ${dataOf(st).name} (${INTERCHANGE[st.code]}).</div>`;
    }
    if (t) {
      h += tipRow("Homes sold (10% sample)", fmt(t.n));
      h += tipRow("Typical price per m²", "AED " + fmt(t.q[2]));
      h += tipRow("Middle half of sales", `${fmt(t.q[1])}-${fmt(t.q[3])}`);
      h += tipRow("Typical home price", aed(t.price));
      if (t.dist != null) h += tipRow("Typical distance to station", t.dist + " km");
    } else {
      h += `<div class="t-note">No home sales recorded near this station for this filter.</div>`;
    }
    h += tipRow("Metro riders" + (R ? " " + R.year : ""), R ? R.v + "M" : "not published");
    if (v != null) h += tipRow("Places nearby", v);
    return h;
  }

  function communityTip(f) {
    const c = data.comms[f.properties.c];
    const t = byCode.get(state.selected).stats[statsKey()];
    const hit = t && t.comms.find((z) => z[0] === f.properties.c);
    const freehold = FREEHOLD.has(f.properties.c) ? ", in the 2006 freehold list" : "";
    let h = `<div class="t-title">${c.known}</div><div class="t-note">${c.name}${freehold}</div>`;
    if (hit) h += tipRow("Sales via this station", hit[1]);
    return h;
  }

  function tipRow(name, value) {
    return `<div class="t-row"><span>${name}</span><span>${value}</span></div>`;
  }

  // =====================================================================
  // STEP 5, Update
  // Reads `state` and moves every mark to match it (with a transition).
  // redrawPanel = false while brushing, so dragging stays smooth.
  // =====================================================================
  function update(redrawPanel = true) {
    const T = d3.transition().duration(450);
    const dubai = data.dubai[statsKey()];
    const barScale = d3.scaleLinear().domain([0, barMax[state.bar]()]).range([0, BAR_W]);
    const barCaption = { sales: "Homes sold", riders: "Riders per year", venues: "Places nearby" }[state.bar];

    LINES.forEach((L) => {
      L.barCap.text(barCaption);
      L.dubaiLine.transition(T).attr("x1", x(dubai.q[2])).attr("x2", x(dubai.q[2]));
      L.dubaiLabel.transition(T).attr("x", x(dubai.q[2])).text(`Dubai median ${fmt(dubai.q[2])}`);
      L.band
        .attr("display", state.band ? null : "none")
        .attr("x", state.band ? x(state.band[0]) : 0)
        .attr("width", state.band ? x(state.band[1]) - x(state.band[0]) : 0);

      L.rows.each(function (r) {
        updateRow(d3.select(this), r.s, L, barScale, T);
      });
    });

    drawHowTo();
    if (redrawPanel) drawPanel();
    drawBandNote();
  }

  function updateRow(g, st, L, barScale, T) {
    const t = INTERCHANGE[st.code] ? null : stat(st); // interchanges show "see …" instead
    const inBand = !state.band || (t && t.q[2] >= state.band[0] && t.q[2] <= state.band[1]);
    g.classed("sel", dataOf(st).code === state.selected)
      .classed("dim", !inBand)
      .classed("empty", !t && !INTERCHANGE[st.code]);

    // bar + its number
    const v = barValue(st);
    const R = riders(st);
    const olderRiderYear = state.bar === "riders" && R && R.year < 2025;
    g.select(".bar")
      .attr("fill", olderRiderYear ? "#b9b6ad" : "#5d5c57")
      .transition(T)
      .attr("width", v ? Math.max(1.5, barScale(v)) : 0);
    g.select(".val")
      .transition(T)
      .attr("x", BAR_X + (v ? barScale(v) : 0) + 4)
      .text(v ? barText(v) : state.bar === "riders" ? "-" : "");

    // price dot (median) + band (P25-P75). Hollow dot = homes are more than 2 km away.
    const far = t && t.dist != null && t.dist > 2;
    g.select(".iqr")
      .attr("display", t ? null : "none")
      .transition(T)
      .attr("x1", t ? x(t.q[1]) : PRICE_X)
      .attr("x2", t ? x(t.q[3]) : PRICE_X);
    g.select(".med")
      .attr("display", t ? null : "none")
      .attr("fill", far ? "#fff" : LINE_COLOR[L.key])
      .transition(T)
      .attr("cx", t ? x(t.q[2]) : PRICE_X);
    g.select(".none").text(INTERCHANGE[st.code] ? `see ${dataOf(st).name}` : t ? "" : "no home sales");
  }

  function drawBandNote() {
    const el = d3.select("#bandnote");
    if (!state.band) {
      el.text("Tip: drag across a price axis to highlight stations in your price range.");
      return;
    }
    const [lo, hi] = state.band;
    const hits = data.stations.filter((s) => {
      const t = s.stats[statsKey()];
      return s.code !== "NONE" && !INTERCHANGE[s.code] && t && t.q[2] >= lo && t.q[2] <= hi;
    });
    el.html(`AED ${fmt(lo)}-${fmt(hi)} per m²: ${hits.length} stations. <a href="#" id="clearband">clear</a>`);
    d3.select("#clearband").on("click", clearBand);
  }

  // The small "how to read" legend above the diagrams
  function drawHowTo() {
    const c = LINE_COLOR.Red;
    const barMeaning = {
      sales: "homes sold (10% sample)",
      riders: "metro riders per year (RTA; grey = older year)",
      venues: "Foursquare places within reach",
    }[state.bar];
    d3.select("#howto").html(`
      <span><svg width="58" height="14"><line x1="8" x2="50" y1="7" y2="7" stroke="${tint(c, 0.3)}" stroke-width="6" stroke-linecap="round"/><circle cx="26" cy="7" r="4.8" fill="${c}" stroke="${c}" stroke-width="2"/></svg>typical price (dot) and middle half of sales (band)</span>
      <span><svg width="16" height="14"><circle cx="8" cy="7" r="4.8" fill="#fff" stroke="${c}" stroke-width="2"/></svg>hollow = homes are more than 2 km away</span>
      <span><svg width="34" height="14"><line x1="2" x2="2" y1="0" y2="14" stroke="var(--text-primary)" stroke-dasharray="3 3"/></svg>Dubai median</span>
      <span><svg width="30" height="14"><rect x="0" y="3" width="26" height="9" rx="2" fill="#5d5c57"/></svg>${barMeaning}</span>`);
  }

  // --- side panel for the selected station ---------------------------------
  function drawPanel() {
    const s = byCode.get(state.selected);
    const t = s.stats[statsKey()];
    const dubai = data.dubai[statsKey()];
    const R = riders(s);

    d3.select("#p-kicker").text(`${s.route === "Tram" ? "Dubai Tram" : s.route + " Line"} (${s.code})`);
    d3.select("#p-title").text(label(s));
    d3.select("#p-sub").text(
      t ? `${fmt(t.n)} homes sold in the 10% sample (≈ ${fmt(t.n * 10)} in reality)`
        : "No home sales recorded near this station for this filter."
    );

    // KPI tiles: [big value, small label]
    const vsDubai = t ? `${t.q[2] > dubai.q[2] ? "+" : ""}${pct(t.q[2] / dubai.q[2] - 1)}` : "";
    const kpis = t
      ? [
          [fmt(t.q[2]), `AED/m², ${vsDubai} vs Dubai`],
          [aed(t.price), "typical home"],
          [pct(t.offplan), "off-plan"],
          [t.size + " m²", "typical size"],
          [t.dist != null ? t.dist + " km" : "n/a", "typical distance"],
          [venues(s) ?? "n/a", "places nearby"],
        ]
      : [];
    let ridersNote = "ridership not published by RTA";
    if (R) {
      ridersNote = `metro riders in ${R.year} (RTA)`;
      if (Object.keys(R.all).length > 1) {
        ridersNote += ". " + Object.entries(R.all).map(([yy, vv]) => `${yy}: ${vv}M`).join(", ");
      }
    }
    d3.select("#p-kpis").html(
      kpis.map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("") +
        `<div class="kpi wide"><div class="v">${R ? R.v + "M" : "n/a"}</div><div class="l">${ridersNote}</div></div>`
    );

    drawHistogram(t, dubai);
    drawWaffle(t);
    drawMap(s, t);
    drawVenues(s);
    d3.select("#p-comms").html(
      t ? t.comms.slice(0, 6).map(([c, n]) => `<li><span>${data.comms[c].known}</span><span>${n}</span></li>`).join("") : ""
    );
  }

  // Price histogram: this station (blue bars) vs all of Dubai (black step line)
  function drawHistogram(t, dubai) {
    const svg = d3.select("#p-hist");
    svg.selectAll("*").remove();
    const W2 = 340, H = 120, m = { l: 6, r: 6, t: 18, b: 22 };
    const bins = data.logBins; // bin edges in log10(AED/m²)
    const hx = d3.scaleLog().domain([1000, 100000]).range([m.l, W2 - m.r]);
    const share = (counts) => {
      const total = d3.sum(counts);
      return counts.map((v) => (total ? v / total : 0));
    };
    const dubaiShare = share(dubai.hist);
    const stationShare = t ? share(t.hist) : null;
    const hy = d3.scaleLinear().domain([0, d3.max(dubaiShare.concat(stationShare || []))]).range([H - m.b, m.t]);

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(hx).tickValues([1000, 3000, 10000, 30000, 100000]).tickFormat((d) => d / 1000 + "k").tickSize(3));
    if (stationShare) {
      svg.append("g").selectAll("rect").data(stationShare).join("rect")
        .attr("x", (d, i) => hx(10 ** bins[i]) + 1)
        .attr("width", (d, i) => hx(10 ** bins[i + 1]) - hx(10 ** bins[i]) - 2)
        .attr("y", (d) => hy(d))
        .attr("height", (d) => H - m.b - hy(d))
        .attr("rx", 1.5)
        .attr("fill", "#2a78d6");
    }
    const stepPoints = dubaiShare
      .map((d, i) => [hx(10 ** bins[i]), hy(d)])
      .concat([[hx(10 ** bins[bins.length - 1]), hy(dubaiShare[dubaiShare.length - 1])]]);
    svg.append("path").attr("d", d3.line().curve(d3.curveStepAfter)(stepPoints))
      .attr("fill", "none").attr("stroke", "var(--text-primary)").attr("stroke-width", 1.5);
    svg.append("text").attr("x", m.l).attr("y", 11).attr("font-size", 11)
      .html(`<tspan fill="#2a78d6">■ this station</tspan>  <tspan fill="#0b0b0b">line = all of Dubai</tspan>`);
  }

  // Waffle: 100 squares = the mix of home types sold (studio, 1BR, … villa)
  function drawWaffle(t) {
    const svg = d3.select("#p-waffle");
    svg.selectAll("*").remove();
    if (!t || !d3.sum(t.mix)) return;

    // Round to whole squares so they add up to exactly 100 (largest remainder)
    const total = d3.sum(t.mix);
    const raw = t.mix.map((v) => (v / total) * 100);
    const cells = raw.map(Math.floor);
    raw.map((v, i) => [v - Math.floor(v), i])
      .sort((a, b) => b[0] - a[0])
      .slice(0, 100 - d3.sum(cells))
      .forEach(([, i]) => cells[i]++);

    const seq = cells.flatMap((count, type) => d3.range(count).map(() => type));
    const size = 9.4, gap = 1.6;
    svg.selectAll("rect").data(seq).join("rect")
      .attr("x", (d, i) => Math.floor(i / 10) * (size + gap) + Math.floor(i / 50) * 6)
      .attr("y", (d, i) => (i % 10) * (size + gap))
      .attr("width", size).attr("height", size).attr("rx", 2)
      .attr("fill", (d) => SEG_COLORS[d]);

    const legend = svg.append("g").attr("transform", "translate(124,4)");
    data.segs.forEach((name, i) => {
      const row = legend.append("g").attr("transform", `translate(${(i % 2) * 108},${Math.floor(i / 2) * 30})`);
      row.append("rect").attr("width", 10).attr("height", 10).attr("rx", 2).attr("fill", SEG_COLORS[i]).attr("y", 2);
      row.append("text").attr("x", 15).attr("y", 11).attr("font-size", 12).attr("fill", "#0b0b0b")
        .text(name === "Villa" ? "Villa/townhouse" : name);
      row.append("text").attr("x", 15).attr("y", 24).attr("font-size", 11).attr("class", "num").text(`${cells[i]}%`);
    });
  }

  // Map: shade the communities whose sales were counted at this station
  function drawMap(s, t) {
    const counts = new Map(t ? t.comms : []);
    const maxCount = d3.max([...counts.values()]) || 1;
    const colour = d3.scaleSequential([0, maxCount], d3.interpolateRgb("#cde2fb", "#184f95"));
    commPaths.transition().duration(300)
      .attr("fill", (f) => (counts.has(f.properties.c) ? colour(counts.get(f.properties.c)) : "#e9e7e1"));

    selMark.selectAll("*").remove();
    if (s.lat) {
      const [px, py] = proj([s.lon, s.lat]);
      if (t) {
        t.comms.forEach(([c]) => {
          const f = geo.features.find((ff) => ff.properties.c === c);
          if (!f) return;
          const [cx, cy] = path.centroid(f);
          selMark.append("line").attr("x1", px).attr("y1", py).attr("x2", cx).attr("y2", cy)
            .attr("stroke", "#8a8880");
        });
      }
      selMark.append("circle").attr("cx", px).attr("cy", py).attr("r", 6)
        .attr("fill", "#fff").attr("stroke", "var(--text-primary)").attr("stroke-width", 2.5);
    }
    d3.select("#p-map-note").text(
      (s.lat
        ? "Blue: communities whose sales were counted at this station (darker = more); lines join them to the station (white dot). "
        : "Tram stop coordinates are not in the course files, so only the communities are shaded. ") +
        "Dashed: areas in Dubai's original 2006 freehold list."
    );
  }

  // Places nearby, grouped into 5 bars
  function drawVenues(s) {
    const svg = d3.select("#p-venues");
    svg.selectAll("*").remove();
    if (!s.venues) {
      svg.append("text").attr("y", 14).attr("font-size", 12).attr("fill", "#8a8880").text("No venue data for this stop.");
      return;
    }
    const vals = VENUE_GROUPS.map((grp) => ({ name: grp.name, v: d3.sum(grp.cats, (c) => s.venues[c] || 0) }));
    const vx = d3.scaleLinear().domain([0, d3.max(vals, (d) => d.v) || 1]).range([0, 150]);
    const r = svg.selectAll("g").data(vals).join("g").attr("transform", (d, i) => `translate(0,${i * 19})`);
    r.append("text").attr("y", 12).attr("font-size", 12).attr("fill", "#0b0b0b").text((d) => d.name);
    r.append("rect").attr("x", 130).attr("y", 3).attr("height", 11).attr("rx", 2).attr("fill", "#5d5c57")
      .attr("width", (d) => Math.max(1, vx(d.v)));
    r.append("text").attr("x", (d) => 134 + vx(d.v)).attr("y", 12).attr("font-size", 11).attr("class", "num").text((d) => d.v);
  }

  // First paint
  update();
}
