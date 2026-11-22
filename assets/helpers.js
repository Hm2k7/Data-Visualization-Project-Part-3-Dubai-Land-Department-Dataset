/* =====================================================================
   Shared helpers for all three visualizations
   ---------------------------------------------------------------------
   Small things every page needs: number formats, the hover tooltip and
   the button groups (the grey "segmented" buttons above each chart).
   Loaded before each page's own main.js.
   ===================================================================== */

// ---------------------------------------------------------------------
// Number formats
// ---------------------------------------------------------------------
const fmt = d3.format(",.0f"); //        12345  -> "12,345"
const pct = d3.format(".0%"); //          0.45  -> "45%"
const pctSigned = d3.format("+.0%"); //   0.45  -> "+45%"

// Money in dirhams, short form: 850000 -> "AED 850k", 1250000 -> "AED 1.25M"
function aed(value) {
  if (value >= 1e6) return "AED " + d3.format(".2~f")(value / 1e6) + "M";
  return "AED " + d3.format(",.0f")(value / 1e3) + "k";
}

// A lighter, solid version of a colour (amount 0 = background, 1 = the colour).
// Used instead of transparency so overlapping marks don't mix.
// Mixed in CSS so it follows the light/dark theme.
function tint(colour, amount) {
  return `color-mix(in srgb, ${colour} ${amount * 100}%, var(--halo))`;
}

// ---------------------------------------------------------------------
// Tooltip (one <div id="tt"> per page)
// ---------------------------------------------------------------------
const tooltip = d3.select("#tt");

function showTip(event, html) {
  tooltip.html(html).style("opacity", 1);
  moveTip(event);
}

// Follow the mouse; flip to the left side if the box would leave the screen.
function moveTip(event) {
  const width = tooltip.node().offsetWidth;
  const wouldOverflow = event.clientX + 14 + width > innerWidth;
  const left = wouldOverflow ? event.clientX - width - 14 : event.clientX + 14;
  tooltip.style("left", left + "px").style("top", event.clientY + 12 + "px");
}

function hideTip() {
  tooltip.style("opacity", 0);
}

// ---------------------------------------------------------------------
// Button groups
// HTML: <div class="seg" data-key="period"><button data-v="recent">…</button>…</div>
// data-key = which field of `state` the group controls, data-v = the value.
// ---------------------------------------------------------------------

// Call handler(key, value) whenever a button in any group is clicked.
function onButtonGroupClick(handler) {
  d3.selectAll(".seg").each(function () {
    const key = this.dataset.key;
    d3.select(this)
      .selectAll("button")
      .on("click", function () {
        handler(key, this.dataset.v);
      });
  });
}

// Highlight the button in each group that matches the current state.
function markButtonGroups(state) {
  d3.selectAll(".seg").each(function () {
    const key = this.dataset.key;
    d3.select(this)
      .selectAll("button")
      .classed("on", function () {
        return this.dataset.v === state[key];
      });
  });
}
