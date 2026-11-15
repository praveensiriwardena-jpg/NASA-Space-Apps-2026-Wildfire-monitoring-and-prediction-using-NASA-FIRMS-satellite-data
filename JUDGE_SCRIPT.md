# EMBERWATCH — 90-second judge demo

**0–15s:** Open the Northern California map. "We rank 10 km cells for *new satellite-detected activity* in a historical 24-hour replay, not confirmed wildfire ignitions. We loaded our supplied 2025 MODIS hotspot CSV."

**15–35s:** Select a cell. "Its ranked risk is a percentile, not a calibrated probability. These features and timestamps are strictly before the issue date, and weather inputs are marked unavailable."

**35–55s:** Click **Reveal what happened**. "The orange markers appear while risk colours remain unchanged. Across our complete Northern California held-out test grid, the baseline ranked cells containing 21 of 59 newly detected events in the top 10% over 83 days: 35.6%."

**55–75s:** Click **Fire history** then a month and day. Resize the region. "We count unique active grid cell-days, not repeat detections in one cell. The calendar and map adapt to the chosen region."

**75–90s:** Show the sensor panel. "This dataset has MODIS, but we won't pretend we have VIIRS: the comparison requires a separate VIIRS NOAA-21 export. We also need issued weather forecasts and independently verified ignition records for a stronger operational model."

Never describe this ranking as a live safety warning. The source CSV has not been independently authenticated.
