EMBERWATCH — 2010-style research portal / user-supplied MODIS edition

This retro-style edition has square boxes, blue-grey gradients, beveled buttons, compact tables and Arial-like typography.

Bundled data: `data/skib.csv` (2025 MODIS-style user-supplied records) and computed results in `output/state.json`. This edition does NOT open on synthetic demo data. Source provenance is unverified.

Start with `python -m uvicorn server:app --host 127.0.0.1 --port 8000` in the extracted `emberwatch` folder after installing `requirements.txt`.

To remove the retro theme, delete the retro-2010.css link from `public/index.html`.
