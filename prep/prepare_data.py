"""
CS333 Part 3 - data preparation for the three D3 visualizations.

Input  : the course files (same as Part 2 + Part 3 extras), downloaded from
         https://github.com/sharios/CS333/tree/main/2026-27
Output : small JSON files in ../data/ that the D3 pages load.
Outside: ../data/external/*.csv, three small datasets from official sources
         (World Bank, RTA / Dubai Media Office, Dubai Legislation Portal); see SOURCES.md.

Run    : python prepare_data.py  <folder-with-the-raw-course-files>

Every cleaning decision is listed in CLEANING below and printed with the
number of rows it affects, so the numbers in the presentation can be traced
back to this script.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from shapely.geometry import shape, mapping

RAW = Path(sys.argv[1] if len(sys.argv) > 1 else "../../data")
OUT = Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(exist_ok=True)
RNG = np.random.default_rng(333)          # fixed seed -> reproducible bootstrap

LAST_DAY = pd.Timestamp("2026-09-17")      # last date in transactions.csv
DAYS_2026 = (LAST_DAY - pd.Timestamp("2026-01-01")).days + 1
ANNUALISE_2026 = 365 / DAYS_2026           # 2026 is a partial year

log = []                                   # cleaning log -> data/cleaning_log.json


def note(rule, before, after, why):
    log.append({"rule": rule, "rows_before": int(before), "rows_after": int(after),
                "removed": int(before - after), "why": why})
    print(f"{rule:<40} {before:>7} -> {after:>7}  ({before - after} removed)")


# ---------------------------------------------------------------- load
tx = pd.read_csv(RAW / "transactions.csv")
tx["date"] = pd.to_datetime(tx["instance_date"])
tx["year"] = tx["date"].dt.year
n0 = len(tx)

# Arabic label for "Other" in property_usage_en
tx["property_usage_en"] = tx["property_usage_en"].replace({"أخرى": "Other"})

# ---------------------------------------------------------------- station names
# DLD's nearest_metro_en mixes metro stations, tram stops, renamed stations and
# one typo. We map every label onto one station code from
# dubai_metro_stations.geojson (Rxx / Gxx) or onto a Dubai Tram stop (Txx,
# order from RTA: T1 JBR 1 ... T11 Al Sufouh).
STATION_MAP = {
    "Rashidiya Metro Station": "R11", "Emirates Metro Station": "R12",
    "Terminal 3": "R13", "Airport Terminal 1 Metro Station": "R14",
    "GGICO Metro Station": "R15", "Deira City Centre": "R16",
    "Al Rigga Metro Station": "R17", "Union Metro Station": "R18",
    "Burjuman Metro Station": "R19", "ADCB Metro Station": "R20",
    "Al Jafiliya Metro Station": "R21", "Trade Centre Metro Station": "R22",
    "Emirates Towers Metro Station": "R23", "Financial Centre": "R24",
    "Buj Khalifa Dubai Mall Metro Station": "R25",            # typo "Buj"
    "Business Bay Metro Station": "R26", "Noor Bank Metro Station": "R29",
    "First Abu Dhabi Bank Metro Station": "R31",             # = FGB in geojson
    "Sharaf Dg Metro Station": "R33",                        # = Mashreq in geojson
    "Dubai Internet City": "R34", "Nakheel Metro Station": "R35",
    "Damac Properties": "R36", "Jumeirah Lakes Towers": "R37",  # = DMCC
    "Harbour Tower": "R38",                                  # Nakheel Harbour & Tower = Jabal Ali
    "Ibn Battuta Metro Station": "R39", "ENERGY Metro Station": "R40",
    "DANUBE Metro Station": "R41", "UAE Exchange Metro Station": "R42",
    "Etisalat Metro Station": "G11", "Al Qusais Metro Station": "G12",
    "Airport Free Zone": "G13", "Al Nahda Metro Station": "G14",
    "STADIUM Metro Station": "G15", "Al Qiyadah Metro Station": "G16",
    "Abu Hail Metro Station": "G17", "Abu Baker Al Siddique Metro Station": "G18",
    "Salah Al Din Metro Station": "G19", "Baniyas Square Metro Station": "G21",
    "Palm Deira Metro Stations": "G22",                      # = Gold Souq
    "Al Ras Metro Station": "G23", "Al Ghubaiba Metro Station": "G24",
    "Al Fahidi Metro Station": "G25", "Oud Metha Metro Station": "G27",
    "Healthcare City Metro Station": "G28", "Al Jadaf Metro Station": "G29",
    "Creek Metro Station": "G30",
    # Dubai Tram stops
    "Jumeirah Beach Residency": "T1", "Jumeirah Beach Resdency": "T1",  # typo merged
    "Marina Mall Metro Station": "T4", "Dubai Marina": "T5",
    "Marina Towers": "T6", "Mina Seyahi": "T7", "Media City": "T8",
    "Palm Jumeirah": "T9", "Knowledge Village": "T10", "Al Sufouh": "T11",
}
unmapped = set(tx["nearest_metro_en"].dropna()) - set(STATION_MAP)
assert not unmapped, unmapped
tx["station"] = tx["nearest_metro_en"].map(STATION_MAP).fillna("NONE")

# ---------------------------------------------------------------- cleaning
CLEANING = """
1. Keep 2015-01-01 .. 2026-09-17 (same window as Parts 1-2; earlier years are
   sparse and include implausible dates such as 1967). 2026 is a partial year:
   counts are annualised x{a:.3f} where a yearly volume is compared.
2. Keep trans_group 'Sales' only: mortgages and gifts are not market prices.
3. Keep residential Units and Villas (usage = Residential); land/buildings have
   no comparable price per m2.
4. Price sanity: 1,000 <= AED/m2 <= 100,000, 15 <= size <= 5,000 m2,
   price >= AED 100,000 (removes zero/symbolic and implausible values).
5. Robust statistics only (medians, quantiles); bootstrap CIs for uncertainty.
""".format(a=ANNUALISE_2026)
print(CLEANING)

s = tx[(tx.year >= 2015) & (tx.date <= LAST_DAY)]
note("1 date window 2015..2026-09-17", n0, len(s), "sparse/implausible early dates")
b = len(s); s = s[s.trans_group_en == "Sales"]
note("2 sales only", b, len(s), "mortgages & gifts are not market prices")
b = len(s); s = s[(s.property_usage_en == "Residential") & s.property_type_en.isin(["Unit", "Villa"])]
note("3 residential units & villas", b, len(s), "land/buildings not comparable per m2")
b = len(s)
s = s[s.meter_sale_price.between(1000, 100000) & s.procedure_area.between(15, 5000)
      & (s.actual_worth >= 100000)].copy()
note("4 price/size sanity bounds", b, len(s), "zero, symbolic or implausible prices/sizes")

s["offplan"] = (s.reg_type_en == "Off-Plan Properties").astype(int)


def segment(row):
    if row.property_type_en == "Villa":
        return "Villa"
    r = row.rooms_en
    if r == "Studio" or r == "Single Room":
        return "Studio"
    if r in ("1 B/R", "2 B/R", "3 B/R"):
        return r[0] + "BR"
    if r in ("4 B/R", "5 B/R", "6 B/R", "7 B/R", "PENTHOUSE"):
        return "4BR+"
    return "Unit n/a"


s["seg"] = s.apply(segment, axis=1)
SEGS = ["Studio", "1BR", "2BR", "3BR", "4BR+", "Villa"]

# ---------------------------------------------------------------- OUTSIDE DATA (data/external, see SOURCES.md)
EXT = OUT / "external"
# (a) World Bank: UAE consumer-price inflation, annual %  ->  price index with 2015 = 100
inf = pd.read_csv(EXT / "worldbank_uae_inflation.csv").set_index("year").inflation_pct
CPI = {2015: 100.0}
for y in range(2016, 2026):
    CPI[y] = CPI[y - 1] * (1 + inf[y] / 100)
CPI[2026] = CPI[2025]          # no 2026 figure published yet: assume 2025 prices
s["mps_real"] = s.meter_sale_price / s.year.map(CPI) * 100      # AED/m2 in 2015 dirhams
# (b) RTA: annual riders per metro station, from RTA / Dubai Media Office press releases
rta = pd.read_csv(EXT / "rta_metro_station_ridership.csv")
RIDERS = {code: {int(r.year): float(r.riders_million) for r in g.itertuples()} for code, g in rta.groupby("station_code")}
# (c) Dubai Regulation No. 3 of 2006: the original 23 freehold areas, matched to dubai.geojson communities
fh = pd.read_csv(EXT / "dubai_freehold_areas_2006.csv", dtype={"comm_num": "Int64"})
FREEHOLD_2006 = [int(c) for c in fh.comm_num.dropna()]
external_log = {
    "worldbank_cpi": {"years": f"2015-2025 (+2026 assumed = 2025)", "cpi_2025_vs_2015": round(CPI[2025], 2)},
    "rta_ridership": {"rows": int(len(rta)), "years": sorted(int(y) for y in rta.year.unique()),
                      "stations_with_a_figure": len(RIDERS), "matched_to_station_codes": int(rta.station_code.notna().sum())},
    "freehold_2006": {"areas_listed": int(len(fh)), "matched_to_communities": len(FREEHOLD_2006),
                      "not_matched": fh[fh.comm_num.isna()].area_as_written.tolist()},
}
print("outside data:", external_log)

# ---------------------------------------------------------------- anomalies worth reporting
wd = tx[tx.year.between(2015, 2021)].date.dt.dayofweek.value_counts().reindex(range(7), fill_value=0)
anomalies = {
    "weekday_2015_2021": {d: int(wd[i]) for i, d in enumerate(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])},
    "note_weekday": "Before 2022 Sunday was a working day in Dubai, yet the file has zero Sunday "
                    "transactions and Monday has ~2x the volume of any other weekday: Sunday "
                    "registrations appear folded into Monday. We therefore never analyse "
                    "below monthly granularity.",
    "missing_nearest_metro_pct": round(100 * tx.nearest_metro_en.isna().mean(), 1),
    "tram_stops_in_metro_column": int(tx.station.str.startswith("T").sum()),
    "stations_with_zero_transactions": ["R32 Mall of the Emirates", "R70-R75 + Expo (Route 2020, opened 2021)",
                                        "G20/G26 (interchanges recorded under Red line)"],
    "id_year_vs_date_year_mismatch": int((tx.transaction_id.str.split("-").str[2].astype(int) != tx.year).sum()),
    "max_actual_worth": int(tx.actual_worth.max()),
    "min_meter_sale_price": float(tx.meter_sale_price.min()),
    "max_meter_sale_price": float(tx.meter_sale_price.max()),
    "annualise_2026": ANNUALISE_2026,
    "residential_sales_clean": int(len(s)),
}

# ---------------------------------------------------------------- geography
geo = json.load(open(RAW / "dubai.geojson"))
comm_info, simple_feats = {}, []
for f in geo["features"]:
    p = f["properties"]
    k = int(p["COMM_NUM"])
    comm_info[k] = {"name": p["CNAME_E"].title().replace("  ", " "), "lat": p["Latitude"], "lon": p["Longitude"],
                    "km2": p["Area Sq Km"], "pop2019": p["Population 2019"], "pop2018": p["Population 2018"]}
    g = shape(f["geometry"]).simplify(0.0006, preserve_topology=True)
    gj = mapping(g)
    def rnd(c):
        return [round(c[0], 4), round(c[1], 4)] if isinstance(c[0], (int, float)) else [rnd(x) for x in c]
    simple_feats.append({"type": "Feature", "properties": {"c": k},
                         "geometry": {"type": gj["type"], "coordinates": rnd(gj["coordinates"])}})
json.dump({"type": "FeatureCollection", "features": simple_feats},
          open(OUT / "communities.geojson", "w"), separators=(",", ":"))

stations_geo = json.load(open(RAW / "dubai_metro_stations.geojson"))
ST = {}
for f in stations_geo["features"]:
    p = f["properties"]
    ST[p["STATION_NO"]] = {"code": p["STATION_NO"], "name": p["STATION_NAME"], "route": p["ROUTE"],
                           "lat": p["LAT_STATION"], "lon": p["LON_STATION"]}
TRAM = ["JBR 1 & 2", "JBR 2", "Jumeirah Lakes Towers", "Dubai Marina Mall", "Dubai Marina",
        "Marina Towers", "Mina Seyahi", "Media City", "Palm Jumeirah", "Knowledge Village", "Al Sufouh"]


def hav(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# distance from the DLD area centroid of each sale to its recorded station (metro only)
def dist_row(r):
    st = ST.get(r.station)
    if st is None or pd.isna(r.area_lat):
        return np.nan
    return hav(r.area_lat, r.area_lon, st["lat"], st["lon"])


s["dist_km"] = s.apply(dist_row, axis=1)

# ---------------------------------------------------------------- KNOWN-AS names
KNOWN = {681: ("Jumeirah Village Circle", "JVC"), 346: ("Business Bay", "BB"), 392: ("Dubai Marina", "MAR"),
         648: ("Dubailand Residence Cx", "DLRC"), 521: ("Dubai South (DWC)", "DWC"), 347: ("Sobha Hartland (MBR City)", "SHL"),
         631: ("Dubai Hills Estate", "DHE"), 345: ("Downtown Dubai", "DTD"), 591: ("Al Furjan", "FUR"),
         415: ("Dubai Creek Harbour", "DCH"), 393: ("Jumeirah Lakes Towers", "JLT"), 682: ("Dubai Sports City", "DSC"),
         673: ("Arjan", "ARJ"), 621: ("International City 1", "IC1"), 645: ("Majan", "MAJ"), 922: ("Town Square", "TSQ"),
         684: ("Jumeirah Village Triangle", "JVT"), 685: ("Dubai Production City", "IMPZ"), 626: ("Dubai Silicon Oasis", "DSO"),
         321: ("Dubai Maritime City", "DMC"), 381: ("Palm Jumeirah", "PLM"), 674: ("Motor City", "MOT"),
         676: ("DAMAC Hills", "DH"), 672: ("Dubai Science Park", "DSP"), 343: ("City Walk (Al Wasl)", "CWK"),
         326: ("Al Jadaf", "JAD"), 611: ("Bu Kadra", "BUK"), 665: ("Wadi Al Safa 7 (Rukan)", "WS7"), 643: ("Liwan", "LIW"),
         597: ("Dubai Investment Park 2", "DIP2"), 915: ("The Valley", "VAL"), 683: ("Remraam", "REM"),
         101: ("Dubai Islands (Palm Deira)", "DXB-I"), 646: ("City of Arabia", "COA"), 921: ("Al Yalayis 1", "YL1"),
         388: ("The Greens", "GRN"), 618: ("Meydan", "MEY"), 598: ("Dubai Investment Park 1", "DIP1"),
         675: ("Dubai Studio City", "STU"), 337: ("Za'abeel 2", "ZB2"), 916: ("DAMAC Hills 2 (Yufrah 2)", "DH2"),
         624: ("International City 3", "IC3"), 394: ("Emirates Living", "ELV"), 518: ("Downtown Jebel Ali", "DJA"),
         612: ("Ras Al Khor Ind. 1", "RAK"), 366: ("Umm Suqeim 3", "US3"), 664: ("Arabian Ranches", "AR"),
         324: ("Wasl 1 (Al Kifaf)", "KIF"), 677: ("Mudon", "MUD"), 332: ("La Mer (Jumeira 1)", "LAM"),
         359: ("Al Quoz 4", "AQ4"), 334: ("Jumeirah Garden City", "JGC"), 325: ("Za'abeel 1", "ZB1"),
         531: ("Saih Shuaib 2", "SS2"), 251: ("Mirdif", "MIR"), 382: ("Al Sufouh 2", "SUF"),
         383: ("Barsha Heights", "BH"), 261: ("Muhaisnah 1", "MUH"), 918: ("DAMAC Hills 2 (Yufrah 3)", "DH2b"),
         336: ("Trade Centre 2", "DWTC")}

# ---------------------------------------------------------------- helpers
QS = [0.1, 0.25, 0.5, 0.75, 0.9]
LOG_BINS = np.linspace(3, 5, 25)          # log10(AED/m2) 1,000 .. 100,000, 24 bins


def qstats(v):
    v = np.asarray(v, dtype=float)
    if len(v) == 0:
        return None
    return [round(float(x)) for x in np.quantile(v, QS)]


def boot_median(v, n=1000):
    v = np.asarray(v, dtype=float)
    idx = RNG.integers(0, len(v), size=(n, len(v)))
    return np.median(v[idx], axis=1)


# ======================================================== VIS 1: stations
mv = pd.read_csv(RAW / "metro_venues_total.csv")
mv_name2code = {v["name"]: k for k, v in ST.items()}
CATS = list(mv.category_name.unique())
venues_by_station = {}
for name, g in mv.groupby("station_name"):
    code = mv_name2code.get(name)
    if name == "Union":
        code = "R18"
    if name == "BurJuman":
        code = "R19"
    venues_by_station[code] = {r.category_name: int(r.venues) for r in g.itertuples()}

PERIODS = {"all": (2015, 2026), "early": (2015, 2020), "recent": (2021, 2026)}
REGS = {"all": None, "offplan": 1, "ready": 0}
SEG_ORDER = SEGS


def station_stats(df):
    if len(df) == 0:
        return None
    hist = np.histogram(np.log10(df.meter_sale_price), bins=LOG_BINS)[0]
    mix = df.seg.value_counts()
    top = df.comm_num.value_counts().head(8)
    return {"n": int(len(df)), "q": qstats(df.meter_sale_price),
            "price": round(float(df.actual_worth.median())), "size": round(float(df.procedure_area.median()), 1),
            "offplan": round(float(df.offplan.mean()), 3),
            "dist": None if df.dist_km.isna().all() else round(float(df.dist_km.median()), 2),
            "far": None if df.dist_km.isna().all() else round(float((df.dist_km > 2).mean()), 3),
            "mix": [int(mix.get(k, 0)) for k in SEG_ORDER],
            "hist": [int(h) for h in hist],
            "comms": [[int(c), int(n)] for c, n in top.items()]}


stations_out = []
codes = list(ST.keys()) + [f"T{i}" for i in range(1, 12)] + ["NONE"]
for code in codes:
    if code in ST:
        meta = dict(ST[code])
    elif code.startswith("T"):
        meta = {"code": code, "name": TRAM[int(code[1:]) - 1], "route": "Tram", "lat": None, "lon": None}
    else:
        meta = {"code": code, "name": "No station recorded", "route": "None", "lat": None, "lon": None}
    meta["venues"] = venues_by_station.get(code)
    meta["stats"] = {}
    for pk, (y0, y1) in PERIODS.items():
        for rk, rv in REGS.items():
            d = s[(s.station == code) & s.year.between(y0, y1)]
            if rv is not None:
                d = d[d.offplan == rv]
            meta["stats"][f"{pk}|{rk}"] = station_stats(d)
    stations_out.append(meta)

dubai_stats = {}
for pk, (y0, y1) in PERIODS.items():
    for rk, rv in REGS.items():
        d = s[s.year.between(y0, y1)]
        if rv is not None:
            d = d[d.offplan == rv]
        dubai_stats[f"{pk}|{rk}"] = station_stats(d)

comm_names = {k: {"name": comm_info[k]["name"], "known": KNOWN.get(k, (comm_info[k]["name"], ""))[0]}
              for k in comm_info}
for st in stations_out:
    st["riders"] = RIDERS.get(st["code"])          # {year: million riders} or None (not published)
json.dump({"stations": stations_out, "dubai": dubai_stats, "venueCats": CATS, "segs": SEG_ORDER,
           "logBins": [round(x, 4) for x in LOG_BINS], "comms": comm_names, "freehold2006": FREEHOLD_2006},
          open(OUT / "vis1_stations.json", "w"), separators=(",", ":"))

# ======================================================== VIS 2: community trajectories
YEARS = list(range(2015, 2027))
BASE, NOW = (2018, 2020), (2024, 2026)
cnt = s.groupby("comm_num").size()
vis2_comms = cnt[cnt >= 100].index.tolist()
traj = []


def trajectory(df):
    out = []
    for y in YEARS:
        d = df[df.year == y]
        n = len(d)
        out.append({"y": y, "n": n, "nA": round(n * (ANNUALISE_2026 if y == 2026 else 1), 1),
                    "med": round(float(d.meter_sale_price.median())) if n >= 5 else None,
                    "medR": round(float(d.mps_real.median())) if n >= 5 else None,     # 2015 AED
                    "op": round(float(d.offplan.mean()), 3) if n >= 5 else None})
    return out


for k in vis2_comms:
    d = s[s.comm_num == k]
    rec = {"c": int(k), "name": comm_info[k]["name"], "known": KNOWN.get(k, (comm_info[k]["name"], ""))[0],
           "short": KNOWN.get(k, ("", comm_info[k]["name"][:4].upper()))[1],
           "lat": comm_info[k]["lat"], "lon": comm_info[k]["lon"], "n": int(len(d)), "traj": trajectory(d)}
    for col, suffix in (("meter_sale_price", ""), ("mps_real", "R")):      # nominal and inflation-adjusted
        base = d[d.year.between(*BASE)][col].values
        now = d[d.year.between(*NOW)][col].values
        # level: recent median AED/m2 + 90% bootstrap CI (relative half-width = uncertainty)
        if len(now) >= 5:
            bm = boot_median(now)
            lo, hi = np.quantile(bm, [0.05, 0.95])
            rec["level" + suffix] = {"v": round(float(np.median(now))), "lo": round(float(lo)), "hi": round(float(hi)),
                                     "u": round(float((hi - lo) / 2 / np.median(now)), 3), "n": int(len(now))}
        # growth: median(2024-26)/median(2018-20)-1 with bootstrap CI
        if len(base) >= 8 and len(now) >= 8:
            g = boot_median(now) / boot_median(base) - 1
            lo, hi = np.quantile(g, [0.05, 0.95])
            rec["growth" + suffix] = {"v": round(float(np.median(now) / np.median(base) - 1), 3),
                                      "lo": round(float(lo), 3), "hi": round(float(hi), 3),
                                      "u": round(float((hi - lo) / 2), 3), "nb": int(len(base)), "nn": int(len(now))}
    # off-plan share 2024-26 with Wilson interval
    dn = d[d.year.between(*NOW)]
    if len(dn) >= 5:
        p, n = dn.offplan.mean(), len(dn)
        z = 1.645
        den = 1 + z * z / n
        c = (p + z * z / (2 * n)) / den
        h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
        rec["offplan"] = {"v": round(float(p), 3), "lo": round(c - h, 3), "hi": round(c + h, 3),
                          "u": round(h, 3), "n": int(n)}
    traj.append(rec)

all_traj = trajectory(s)
json.dump({"comms": traj, "dubai": all_traj, "years": YEARS, "base": BASE, "now": NOW,
           "annualise2026": round(ANNUALISE_2026, 4), "cpi": {str(y): round(v, 2) for y, v in CPI.items()}},
          open(OUT / "vis2_trajectories.json", "w"), separators=(",", ":"))

# ======================================================== VIS 3: ranker
ven = pd.read_csv(RAW / "dubai_venues.csv")
vg = ven.groupby("COMM_NUM")
venue_n = vg.size()
venue_rating = vg["Rating"].mean()
venue_food = ven[ven["Venue Category"].str.contains("Restaurant|Café|Coffee|Bakery|Food|Joint|Pizza|Breakfast",
                                                     regex=True, na=False)].groupby("COMM_NUM").size()

recent = s[s.year.between(*NOW)]
rc = recent.groupby("comm_num").size()
vis3_comms = rc[rc >= 30].index.tolist()
metro_pts = [(v["lat"], v["lon"], v["code"], v["name"]) for v in ST.values()]
rank_comms = []
for k in vis3_comms:
    ci = comm_info[k]
    dmin, best = min((hav(ci["lat"], ci["lon"], la, lo), (c, nm)) for la, lo, c, nm in metro_pts)
    d = s[s.comm_num == k]

    def growth_of(col):
        base = d[d.year.between(*BASE)][col].values
        now = d[d.year.between(*NOW)][col].values
        return round(float(np.median(now) / np.median(base) - 1), 3) if len(base) >= 8 and len(now) >= 8 else None
    rank_comms.append({
        "c": int(k), "name": ci["name"], "known": KNOWN.get(k, (ci["name"], ""))[0],
        "lat": ci["lat"], "lon": ci["lon"], "km2": round(ci["km2"], 2),
        "pop": int(ci["pop2019"] or 0),
        "density": round((ci["pop2019"] or 0) / ci["km2"]) if ci["km2"] else None,
        "metroKm": round(dmin, 2), "metro": f"{best[1]} ({best[0]})",
        "venues": int(venue_n.get(k, 0)), "venueCap": bool(venue_n.get(k, 0) >= 100),
        "food": int(venue_food.get(k, 0)),
        "rating": None if pd.isna(venue_rating.get(k, np.nan)) else round(float(venue_rating.get(k)), 2),
        "growth": growth_of("meter_sale_price"),          # nominal
        "growthReal": growth_of("mps_real"),              # after UAE inflation (World Bank CPI)
        "freehold2006": int(k) in FREEHOLD_2006,
    })
# transaction-level recent sales for live affordability: [comm, segIdx, price, m2, offplan, year]
seg_idx = {k: i for i, k in enumerate(SEGS)}
rows = [[int(r.comm_num), seg_idx.get(r.seg, -1), int(r.actual_worth), round(float(r.procedure_area), 1),
         int(r.offplan), int(r.year)]
        for r in recent[recent.comm_num.isin(vis3_comms)].itertuples()]
json.dump({"comms": rank_comms, "segs": SEGS, "sales": rows, "period": NOW,
           "metroLines": {route: sorted([[v["code"], v["lat"], v["lon"]] for v in ST.values() if v["route"] == route])
                          for route in ("Red", "Green", "Expo")}},
          open(OUT / "vis3_ranker.json", "w"), separators=(",", ":"))

json.dump({"cleaning": log, "anomalies": anomalies, "rules": CLEANING.strip().splitlines(), "external": external_log},
          open(OUT / "cleaning_log.json", "w"), indent=1, ensure_ascii=False)
print("vis2 communities:", len(vis2_comms), " vis3 communities:", len(vis3_comms), " recent sales rows:", len(rows))
for f in sorted(OUT.glob("*")):
    print(f.name, round(f.stat().st_size / 1024), "KB")
