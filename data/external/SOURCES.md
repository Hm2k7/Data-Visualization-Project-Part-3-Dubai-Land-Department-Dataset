# Outside data: sources and how each file is linked to the transactions

All three files are small, hand-checked extracts from official publications. They live next to the course
data so `prep/prepare_data.py` can read them. Retrieved 20 November 2026.

## 1. `worldbank_uae_inflation.csv`: UAE consumer-price inflation, 2014-2025

- **Source:** World Bank, World Development Indicators, indicator `FP.CPI.TOTL.ZG` ("Inflation, consumer prices
  (annual %)"), United Arab Emirates.
  - Open it in a browser (chart, table, CSV/Excel download): https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=AE
  - The same numbers as raw data (what the prep script used): https://api.worldbank.org/v2/country/ARE/indicator/FP.CPI.TOTL.ZG?format=json&date=2014:2025
    (last updated 2026-07-13). The 2008-2023 values match the mirror at https://github.com/datasets/cpi.
- **How it is linked:** by **year**. The prep script chains the yearly rates into a price index (2015 = 100, so
  2025 = 113.2) and divides every sale's AED/m² by the index of its year, giving prices in 2015 dirhams.
  There is no 2026 figure yet, so 2026 uses the 2025 level.
- **Used in:** Vis 2 ("Real (2015 AED)" switch: sparklines, connected scatterplot, price level and growth) and
  Vis 3 (the Momentum criterion is real growth).
- **Caveat:** this is the national UAE index, not a Dubai-only one. The Dubai index (Dubai Data and Statistics
  Establishment) uses 2021 = 100 and is only easily available from 2022 onwards.

## 2. `rta_metro_station_ridership.csv`: annual riders per metro station, 2019 and 2022-2025

- **Source:** the Roads and Transport Authority's annual ridership press releases, published on rta.ae and by
  the Dubai Media Office (one URL per row in the `source` column):
  - 2019: https://rta.ae/wps/portal/rta/ae/home/news-and-media/all-news/NewsDetails/594m+riders+used+public+transport,+shared+mobility+and+taxis+in+2019
  - 2022: https://www.mediaoffice.ae/en/news/2023/February/26-02/rta
  - 2023: https://mediaoffice.ae/en/news/2024/february/18-02/702-million-riders-used-public-transport
  - 2024: https://www.mediaoffice.ae/en/news/2025/february/02-02/747-million-riders-used-public-transport
  - 2025: https://mediaoffice.ae/en/news/2026/february/15-02/rta-records-802-riders-in-dubai-2025
- **How it is linked:** by **station code** in `dubai_metro_stations.geojson`. Names were matched by hand,
  including renames: "Sharaf DG" on the Green Line is the former Al Fahidi (G25), renamed 24 November 2020;
  "Dubai Multi-Commodities Centre" is DMCC (R37). All 47 rows matched one of 14 stations.
- **Used in:** Vis 1 ("RTA riders" switch below the line, tooltips, station panel, story note).
- **Caveat:** RTA only publishes its busiest stations, so 42 of the 56 stations have no figure (shown as "-").
  The full trip-level data is on Dubai Pulse (`rta_metro_ridership-open`), but it needs an access request.

## 3. `dubai_freehold_areas_2006.csv`: the original freehold areas

- **Source:** Regulation No. (3) of 2006 Determining Areas for Ownership by Non-UAE Nationals of Real Property in the
  Emirate of Dubai, issued 7 June 2006, Article (3), published by the Supreme Legislation Committee:
  - Official document (PDF): https://dlp.dubai.gov.ae/Legislation%20Reference/2006/Regulation%20No.%20(3)%20of%202006%20Concerning%20determining%20the%20areas%20of%20ownership%20of%20real%20estate.pdf
  - Dubai Legislation Portal search (search "Regulation No. (3) of 2006"): https://dlp.dubai.gov.ae/en/Pages/LegislationSearch.aspx
  - Text version: https://dlp.dubai.gov.ae/Legislation%20Reference/2006/Regulation%20No.%20%283%29%20of%202006.html
  The regulation itself is a numbered list of 23 areas with their land-plot numbers, so the plot
  numbers you see in it are expected.
- **How it is linked:** by **community name** to `CNAME_E` / `COMM_NUM` in `dubai.geojson`. 16 of the 23 areas
  match (e.g. "Dubai Marina" = MARSA DUBAI, "Palm Jumairah" = NAKHLAT JUMEIRA). 7 do not: Emirates Hills 1-3,
  Jebel Ali, Al Rowyah, Sheikh Zayed Road and Nad al-Sheba. Either the name is not a community in the file, or the
  plots could fall in several communities. The `match_note` column gives the reason for each.
- **Used in:** Vis 1 (dashed outline on the station map; it explains why the busiest old-core stations have no
  freehold sales).
- **Caveat:** later resolutions (2010-2022) added more areas, so this is the *original* list only, not today's
  full freehold map.
