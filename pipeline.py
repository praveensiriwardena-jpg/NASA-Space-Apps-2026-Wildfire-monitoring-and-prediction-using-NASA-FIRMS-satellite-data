"""Reproducible FIRMS ingestion, 10 km EPSG:3310 grid, causal baseline, replay evaluation.
Forecasts are exploratory satellite-detection rankings, NOT public safety forecasts.
"""
import argparse
import csv
import hashlib
import json
import math
from collections import defaultdict,deque
from datetime import datetime,timedelta,timezone
from pathlib import Path

import numpy as np
from pyproj import Transformer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.metrics import average_precision_score

KM=10000
# Bounding rectangle represents the validated *grid* for the demo, not California's boundary.
BOUNDS=(-123.55,39.7,-120.68,41.5) # west,south,east,north
TO_XY=Transformer.from_crs('EPSG:4326','EPSG:3310',always_xy=True)
TO_LL=Transformer.from_crs('EPSG:3310','EPSG:4326',always_xy=True)
UTC=timezone.utc

def grid():
    corners=[TO_XY.transform(lon,lat) for lon in (BOUNDS[0],BOUNDS[2]) for lat in (BOUNDS[1],BOUNDS[3])]
    imin=math.floor(min(x for x,y in corners)/KM)
    imax=math.ceil(max(x for x,y in corners)/KM)
    jmin=math.floor(min(y for x,y in corners)/KM)
    jmax=math.ceil(max(y for x,y in corners)/KM)
    cells=[];coords={}
    for i in range(imin,imax):
        for j in range(jmin,jmax):
            x,y=(i+.5)*KM,(j+.5)*KM
            lon,lat=TO_LL.transform(x,y)
            if not(BOUNDS[0]<=lon<=BOUNDS[2] and BOUNDS[1]<=lat<=BOUNDS[3]):continue
            ident=f'CA3310_{i}_{j}'
            poly=[TO_LL.transform((i+di)*KM,(j+dj)*KM) for di,dj in [(0,0),(1,0),(1,1),(0,1)]]
            cells.append(dict(id=ident,i=i,j=j,lon=round(lon,5),lat=round(lat,5),polygon=[[round(a,5),round(b,5)] for a,b in poly]))
            coords[(i,j)]=len(cells)-1
    return cells,coords

def detect_date_format(path, normalized):
    """Infer one file-wide date convention; never silently guess slash dates.
    Returns %Y-%m-%d, %d/%m/%Y, or %m/%d/%Y.
    """
    with Path(path).open('r',encoding='utf-8-sig',newline='') as fh:
        dates=[(r.get(normalized['acq_date']) or '').strip() for r in csv.DictReader(fh)]
    iso=sum(bool(v) and '-' in v for v in dates)
    slash=[v for v in dates if '/' in v]
    if iso and not slash:return '%Y-%m-%d'
    if slash and not iso:
        chunks=[v.split('/') for v in slash]
        dmy=sum(len(parts)==3 and parts[0].isdigit() and int(parts[0])>12 for parts in chunks)
        mdy=sum(len(parts)==3 and parts[1].isdigit() and int(parts[1])>12 for parts in chunks)
        if dmy and not mdy:return '%d/%m/%Y'
        if mdy and not dmy:return '%m/%d/%Y'
        raise ValueError('Ambiguous/mixed slash-format acquisition dates; use YYYY-MM-DD or dates that establish DD/MM vs MM/DD')
    if not dates:raise ValueError('CSV has no data rows')
    raise ValueError('Mixed or unsupported acquisition date formats; use YYYY-MM-DD or a consistent slash-date convention')

def acq_datetime(date,clock,date_format='%Y-%m-%d'):
    date=str(date).strip();clock=str(clock).strip()
    if clock.endswith('.0'):clock=clock[:-2]
    if ':' in clock:
        fmt='%H:%M:%S' if clock.count(':')==2 else '%H:%M'
    else:
        if not clock.isdigit() or len(clock)>4: raise ValueError('Invalid acquisition time')
        clock=clock.zfill(4);fmt='%H%M'
    return datetime.strptime(date+' '+clock,date_format+' '+fmt).replace(tzinfo=UTC)

def read_firms(path, sensor,coord_index):
    path=Path(path)
    issues=[];output=[];total=0;out_of_area=0;synthetic_rows=0;excluded_nonvegetation=0
    if not path.exists():raise ValueError(f'CSV not found: {path}')
    with path.open('r',encoding='utf-8-sig',newline='') as fh:
        reader=csv.DictReader(fh)
        if not reader.fieldnames: raise ValueError(f'{path.name}: CSV header missing')
        normalized={name.strip().lower():name for name in reader.fieldnames}
        req=['latitude','longitude','acq_date','acq_time']
        missing=[x for x in req if x not in normalized]
        if missing:raise ValueError(f'{path.name}: missing required fields {missing}')
        date_format=detect_date_format(path,normalized)
        for number,row in enumerate(reader,start=2):
            total+=1
            try:
                def v(k):return str(row.get(normalized.get(k,''),'') or '').strip()
                if v('source_type').upper()=='SYNTHETIC DEMO DATA':synthetic_rows+=1
                instrument=v('instrument').upper()
                if instrument and ((sensor=='MODIS' and 'MODIS' not in instrument) or (sensor=='VIIRS' and 'VIIRS' not in instrument)):
                    raise ValueError(f'Instrument {instrument} is not {sensor}')
                lat=float(v('latitude'));lon=float(v('longitude'))
                if not(-90<=lat<=90 and -180<=lon<=180):raise ValueError('Coordinates out of range')
                dt=acq_datetime(v('acq_date'),v('acq_time'),date_format)
                # FIRMS MODIS type=0 is presumed vegetation fire. Types 1/2/3 are
                # volcanic/static/offshore sources; do not treat those as wildfire events.
                kind=v('type')
                if kind and kind not in ('0','0.0'):
                    excluded_nonvegetation+=1;continue
                x,y=TO_XY.transform(lon,lat)
                i,j=math.floor(x/KM),math.floor(y/KM)
                ci=coord_index.get((i,j))
                if ci is None:
                    out_of_area+=1;continue
                satellite=v('satellite') or ('N21' if sensor=='VIIRS' else 'MODIS')
                confidence=v('confidence') if 'confidence' in normalized else ''
                basis=f'{sensor}|{path.name}|{number}|{lat:.7f}|{lon:.7f}|{dt.isoformat()}|{satellite}'
                uid=hashlib.sha1(basis.encode()).hexdigest()[:16]
                output.append(dict(id=uid,sensor=sensor,cell=ci,lat=round(lat,5),lon=round(lon,5),ts=dt,
                                   confidence=confidence,satellite=satellite,source=path.name,row=number))
            except (TypeError,ValueError,OverflowError) as exc:
                if len(issues)<12:issues.append({'row':number,'reason':str(exc)})
    sensor_dates=[x['ts'].date() for x in output]
    return output,dict(file=path.name,sensor=sensor,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                       rows=total,kept=len(output),malformed=total-len(output)-out_of_area-excluded_nonvegetation,
                       out_of_area=out_of_area,excluded_nonvegetation=excluded_nonvegetation,
                       date_format=date_format,synthetic_rows=synthetic_rows,
                       earliest=min(sensor_dates).isoformat() if sensor_dates else None,
                       latest=max(sensor_dates).isoformat() if sensor_dates else None,examples=issues)

def tag_events(obs):
    """First observed satellite activity: no hotspot within 15 km over prior 72 h.
    This is NOT an ignition record. Uses a 3-day lookback across evaluation splits.
    """
    # Tie-break on physical fields rather than path-based IDs: renaming input
    # files must not change event clustering or historical forecasts.
    obs.sort(key=lambda a:(a['ts'],a['sensor'],a['lat'],a['lon'],a['id']))
    recent=defaultdict(set);queue=deque()
    n_events=0
    for idx,row in enumerate(obs):
        t=row['ts'];x,y=TO_XY.transform(row['lon'],row['lat'])
        buck=(math.floor(x/15000),math.floor(y/15000))
        while queue and (t-obs[queue[0][0]]['ts']).total_seconds()>72*3600:
            old,key=queue.popleft();recent[key].discard(old)
        parent=None
        for di in (-1,0,1):
            for dj in (-1,0,1):
                for prev in recent.get((buck[0]+di,buck[1]+dj),()):
                    other=obs[prev]
                    if (x-other['_x'])**2+(y-other['_y'])**2<=15000**2:
                        parent=other['event'];break
                if parent is not None:break
            if parent is not None:break
        row['first']= parent is None
        if parent is None:
            n_events+=1;parent=f'E{n_events:05d}'
        row['event']=parent;row['_x']=x;row['_y']=y
        recent[buck].add(idx);queue.append((idx,buck))
    for row in obs: row.pop('_x');row.pop('_y')
    return n_events

def features_matrices(obs, cells, first_date, last_date):
    n=len(cells);days=(last_date-first_date).days+1
    a=np.zeros((days,n),dtype=np.int16);events=np.zeros((days,n),dtype=np.int16)
    sensors=np.zeros((2,days,n),dtype=np.int16)
    for row in obs:
        d=(row['ts'].date()-first_date).days
        if not (0<=d<days):continue
        a[d,row['cell']]+=1;sensors[0 if row['sensor']=='MODIS' else 1,d,row['cell']]+=1
        if row['first']:events[d,row['cell']]+=1
    # Padded cumulative sums permit time windows with strictly earlier observations.
    ae=np.vstack((np.zeros((1,n),dtype=np.int32),events.cumsum(axis=0,dtype=np.int32)))
    ah=np.vstack((np.zeros((1,n),dtype=np.int32),a.cumsum(axis=0,dtype=np.int32)))
    look=lambda c,d,w:c[d]-c[max(0,d-w)]
    lon=np.asarray([c['lon'] for c in cells]);lat=np.asarray([c['lat'] for c in cells]);
    neighbor=np.zeros((n,n),dtype=np.float32) # compact 10 km adjacency (do not include self)
    for idx,c in enumerate(cells):
        for nid,other in enumerate(cells):
            if abs(c['i']-other['i'])<=1 and abs(c['j']-other['j'])<=1 and idx!=nid:
                neighbor[idx,nid]=1
    # Feature rows constructed at midnight UTC, exclusively prior to that date.
    features=[];baselines=[]
    for d in range(days):
        e7=look(ae,d,7);e30=look(ae,d,30);e90=look(ae,d,90);eall=ae[d]
        h7=look(ah,d,7);h30=look(ah,d,30)
        near=neighbor@np.asarray(e30,dtype=np.float32)
        season=2*np.pi*(first_date+timedelta(days=d)).timetuple().tm_yday/365.25
        baseline=.3+.8*e30+.24*e90+.06*eall+.025*near
        # Deterministic identical tie breaker for both ranking methods.
        tie=np.arange(n,dtype=float)*0.0000000001
        baseline=baseline+tie
        X=np.column_stack((np.log1p(e7),np.log1p(e30),np.log1p(e90),np.log1p(eall),
                           np.log1p(h7),np.log1p(h30),np.log1p(near),
                           (lon+122)/2,(lat-40.5),np.full(n,np.sin(season)),np.full(n,np.cos(season))))
        features.append(X.astype(np.float32));baselines.append(baseline)
    return np.asarray(features),np.asarray(baselines),events,sensors

def metrics(scores,labels,days,top_n):
    h=0;total=int(labels[days].sum())
    for d in days:
        rank=np.argsort(-scores[d],kind='stable')[:top_n]
        h+=int(labels[d,rank].sum())
    precision=None
    if total:
        precision=round(float(average_precision_score(labels[days].reshape(-1)>0,scores[days].reshape(-1))),5)
    return dict(hits=h,events=total,recall=round(h/total,4) if total else None,days=len(days),
                event_days=sum(bool(labels[d].sum()) for d in days),average_precision=precision)

def prepare(modis,viirs,out,synthetic=False):
    cells,ci=grid();out=Path(out);out.mkdir(parents=True,exist_ok=True)
    obs=[];imports=[]
    for path,sensor in [(modis,'MODIS'),(viirs,'VIIRS')]:
        if path is None:continue
        batch,meta=read_firms(path,sensor,ci);obs.extend(batch);imports.append(meta)
    if not obs:raise ValueError('No valid in-grid FIRMS observations. Check bounds and CSV headers.')
    available_sensors=sorted({o['sensor'] for o in obs})
    missing_sensors=sorted({'MODIS','VIIRS'}-set(available_sensors))
    synthetic=bool(synthetic or any(x['synthetic_rows'] for x in imports))
    event_count=tag_events(obs)
    minimum=min(o['ts'].date() for o in obs);maximum=max(o['ts'].date() for o in obs)
    # At least four months for honest temporal split.
    if (maximum-minimum).days<120:raise ValueError('Need >=121 days of observation range to train and evaluate chronologically. Calendar-only mode is not yet supported.')
    F,B,Y,S=features_matrices(obs,cells,minimum,maximum)
    dates=[minimum+timedelta(days=d) for d in range(len(F))]
    nd=len(dates);train_end=int(nd*.55);val_end=int(nd*.75)
    # 3 day embargo between stages + initial 3 day lookback.
    train_days=list(range(3,train_end-3));val_days=list(range(train_end+3,val_end-3));test_days=list(range(val_end+3,nd-1))
    if not train_days or not val_days or not test_days:raise ValueError('Not enough dates for chronological splits')
    try:
        Xt=F[train_days].reshape((-1,F.shape[-1]));yt=(Y[train_days].reshape(-1)>0).astype(int)
        if len(set(yt))<2:raise ValueError('Training set has no positive or negative event examples')
        model=make_pipeline(StandardScaler(),LogisticRegression(max_iter=350,class_weight='balanced',C=.25))
        model.fit(Xt,yt)
        LR=np.zeros(B.shape)
        for day in range(nd):LR[day]=model.predict_proba(F[day])[:,1]+np.arange(len(cells))*1e-12
        logistic_ok=True;model_error=''
    except ValueError as exc:
        LR=B.copy();logistic_ok=False;model_error=str(exc)
    top_n=max(1,math.ceil(len(cells)*.10))
    val_base=metrics(B,Y,val_days,top_n)
    val_lr=metrics(LR,Y,val_days,top_n) if logistic_ok else None
    choose_lr=bool(logistic_ok and val_lr['recall'] is not None and (val_base['recall'] is None or val_lr['recall']>val_base['recall']))
    candidate_name='logistic regression' if choose_lr else 'historical baseline'
    candidate=LR if choose_lr else B
    # Conservative shipping policy: the historical baseline remains the default
    # unless an independently evaluated alternative demonstrates improvement.
    # Test evidence can reject an alternative; it must not turn into tuning data.
    model_name='historical baseline'
    primary=B
    scores={}
    for d in test_days:
        # Percentile 0-100: rank only, not calibrated probability.
        def ranks(arr):
            order=np.argsort(arr,kind='stable')
            result=np.empty(len(arr),dtype=np.uint8)
            result[order]=np.round(np.linspace(0,100,len(arr))).astype(np.uint8)
            return result.tolist()
        scores[dates[d].isoformat()]={'forecast':ranks(primary[d]),'baseline':ranks(B[d]),
            'experimental':ranks(LR[d]) if logistic_ok else None,
            'events':[int(i) for i in np.flatnonzero(Y[d]) for _ in range(int(Y[d,i]))],
            'inputs_through':(dates[d]-timedelta(days=1)).isoformat()}
    # Compact daily active-cell snapshots and per-sensor counts; no spatial interpolation.
    daily={}
    for d,date in enumerate(dates):
        m=np.flatnonzero(S[0,d]>0);v=np.flatnonzero(S[1,d]>0)
        if len(m) or len(v):daily[date.isoformat()]={'m':m.tolist(),'v':v.tolist()}
    # Detailed plot points from both sensors, before/after reveal only on explicit UI action.
    observed=[dict(id=o['id'],cell=o['cell'],lon=o['lon'],lat=o['lat'],sensor=o['sensor'],
                   ts=o['ts'].strftime('%Y-%m-%dT%H:%M:%SZ'),first=o['first'],event=o['event']) for o in obs]
    test_base=metrics(B,Y,test_days,top_n)
    test_primary=metrics(primary,Y,test_days,top_n)
    test_logistic=metrics(LR,Y,test_days,top_n) if logistic_ok else None
    # Preselect a representative event day. No special-casing the held-out headline metrics.
    example=next((date for date,s in scores.items() if s['events'] and any(s['forecast'][idx]>=90 for idx in s['events'])),
                 next((date for date,s in scores.items() if s['events']),next(iter(scores))))
    policy={'grid':'EPSG:3310, anchored 10,000 m squares; a cell is included when its centre is inside the demo bounds',
            'sensor_metric':'active cell-days: unique (UTC date, 10 km cell) with >=1 hotspot; per-sensor counts independent',
            'target':'first satellite-observed activity, not confirmed ignition; no detection within 15 km in previous 72 hours',
            'event_boundary':'72-hour lookback across chronological split boundaries; first 3 days excluded',
            'weather':'unavailable: NOT used; no next-day weather observations leak into forecast',
            'interpretation':'exploratory ranking of likely new satellite-detected activity, NOT a warning or calibrated ignition probability',
            'coverage':'FIRMS point presence only. No overpass coverage completeness; an empty day means zero detected, coverage unknown',
            'no_detection':'A cell-day with no recorded hotspot is a non-detection, not proof of no fire.',
            'source_filter':'If supplied, FIRMS type!=0 (non-vegetation sources) is excluded from fire-history and forecast labels.'}
    report={'demo_type':'SYNTHETIC DEMO DATA' if synthetic else 'USER-SUPPLIED FIRMS CSV — SOURCE NOT INDEPENDENTLY VERIFIED',
            'synthetic':synthetic,'available_sensors':available_sensors,'missing_sensors':missing_sensors,'imports':imports,'observation_count':len(obs),'first_detection_events':event_count,
            'cell_count':len(cells),'coverage_start':minimum.isoformat(),'coverage_end':maximum.isoformat(),
            'train_range':[dates[train_days[0]].isoformat(),dates[train_days[-1]].isoformat()],
            'validation_range':[dates[val_days[0]].isoformat(),dates[val_days[-1]].isoformat()],
            'test_range':[dates[test_days[0]].isoformat(),dates[test_days[-1]].isoformat()],
            'selected_model':model_name,'selection':'Baseline ships by default. Validation nominates an experimental candidate; never promote without independent evidence',
            'top_n':top_n,'validation':{'baseline':val_base,'logistic':val_lr},
            'candidate_model':candidate_name,'test':{'selected':test_primary,'baseline':test_base,'logistic':test_logistic},
            'model_note':model_error or 'Logistic regression trained on past satellite-derived history only; no weather features',
            'policy':policy}
    state={'version':1,'meta':report,'bounds':BOUNDS,'cells':cells,'days':daily,'observations':observed,
           'scores':scores,'example_date':example}
    (out/'state.json').write_text(json.dumps(state,separators=(',',':')))
    (out/'results.json').write_text(json.dumps(report,indent=2))
    (out/'results.md').write_text(format_report(report,example))
    print(json.dumps(dict(cells=len(cells),observations=len(obs),events=event_count,replay_days=len(scores),
                         model=model_name,example=example,selected=test_primary,baseline=test_base),indent=2))
    return state

def format_report(r,example):
    fmt=lambda d:f"{d['hits']}/{d['events']} = {d['recall']*100:.1f}% across {d['days']} days; average precision {d['average_precision']}" if d['recall'] is not None else 'N/A: no held-out events'
    return (f"# Evaluation summary\n\n**{r['demo_type']}**. Not a validated real-world wildfire forecast.\n\n"
            f"- Sources: {', '.join(x['file'] for x in r['imports'])}. Available sensors: {', '.join(r['available_sensors'])}. Missing: {', '.join(r['missing_sensors']) or 'none'}. {r['observation_count']} observations; {r['first_detection_events']} first-detected clusters.\n"
            f"- Grid: {r['cell_count']} cells, 10 km EPSG:3310; target: {r['policy']['target']}.\n"
            f"- Training: {r['train_range'][0]} to {r['train_range'][1]} UTC.\n"
            f"- Validation: {r['validation_range'][0]} to {r['validation_range'][1]} UTC.\n"
            f"- Test: {r['test_range'][0]} to {r['test_range'][1]} UTC.\n"
            f"- Selected: **{r['selected_model']}** (by validation recall).\n"
            f"- Selected model held-out recall at top 10%: **{fmt(r['test']['selected'])}**.\n"
            f"- Historical baseline held-out recall at top 10%: **{fmt(r['test']['baseline'])}**.\n"
            f"- Example replay: **{example} 00:00 UTC**; illustrative day, not an aggregate estimate.\n"
            "- Weather/incident ignition/coverage data: **not supplied**. Predictions are relative, not calibrated probabilities.\n")

if __name__=='__main__':
    p=argparse.ArgumentParser(description='Compile FIRMS CSVs into fixed-grid, temporal replay JSON')
    p.add_argument('--modis');p.add_argument('--viirs')
    p.add_argument('--out',default='output');p.add_argument('--synthetic',action='store_true')
    a=p.parse_args()
    if not (a.modis or a.viirs):p.error('Provide --modis and/or --viirs')
    prepare(a.modis,a.viirs,a.out,a.synthetic)
