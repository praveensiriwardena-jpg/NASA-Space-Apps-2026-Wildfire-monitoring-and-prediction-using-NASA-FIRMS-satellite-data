# Evaluation summary

**USER-SUPPLIED FIRMS CSV — SOURCE NOT INDEPENDENTLY VERIFIED**. Not a validated real-world wildfire forecast.

- Sources: skib.csv. Available sensors: MODIS. Missing: VIIRS. 1377 observations; 177 first-detected clusters.
- Grid: 480 cells, 10 km EPSG:3310; target: first satellite-observed activity, not confirmed ignition; no detection within 15 km in previous 72 hours.
- Training: 2025-01-12 to 2025-07-15 UTC.
- Validation: 2025-07-22 to 2025-09-23 UTC.
- Test: 2025-09-30 to 2025-12-21 UTC.
- Selected: **historical baseline** (by validation recall).
- Selected model held-out recall at top 10%: **21/59 = 35.6% across 83 days; average precision 0.00843**.
- Historical baseline held-out recall at top 10%: **21/59 = 35.6% across 83 days; average precision 0.00843**.
- Example replay: **2025-09-30 00:00 UTC**; illustrative day, not an aggregate estimate.
- Weather/incident ignition/coverage data: **not supplied**. Predictions are relative, not calibrated probabilities.
