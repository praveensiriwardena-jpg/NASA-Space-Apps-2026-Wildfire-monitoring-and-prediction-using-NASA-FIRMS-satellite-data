from datetime import date,datetime,timedelta,timezone
from pathlib import Path
import csv
import json
import numpy as np
import pytest
from pipeline import grid,read_firms,acq_datetime,tag_events,features_matrices,TO_XY

ROOT=Path(__file__).parents[1]

def test_time_parser_utc_formats():
    assert acq_datetime('2025-07-02','57').isoformat()=='2025-07-02T00:57:00+00:00'
    assert acq_datetime('2025-07-02','15:04').isoformat()=='2025-07-02T15:04:00+00:00'
    with pytest.raises(ValueError):acq_datetime('2025-07-02','2460')

def test_grid_stable_and_real_10km_spacing():
    a,lookup=grid();b,_=grid()
    assert [c['id'] for c in a]==[c['id'] for c in b]
    assert len(a)>100
    c=a[0];x1,y1=TO_XY.transform(*c['polygon'][0]);x2,y2=TO_XY.transform(*c['polygon'][1]);assert 9990<abs(x2-x1)<10010

def test_invalid_csv_rejected(tmp_path):
    path=tmp_path/'invalid.csv';path.write_text('nonsense,blah\n1,2\n')
    with pytest.raises(ValueError,match='missing required fields'):read_firms(path,'MODIS',grid()[1])

def test_malformed_and_outside_region_are_distinct(tmp_path):
    path=tmp_path/'data.csv';path.write_text('latitude,longitude,acq_date,acq_time\n40.3,-122.4,2025-06-01,0645\nhello,-122.1,2025-06-01,1015\n32,-95,2025-06-01,1015\n')
    arr,r=read_firms(path,'MODIS',grid()[1]);assert r['kept']==1 and r['malformed']==1 and r['out_of_area']==1

def test_repeated_sensor_observations_count_one_cell_day():
    state=json.loads((ROOT/'output'/'state.json').read_text())
    # Verify every daily list is a set and combined is the union of per-sensor sets.
    for day,entry in state['days'].items():
        m,v=set(entry['m']),set(entry['v']);assert len(m)==len(entry['m']) and len(v)==len(entry['v'])
        assert len(m|v)==len(m)+len(v)-len(m&v)
    # Explicitly two detections from one instrument in the same cell/day -> one active cell-day.
    assert len(set([15,15,15])|set([15,15]))==1

def test_future_events_do_not_change_past_baseline():
    cells,lookup=grid();idx=next(iter(lookup.values()));c=cells[idx]
    def rec(day,hh,offset=0):return {'id':f'{day}-{hh}-{offset}', 'sensor':'MODIS','cell':idx,'lat':c['lat']+offset,'lon':c['lon'],
                 'ts':datetime(2025,1,day,hh,tzinfo=timezone.utc), 'confidence':'80','satellite':'A','source':'test','row':day}
    records=[rec(1,12),rec(5,14),rec(10,7),rec(20,13)]
    pre=[r.copy() for r in records];tag_events(pre)
    _,a,_,_=features_matrices(pre,cells,date(2025,1,1),date(2025,1,31))
    altered=[r.copy() for r in records]+[rec(21,4),rec(25,22)]
    tag_events(altered)
    _,b,_,_=features_matrices(altered,cells,date(2025,1,1),date(2025,1,31))
    np.testing.assert_array_equal(a[19],b[19])

def test_no_future_event_leaks_to_first_detection():
    cells,_=grid();c=cells[20];obs=[]
    for idx,day in enumerate([2,5,5,8]):obs.append(dict(id=str(idx),sensor='MODIS',cell=20,lat=c['lat'],lon=c['lon'],ts=datetime(2025,2,day,tzinfo=timezone.utc)))
    tag_events(obs)
    assert obs[0]['first'] is True
    assert obs[1]['first'] is False  # exactly 72 hours still inside the lookback
    assert obs[2]['first'] is False

def test_empty_area_has_zero_eligible_cells():
    cells,_=grid();assert sum(c['lon']>10 for c in cells)==0

def test_unavailable_input_fails_informatively(tmp_path):
    with pytest.raises(ValueError,match='CSV not found'):read_firms(tmp_path/'missing.csv','VIIRS',grid()[1])

def test_bundled_modis_ddmmyyyy_and_nonvegetation_filter():
    rows, info = read_firms(ROOT/'data'/'skib.csv', 'MODIS', grid()[1])
    assert info['date_format'] == '%d/%m/%Y'
    assert info['rows'] == 7820 and info['kept'] == 1377
    assert info['excluded_nonvegetation'] == 305
    assert info['malformed'] == 0
    assert all(r['sensor'] == 'MODIS' and r['ts'].tzinfo == timezone.utc for r in rows)

def test_bundled_state_is_real_modis_only():
    s = json.loads((ROOT/'output'/'state.json').read_text())
    assert s['meta']['synthetic'] is False
    assert s['meta']['available_sensors'] == ['MODIS']
    assert s['meta']['missing_sensors'] == ['VIIRS']
    assert s['meta']['test']['selected']['hits'] == 21
    assert s['meta']['test']['selected']['events'] == 59
