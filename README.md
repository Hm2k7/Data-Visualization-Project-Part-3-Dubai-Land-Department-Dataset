# Dubai Real Estate: Three New Ways to Look at It

**CS333 Introduction to Data Visualization · Project Part 3 · Group 3**

Three interactive D3 visualizations built on the Dubai Land Department transactions (10% sample, 2015 to
September 2026). Each one answers a question that a city planner, an investor or a buyer would ask, and
each combines the transactions with other data about Dubai: community boundaries, metro stations,
population, Foursquare venues and three datasets from official outside sources.

| # | Visualization | Question it answers | Built for |
|---|---|---|---|
| 1 | **Along the Line** (`vis1-metro/`) | Does the metro serve the places where homes are sold? | City planners |
| 2 | **Boom Paths** (`vis2-trajectories/`) | How did each community move through the 2015–2026 cycle, and how reliable is each number? | Investors & developers |
| 3 | **Where Should I Buy?** (`vis3-ranker/`) | With my budget and priorities, which community should I look at? | Buyers |

The landing page (`index.html`) links the three, summarises the data cleaning and lists the sources and research behind the designs.

---

## The visualizations

### 1 · Along the Line: metro and tram price profiles

Each metro and tram line is drawn as a vertical line diagram, like the maps on station walls: one row per station, in the order the train stops.
- **Dot:** the typical price per m² of the homes sold near the station, on one shared axis, with Dubai's median as a dashed line. The band behind the dot covers the middle half of sales.
- **Hollow dot:** most buyers live more than 2 km away, so the station is not really walkable for them.
- **Bar:** one of three things, chosen with a button: homes sold, official RTA riders per year, or places nearby.
- **Finding cards:** four cards at the top state the main results and jump to the station that shows each one.
- **Station profile:** clicking a station shows its price histogram against Dubai, its mix of unit types, a map of where its buyers' homes are, and what is around it.

**Main finding:** the busiest stations (BurJuman, 17.8M riders in 2025) have no home sales, because the old core is not a freehold area, while 40% of homes sold in 2021–26 have no station at all.

### 2 · Boom Paths: community trajectories with uncertainty

**Grid map**

Each of 54 communities is a square, placed roughly where it is in Dubai, with a small price line for 2015–2026 inside it.
- **Orange:** below the Dubai average.
- **Blue:** above the Dubai average.
- **Grey:** about the same, or too few sales to tell.

The colour uses a value-suppressing uncertainty palette (VSUP). The wider a community's bootstrap interval, the fewer colour steps it gets and the greyer it looks, so a small sample cannot look as certain as a large one.

**Charts on the right**

Clicking squares adds them to two charts:
- **Connected scatterplot:** one dot per year (up = pricier, right = more homes sold).
- **Price line:** the same data as a plain line chart of price per m² by year.

A year slider and a Play button move all three views together. Prices can be shown as nominal AED or after inflation (2015 AED).

**Main finding:** Downtown and JVC both grew about 52%, but Downtown got pricier while JVC sold ten times more homes.

### 3 · Where Should I Buy? Multi-criteria community ranker

Choose a home type, a budget and a preference for ready or off-plan homes. Then pick a persona (first-time buyer, family, investor) or set your own weights for eight criteria:
- budget fit
- value
- price growth
- ease of resale
- ready / off-plan
- metro access
- places nearby
- how established the area is

How it shows the result:
- **Headline sentence:** answers in words, for example "With AED 1.2M for a 1BR flat, your best matches are…".
- **Ranking table:** each row's score is a stacked bar showing how much each criterion contributed, and a column gives the two strongest reasons in words.
- **Map:** shows the current top 10.
- **Dot plot:** clicking a row shows every recent sale there as one dot, against your budget.

**Main finding:** the answer changes with the weights, but Al Furjan is in the top two for every persona.

---

## How it works

```
course data (transactions.csv, dubai.geojson,        outside data (data/external/)
metro stations, venues, population)                  World Bank · RTA · Dubai Legislation Portal
            │                                                      │
            └──────────────► prep/prepare_data.py ◄────────────────┘
                              cleans, joins and aggregates
                                         │
                                         ▼
                 data/*.json  (small files, one per visualization)
                                         │
                                         ▼
              vis1-metro · vis2-trajectories · vis3-ranker  (D3.js v7)
```

- **`prep/prepare_data.py`** reads the course files and the outside data, applies the cleaning rules, matches names
  across datasets, computes medians, percentiles and bootstrap intervals, and writes one compact JSON file per
  visualization. It also records every cleaning step and anomaly in `data/cleaning_log.json`.
- **Each visualization** is an HTML page (layout and text) plus a `main.js` that loads its JSON file with D3 and draws
  everything in SVG. Every `main.js` follows the same five steps: load the data, set up state and scales, draw (the
  data join), wire the interactions, update. Every interaction changes the state, then update redraws from it.
  The three pages share one stylesheet (`assets/common.css`) and one small helpers file (`assets/helpers.js`:
  number formats, tooltip, buttons), so they look and work like one project. `CODE_GUIDE.md` walks through each file.
- **The landing page** reads `cleaning_log.json` to show the cleaning table and the data problems that were found.

### Data cleaning

| Step | Rows left | Why |
|---|---:|---|
| All transactions | 89,212 | 10% sample of DLD transactions |
| 2015-01-01 to 2026-09-17 | 67,548 | Earlier years are sparse and include impossible dates (back to 1967) |
| Sales only | 51,731 | Mortgages and gifts are not market prices |
| Residential units & villas | 42,413 | Land and buildings have no comparable price per m² |
| Price and size bounds | 42,323 | Zero, symbolic or extreme prices and sizes |

Other problems found and handled:
- **Weekday gap:** before 2022 there are no Sunday transactions although Sunday was a working day, and Monday has about twice the volume of other weekdays. No analysis goes below monthly level.
- **Station names:** the nearest-station column mixes metro stations, tram stops, renamed stations and a typo. All 56 labels were mapped to station codes.
- **Partial 2026:** 2026 is a partial year, so its volumes are annualised and drawn hollow.
- **Venue cap:** the venue file caps each community at 100 venues, so the ranking uses ranks rather than raw counts.

### Outside data

| File | Source | Linked by | Used in |
|---|---|---|---|
| `worldbank_uae_inflation.csv` | [World Bank Open Data, UAE consumer-price inflation](https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=AE) | year | Real prices (Vis 2), price growth (Vis 3) |
| `rta_metro_station_ridership.csv` | [RTA / Dubai Media Office annual ridership releases](https://mediaoffice.ae/en/news/2026/february/15-02/rta-records-802-riders-in-dubai-2025) | station code | Metro riders (Vis 1) |
| `dubai_freehold_areas_2006.csv` | [Dubai Regulation No. 3 of 2006](https://dlp.dubai.gov.ae/Legislation%20Reference/2006/Regulation%20No.%20(3)%20of%202006%20Concerning%20determining%20the%20areas%20of%20ownership%20of%20real%20estate.pdf) (Dubai Legislation Portal) | community name | Freehold areas on the station map (Vis 1) |

Full citations, matching rules and caveats are in `data/external/SOURCES.md`.

### Folder structure

```
index.html                 landing page
CODE_GUIDE.md              walkthrough of the code, one section per visualization
assets/                    shared stylesheet, helpers.js and preview images
vis1-metro/                Visualization 1 · Along the Line (index.html + main.js)
vis2-trajectories/         Visualization 2 · Boom Paths (index.html + main.js)
vis3-ranker/               Visualization 3 · Where Should I Buy? (index.html + main.js)
data/                      processed data loaded by the pages
data/external/             outside data and SOURCES.md
prep/prepare_data.py       data cleaning and preparation
```

### Research behind the designs

- Wu et al. (2020), *A Survey on Transit Map Layout*: line diagrams (Vis 1)
- Cleveland & McGill (1984/1987), graphical perception: position on a shared axis is read most accurately (Vis 1)
- Correll, Moritz & Heer (2018), *Value-Suppressing Uncertainty Palettes* (Vis 2)
- Meulemans et al. (2017), *Small Multiples with Gaps*: grid maps (Vis 2)
- Haroz, Kosara & Franconeri (2016), *The Connected Scatterplot* (Vis 2)
- Gratzl et al. (2013), *LineUp: Visual Analysis of Multi-Attribute Rankings* (Vis 3)
- Weng et al. (2018), *Homefinder Revisited* (Vis 3)
- Park et al. (2018), *ATOM: A Grammar for Unit Visualizations* (Vis 3)
- Shneiderman (1996), *The Eyes Have It*; Borkin et al. (2016), *Beyond Memorability* (all three)

---

## Team & contributions

Hassan Mousa (24000292) · Khalid Albadda (24000542) · Osama Mohammed (24001318)

| Member | Visualization | Contributions |
|---|---|---|
| **Hassan Mousa** (24000292) | Vis 1 · Along the Line | Station-name mapping, station statistics and RTA ridership data; the line-diagram visualization and station profile; data-quality analysis; presentation intro and closing |
| **Khalid Albadda** (24000542) | Vis 2 · Boom Paths | Cleaning rules, yearly community statistics, bootstrap intervals and inflation adjustment; the grid map, uncertainty colours, connected scatterplot and price line; shared styling; checking all figures |
| **Osama Mohammed** (24001318) | Vis 3 · Where Should I Buy? | Ranking criteria (venues, population, metro distance, freehold areas); the ranking table, map and budget dot plot; landing page and GitHub Pages site |
