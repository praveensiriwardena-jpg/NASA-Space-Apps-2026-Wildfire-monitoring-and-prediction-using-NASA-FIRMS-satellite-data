# Verification — bundled user MODIS build

## Automated validation

- Python pytest tests: **11 passed**. Test coverage includes grid size/projection, timestamp parsing, distinct cell-days, no future-observation leakage, invalid input and out-of-grid handling.
- `node --check public/app.js`: **passed**.
- FastAPI TestClient: `/`, `/api/health`, `/api/state` and CSS/JS endpoints responded 200; invalid CSV import returned 400 and left prepared state untouched.
- Processing command: `python pipeline.py --modis data/skib.csv --out output` **completed**.
- File SHA-256 was checked against the processing manifest. The bundled prepared state is **not synthetic** (`meta.synthetic=false`); available sensor is MODIS; missing sensor is VIIRS.
- Input total **7,820**; excluded out of grid **6,138**; excluded non-vegetation **305**; kept **1,377**; malformed **0**.
- Grid **480** 10 km cells, **177** first-detected clusters. Training dates: 2025-01-12–2025-07-15; validation 2025-07-22–2025-09-23; test 2025-09-30–2025-12-21 (UTC).
- Held-out historical baseline capture **21 / 59 = 35.59%** (top 10% of all grid cells, 83 test dates); experimental logistic **28 / 59 = 47.46%**, retained as unshipped research candidate because validation did not show recall improvement.

## Limitations

- These are historical rankings, not live weather-informed wildfire forecasts or probabilities of ignition.
- NASA provenance and completeness of this user-supplied file are not independently verified.
- VIIRS, source Colab/notebook, 205 matches, confirmed ignition records, burned-area raster, forecast weather and overpass coverage remain unavailable.
- Browser-level interactive checks from the preceding synthetic package have not been re-run on the real-data variant; avoid claiming they were.
