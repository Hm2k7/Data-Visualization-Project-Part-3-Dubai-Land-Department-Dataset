# CS333 Part 3 · Group 3 · Dubai real estate, three new ways to look at it

Three interactive D3 (v7) visualizations of the Dubai Land Department transactions (10% sample), combined with the
course's community boundaries, metro stations, population and Foursquare venues.

| # | Visualization | Folder | Owner |
|---|---|---|---|
| 1 | **Along the Line**: metro/tram strip map with price glyphs + station profile | `vis1-metro/` | Hassan Mousa |
| 2 | **Boom Paths**: VSUP grid map + connected scatterplot | `vis2-trajectories/` | Khalid Albadda |
| 3 | **Where Should I Buy?**: LineUp-style ranker + map + budget dot plot | `vis3-ranker/` | Osama Mohammed |

## Folder layout

```
index.html                landing page (links, data-quality table, references)
assets/common.css         shared styles (palette, fonts, tooltip)
vis1-metro/index.html     Visualization 1
vis2-trajectories/        Visualization 2
vis3-ranker/              Visualization 3
data/                     JSON produced by the prep script (what the pages load)
data/external/            outside data from official sources + SOURCES.md (how each file is linked)
prep/prepare_data.py      data cleaning + aggregation (pandas, numpy, shapely)
```

## Outside data

| File | Source | Linked by | Used in |
|---|---|---|---|
| `worldbank_uae_inflation.csv` | World Bank WDI, FP.CPI.TOTL.ZG | year | Vis 2 real prices, Vis 3 momentum |
| `rta_metro_station_ridership.csv` | RTA / Dubai Media Office press releases | station code | Vis 1 ridership |
| `dubai_freehold_areas_2006.csv` | Dubai Regulation No. 3 of 2006 | community name | Vis 1 station map |

Details, URLs and caveats: `data/external/SOURCES.md`.

## Re-create the data

```bash
pip install pandas numpy shapely
# download the course files (transactions.csv, dubai.geojson, dubai_metro_stations.geojson,
# dubai_venues.csv, metro_venues_total.csv) into ./raw, then:
cd prep && python prepare_data.py ../raw
```

The script prints every cleaning step with the number of rows it removes and writes `data/cleaning_log.json`.

## Run locally

The pages load JSON with `fetch`, so open them through a web server, not by double-clicking:

```bash
python -m http.server 8000      # then open http://localhost:8000/
```

## Publish on GitHub Pages (same as Part 2)

1. Create a repo (e.g. `Data-Visualization-Project-Part-3`) and push this folder to `main`.
2. Settings → Pages → Deploy from branch → `main` / root.
3. The URLs to submit are then
   - `https://<user>.github.io/<repo>/vis1-metro/`
   - `https://<user>.github.io/<repo>/vis2-trajectories/`
   - `https://<user>.github.io/<repo>/vis3-ranker/`
