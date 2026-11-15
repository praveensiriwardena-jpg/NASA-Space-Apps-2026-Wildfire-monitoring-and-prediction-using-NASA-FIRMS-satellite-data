"""Coarse MODIS/VIIRS candidate-pair audit, NOT assertion of identical detections.
Strictly separate candidate pairs and distinct observations, retain one-to-many links.
"""
import argparse,json
from collections import Counter
from pathlib import Path
from datetime import timedelta
from scipy.spatial import cKDTree
import numpy as np
from pipeline import grid,read_firms,TO_XY

def audit(modis,viirs,max_km=2,max_hours=3):
    _,index=grid();m,ma=read_firms(modis,'MODIS',index);v,va=read_firms(viirs,'VIIRS',index)
    ma['dropped_outside_region']=ma['out_of_area'];va['dropped_outside_region']=va['out_of_area']
    coords=np.array([TO_XY.transform(o['lon'],o['lat']) for o in v]).reshape(-1,2)
    tree=cKDTree(coords) if len(coords) else None
    pairs=[]
    if tree:
        for mo in m:
            xy=TO_XY.transform(mo['lon'],mo['lat'])
            for j in tree.query_ball_point(xy,max_km*1000):
                vi=v[j]
                delta=abs((mo['ts']-vi['ts']).total_seconds())/3600
                if delta<=max_hours:
                    dist=float(np.linalg.norm(np.asarray(xy)-coords[j]))/1000
                    pairs.append(dict(modis_id=mo['id'],viirs_id=vi['id'],distance_km=round(dist,3),
                                      delta_hours=round(delta,3),modis_source=f"{mo['source']}:{mo['row']}",
                                      viirs_source=f"{vi['source']}:{vi['row']}"))
    nm=Counter(p['modis_id'] for p in pairs);nv=Counter(p['viirs_id'] for p in pairs)
    summary={'thresholds':{'max_distance_km':max_km,'max_absolute_time_difference_h':max_hours},
             'candidate_pairs':len(pairs),'distinct_modis_observations':len(nm),'distinct_viirs_observations':len(nv),
             'modis_with_multiple_candidates':sum(n>1 for n in nm.values()),
             'viirs_with_multiple_candidates':sum(n>1 for n in nv.values()),
             'warning':'Candidate pairs are not validated same-fire matches. No 205-match claim is made.',
             'imports':[ma,va],'pairs':pairs}
    return summary
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--modis',required=True);p.add_argument('--viirs',required=True)
    p.add_argument('--max-km',type=float,default=2);p.add_argument('--max-hours',type=float,default=3)
    p.add_argument('--out',default='output/match_audit.json')
    a=p.parse_args();result=audit(a.modis,a.viirs,a.max_km,a.max_hours)
    Path(a.out).parent.mkdir(exist_ok=True,parents=True);Path(a.out).write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='pairs'},indent=2))
