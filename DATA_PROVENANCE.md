# Data provenance — user-supplied `skib.csv`

The file `data/skib.csv` was uploaded by the project user. Its columns are FIRMS MODIS-style, but its original NASA provenance has **not been independently verified**. Hotspots are not confirmed ignitions or burned-area estimates.

- SHA-256: `39d6a8ef4ef98f6aa02c647d318bf5c416944e5446831dde68e18a09cd039d0f`
- Total rows: **7,820**; **305** `type != 0` non-vegetation hotspot records excluded; **6,138** outside the Northern California grid excluded; **1,377** retained; 0 malformed.
- Dates: original `DD/MM/YYYY` (interpreted as UTC); acquisition time HHMM UTC. In-grid records range **2025-01-09 to 2025-12-22**.
- Geography: 10 km EPSG:3310 fixed grid; 480 cells with centres inside approximate lat 39.7–41.5, lon -123.55–-120.68.
- Targets: 177 likely first-detected activity clusters, using a 15 km / 72-hour lookback rule; not verified ignition reports.
- **VIIRS missing**. Cross-sensor overlap and the notebook's 205 matches cannot be checked.
- **Weather, forecast issue archives, confirmed ignitions, observation coverage and burned-area imagery missing**. Empty cell-days are non-detections; sensor coverage is unknown.
- No calibrated ignition probabilities or operational next-day warning is claimed.

To reproduce: `python pipeline.py --modis data/skib.csv --out output`. See `output/results.md` and `output/results.json` for held-out evaluation.
