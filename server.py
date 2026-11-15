"""Offline-friendly FastAPI web app with bundled user-supplied MODIS history."""
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pipeline import prepare

ROOT=Path(__file__).resolve().parent
app=FastAPI(title='EmberWatch | NASA Space Apps student prototype',version='0.2')
app.mount('/public',StaticFiles(directory=ROOT/'public'),name='public')

@app.get('/')
def home():return FileResponse(ROOT/'public'/'index.html')

@app.get('/api/state')
def state():
    path=ROOT/'output'/'state.json'
    if not path.exists():raise HTTPException(status_code=503,detail='No prepared data. See README for preprocessing.')
    return FileResponse(path,media_type='application/json',headers={'Cache-Control':'no-store'})

@app.get('/api/health')
def health():return {'ok':True,'ready':(ROOT/'output'/'state.json').exists()}

@app.post('/api/import')
async def import_csv(modis:UploadFile|None=File(None),viirs:UploadFile|None=File(None)):
    if modis is None and viirs is None:
        raise HTTPException(400,detail='Choose a MODIS and/or VIIRS CSV file')
    target=ROOT/'data'/'user';target.mkdir(parents=True,exist_ok=True)
    # Reuse bundled MODIS if user uploads only the missing VIIRS archive.
    paths={'MODIS':ROOT/'data'/'skib.csv','VIIRS':None}
    for sensor,upload in (('MODIS',modis),('VIIRS',viirs)):
        if upload is None:continue
        if not (upload.filename or '').lower().endswith('.csv'):
            raise HTTPException(400,detail=f'{sensor} upload must be a CSV file')
        path=target/f'upload_{sensor.lower()}.csv';size=0
        with path.open('wb') as dest:
            while chunk:=await upload.read(1024*1024):
                size+=len(chunk)
                if size>40*1024*1024:
                    path.unlink(missing_ok=True)
                    raise HTTPException(413,detail='Limit 40 MB per CSV')
                dest.write(chunk)
        paths[sensor]=path
    try:
        new=prepare(paths['MODIS'],paths['VIIRS'],ROOT/'output',synthetic=False)
    except Exception as exc:
        raise HTTPException(400,detail=str(exc))
    return {'ok':True,'observations':new['meta']['observation_count'],
            'sensors':new['meta']['available_sensors']}
