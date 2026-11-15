"""Generate explicitly SYNTHETIC NASA-FIRMS-shaped CSVs for offline UI testing.
Locations, dates, counts and sensor coincidences are fabricated, never NASA observations.
"""
import argparse
import csv
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

HEADERS = ['latitude','longitude','brightness','scan','track','acq_date','acq_time','satellite','confidence','version','frp','daynight','source_type']
CENTERS = [(-122.30,40.68),(-121.75,40.40),(-122.82,40.10),(-121.35,40.92),(-123.05,41.22),(-121.75,39.95)]

def generate(out: Path, seed=2025, n_events=470):
    rng = random.Random(seed)
    out.mkdir(parents=True,exist_ok=True)
    rows = {'MODIS': [], 'VIIRS': []}
    start = datetime(2025,1,1,tzinfo=timezone.utc)
    weights = [0.3,0.3,0.55,0.8,1.0,1.6,2.2,2.7,2.9,1.7,0.9,0.4]
    # Seasonally weighted dates, several persistent spatial clusters and some outliers.
    for event in range(n_events):
        while True:
            day = rng.randrange(365)
            dt = start+timedelta(days=day)
            if rng.random()<weights[dt.month-1]/3.0: break
        if rng.random()<0.78:
            cx,cy=rng.choice(CENTERS)
            lon = rng.gauss(cx,0.17)
            lat = rng.gauss(cy,0.13)
        else:
            lon = rng.uniform(-123.35,-120.85)
            lat = rng.uniform(39.78,41.43)
        if not(-123.48<lon<-120.7 and 39.7<lat<41.5): continue
        hour=rng.randrange(2,23)
        minute=rng.randrange(60)
        anchor=dt+timedelta(hours=hour,minutes=minute)
        for si,sensor in enumerate(['MODIS','VIIRS']):
            if rng.random() > (0.66 if sensor=='MODIS' else 0.86): continue
            hits=rng.randint(1,3 if sensor=='MODIS' else 5)
            for _ in range(hits):
                # Similar nearby positions represent separate satellite footprints.
                when = anchor + timedelta(minutes=rng.randrange(-35,36), hours=si*rng.randrange(0,3))
                if rng.random()<0.20: when+=timedelta(days=1)
                if when.year!=2025: continue
                spread=0.011 if sensor=='VIIRS' else 0.023
                x=lon+rng.gauss(0,spread)
                y=lat+rng.gauss(0,spread)
                rows[sensor].append({
                    'latitude': f'{y:.6f}', 'longitude':f'{x:.6f}',
                    'brightness':rng.randint(290,360), 'scan': 1.0 if sensor=='MODIS' else 0.375,
                    'track':1.0 if sensor=='MODIS' else 0.375,
                    'acq_date':when.strftime('%Y-%m-%d'), 'acq_time':when.strftime('%H%M'),
                    'satellite':rng.choice(['A','T']) if sensor=='MODIS' else 'N21',
                    'confidence':str(rng.randint(45,99)) if sensor=='MODIS' else rng.choice(['n','n','h','l']),
                    'version':'6.1' if sensor=='MODIS' else '2.0',
                    'frp':f'{rng.uniform(2,130):.2f}', 'daynight':'D' if 7<=when.hour<=18 else 'N',
                    'source_type':'SYNTHETIC DEMO DATA'})
    for sensor,filename in [('MODIS','synthetic_modis_2025.csv'),('VIIRS','synthetic_viirs_noaa21_2025.csv')]:
        rows[sensor].sort(key=lambda r:(r['acq_date'],r['acq_time']))
        with (out/filename).open('w',newline='') as f:
            w=csv.DictWriter(f,HEADERS); w.writeheader();w.writerows(rows[sensor])
    return {key:len(val) for key,val in rows.items()}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--out',default='data');p.add_argument('--seed',type=int,default=2025);p.add_argument('--events',type=int,default=470)
    args=p.parse_args();print(generate(Path(args.out),args.seed,args.events))
