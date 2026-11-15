# EMBERWATCH — Northern California wildfire activity explorer

**NASA Space Apps hackathon prototype · Independent student project, not an official NASA product or an emergency warning service.**

A **runnable map-first web application** answering: *Which Northern California 10 km grid cells rank highest for new satellite-detected fire activity in the next 24 hours, why, and what happened in historical replays?*

> **Important:** The app includes **user-supplied MODIS 2025 data (`skib.csv`)**. Its origin is not independently verified. VIIRS, archived weather forecasts, ground-confirmed ignition data and burned-area imagery have not been supplied. This is a historical exploratory ranking, **not a live wildfire warning**.

## Quick start on Windows (PowerShell)

From the unpacked `emberwatch` directory:

```powershell
py -m pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Then open **http://127.0.0.1:8000** in a browser. `output/state.json` is already generated from `data/skib.csv`, so you only need those two commands. To recompute it: `python pipeline.py --modis data/skib.csv --out output`. To stop, press **Ctrl+C** in the terminal.

On macOS/Linux, use `python3 -m pip install -r requirements.txt` if `python` is unavailable, and then `python3 -m uvicorn server:app --host 127.0.0.1 --port 8000`.

## Demo workflow

1. The page opens in **historical replay** at **2025-09-30 00:00 UTC**. A selected Northern California rectangle contains a coloured 10 km grid. **User-supplied MODIS 2025** is identified at the top.
2. Click a ranked grid cell. The right panel shows its rank, prior 7/30/90-day event activity and timestamps, and unavailable weather inputs. The colour is a **relative percentile, not an ignition probability**.
3. Press **Reveal what happened**. Open orange rings appear only now, and the app reports the numerator/denominator of first-detected events captured by the highest-risk 10% of currently eligible cells. The colours do not change. The experimental logistic result is shown separately and not shipped as the main method.
4. Change the replay date using the day selector and adjacent controls. A new date hides observations again.
5. Click **Fire history**, click a month, then a daily bar to filter mapped detections. Toggle **Combined / MODIS**; VIIRS remains unavailable until imported. Resize the rectangle by dragging its border/corners, or use **Draw area**. Every count is recalculated. **Export calendar CSV** saves the selected region's monthly summaries.
6. The right panel shows the held-out result for exactly the selected region. The historical baseline remains the default; the experimental alternative is shown separately.

An optional OpenStreetMap background requires internet. The **grid, local data, history, replay and fallback background** do not. The application never pretends there is a current forecast.

## Use actual NASA FIRMS CSV exports

Get the 2025 archive exports from the [official NASA FIRMS Archive Download](https://firms2.modaps.eosdis.nasa.gov/download/). Request:

- California, **2025-01-01 through 2025-12-31**, **MODIS Collection 6.1** active fire/hotspots, CSV.
- Same area and dates, **VIIRS NOAA-21** 375 m active fire/hotspots, CSV.

NASA may email download instructions after the archive request finishes. To access services requiring an Earthdata token or FIRMS API MAP_KEY, keep credentials in the environment (`EARTHDATA_TOKEN` or `FIRMS_MAP_KEY`) and never put them in the repository. **This app intentionally uses local CSV imports rather than authenticated online calls**. See [NASA FIRMS Data Availability API](https://firms.modaps.eosdis.nasa.gov/api/data_availability) for optional future integration. The input CSVs need `latitude`, `longitude`, `acq_date`, and `acq_time`; `satellite`, `confidence`, `version`, etc. are optional. HHMM or HH:MM acquisition times are interpreted in UTC.

In the app, click **Import FIRMS CSVs** and upload either one or both files (maximum 40 MB each). MODIS `data/skib.csv` is bundled; uploading only VIIRS retains it and recomputes the dataset. For reproducible command-line preparation:

```bash
python pipeline.py --modis data/skib.csv --out output
# Once VIIRS arrives:
python pipeline.py --modis data/skib.csv --viirs path/to/noaa21_2025.csv --out output
```

**Do not pass `--synthetic` for actual satellite data.** The app labels the results *user-imported, provenance unverified* because checking an upload's provenance is separate from parsing it. The provided CLI requires at least one sensor and at least 121 days between earliest and latest retained observations to construct the temporal replay; short/invalid uploads fail with a clear error and leave the previous prepared state intact. Raw input files are not overwritten by the command-line workflow.

## Data definitions and non-leakage policy

- **Geography:** grid squares are exactly 10,000 m × 10,000 m in **EPSG:3310, California Albers**. IDs are `CA3310_{easting_bin}_{northing_bin}` and do not depend on the user-selected region. Grid includes cells whose centre falls inside the documented demo bbox, approximately W 123.55–120.68 and N 39.70–41.50. The study rectangle filters these cells. Other areas are **outside the validated coverage**, not extrapolated predictions.
- **Clock:** every detection's FIRMS `acq_date` and `acq_time` are parsed as UTC. Every forecast is issued at **00:00 UTC** for **[issue time, +24 hours)**. The UI displays UTC everywhere.
- **Calendar:** MODIS and VIIRS each contribute **one active cell-day** at most per `(date, grid cell)`; their combined count is the **union**, not the sum. Satellite observation count and hectares burned are distinct metrics. Same-cell/same-day overlap is not pixel-level matching. A zero means **zero detected hotspots** in supplied files; **overpass completeness/valid coverage is unknown**, which is not the same as observed zero fire activity.
- **First-detected target:** sorted records are assigned a proxy event start if no earlier hotspot is within **15 km and 72 h**. This groups nearby continuing observations and accounts for ongoing fires moving into adjacent cells. A three-day lookback at split boundaries avoids treating a lingering fire as new. **This is NOT confirmed ignition** and may merge separate events or miss fires not observed by these sensors. Burned area is another distinct concept.
- **Historical baseline:** score per cell uses a positive common smoothing constant plus **only earlier** 30-day, 90-day and cumulative proxy-event counts and neighbouring 30-day counts. Every eligible cell is scored, including never-detected cells. Scores are ranked to percentiles; no probability calibration is claimed.
- **Experimental candidate:** standardized logistic regression trained only from past satellite event counts, raw hotspot activity, neighbourhood counts, coarse location, and season. No future-observed weather. In the app, the baseline remains the default and the experimental model is clearly marked as unshipped.
- **Evaluation:** chronological train / validation / final held-out test with a three-day gap between portions. Top-decile recall is the number of **first-detected events** inside the highest-ranked ceiling(10%) of eligible cells, divided by all such recorded events on identical test dates. Average precision evaluates the same test cell-days. Test performance is reported separately from the preselected demonstration date. In the UI, top decile and evaluation are recalculated for the selected rectangle.
- **Immutability of historical scores:** `pipeline.py` saves replay scores for historical issue dates in `output/state.json`; the UI reveal action never recomputes them using target observations. New future records do not enter the history features for an earlier issue time. See `tests/test_pipeline.py`.

### Original notebook's reported 205 matches

The original notebook and VIIRS CSV were not supplied, so **205 has not been verified**. The included `audit_matches.py` can calculate candidate pairs (defaults: 2 km, 3 h) with separate counts of distinct MODIS and VIIRS observations and one-to-many matches, including stable per-source-row IDs:

```bash
python audit_matches.py --modis path/to/modis_2025.csv --viirs path/to/noaa21_2025.csv --max-km 2 --max-hours 3 --out output/match_audit.json
```

Requires SciPy, included in `requirements.txt`. A proximity pair is **not proof of identical fire footprints**; validate against the teammate's notebook's matching rule before comparing reported totals. The 205 matches are still unverified without a VIIRS CSV and the original notebook.

## Reproducibility and test commands

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
node --check public/app.js    # if Node.js is installed
python -m uvicorn server:app --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/api/health
```

`output/results.json` and `output/results.md` have the exact evaluated metrics from bundled user-supplied MODIS observations. `output/state.json` is the cached frontend payload. The new retro theme is loaded from `public/retro-2010.css`. Prior screenshots from the modern theme are not included in this retro package. Open the running app to see the dated portal styling.

## Remaining blockers and extensions

| Capability | Status |
|---|---|
| Responsive map, grid, selection/draw/resize, dates, reveal, inspector | **Implemented and UI-tested** |
| History calendar, daily filter, sensor toggles, overlap metrics, CSV export | **Implemented and UI-tested** |
| Supplied MODIS `skib.csv`, DD/MM/YYYY parsing, UTC grid, temporal baseline, logistic candidate, held-out testing | **Processed: 7,820 raw rows, 1,377 in selected Northern California grid** |
| Invalid-file handling, empty area, unavailable input, non-leakage | **Tested** |
| MODIS 2025 input | **Bundled user-supplied skib.csv; source not independently verified** |
| VIIRS NOAA-21 input | **Missing; required for sensor agreement** |
| 205-match notebook reconciliation | **Absent; optional audit tool included** |
| Confirmed ignition records, archived weather/issued weather forecasts, fuels, valid sensor coverage masks | **Absent; cannot claim ignition probabilities, operational forecasts or true sensor misses** |
| Burned-area imagery | **Absent; optional external layer deliberately not fabricated** |
| Integration with teammate map/Colab | **Blocked by missing source code; import interface/data contract provided** |

For exact file provenance see `DATA_PROVENANCE.md`; for a narration plan see `JUDGE_SCRIPT.md`. MIT-style third-party bundling is not required: frontend is plain HTML/CSS/JS, Python backend FastAPI, all code included.

## 2010-era visual skin

This packaged edition uses `public/retro-2010.css` **after** the original stylesheet. It deliberately imitates early-2010s public research/GIS portals: blue-grey gradients, beveled controls, compact Arial text, squared panels, basic tab navigation and table-like data summaries. All JavaScript and Python model/data logic is unchanged. To switch back to the original modern look, remove the `<link rel="stylesheet" href="/public/retro-2010.css">` line from `public/index.html` and reload the browser. The UI is still responsive and labels user-supplied MODIS observations correctly.
