'use strict';
const $=id=>document.getElementById(id);
const SVG='http://www.w3.org/2000/svg';
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const allMonths=['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt=n=>Number(n||0).toLocaleString('en-US');
const nicePct=v=>v===null||v===undefined?'—':(v*100).toFixed(1)+'%';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const initArea=[-122.8,39.85,-121.1,41.2];
let S=null,area=[...initArea],view=[-123.9,39.47,-120.33,41.76],mode='forecast',sensor='both',
    period=null,dayFilter=null,selectedCell=null,revealed=false,issue='',drawMode=false,
    drag=null,projector=null,eligible=[],selectedSet=new Set(),lastSize={w:0,h:0},tileFailed=false;
const datesToReplay=()=>S?Object.keys(S.scores).sort():[];
function el(tag,attrs={},children=[]){const e=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));children.forEach(c=>e.appendChild(c));return e;}
function toast(t){const e=$('toast');e.textContent=t;e.classList.remove('hidden');clearTimeout(toast._timer);toast._timer=setTimeout(()=>e.classList.add('hidden'),4000)}
function inArea(c){return c.lon>=area[0]&&c.lon<=area[2]&&c.lat>=area[1]&&c.lat<=area[3]}
function recomputeEligible(){eligible=[];S.cells.forEach((c,i)=>{if(inArea(c))eligible.push(i)});selectedSet=new Set(eligible);if(selectedCell!==null&&!selectedSet.has(selectedCell))selectedCell=null}
function mer(lon,lat){const r=clamp(lat,-85,85)*Math.PI/180;return [(lon+180)/360,(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2]}
function inv(x,y){return [x*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI]}
function projectSetup(){let {clientWidth:w,clientHeight:h}=$('mapFrame');w=Math.max(w,1);h=Math.max(h,1);const a=mer(view[0],view[3]),b=mer(view[2],view[1]);const scale=Math.min(w/(b[0]-a[0]),h/(b[1]-a[1]));const cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2;lastSize={w,h};projector={scale,cx,cy,w,h, to:(lon,lat)=>{const p=mer(lon,lat);return [(p[0]-cx)*scale+w/2,(p[1]-cy)*scale+h/2]}, from:(x,y)=>inv(cx+(x-w/2)/scale,cy+(y-h/2)/scale)};const svg=$('mapSvg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`)}
function renderTiles(){const lay=$('tileLayer');lay.innerHTML='';if(tileFailed){$('mapAttribution').textContent='Offline vector fallback · 10 km grid';return}
  const P=projector,z=8,step=1/Math.pow(2,z),tileSize=step*P.scale;
  const firstX=Math.max(0,Math.floor((P.cx-P.w/2/P.scale)/step)),lastX=Math.min(255,Math.ceil((P.cx+P.w/2/P.scale)/step));
  const firstY=Math.max(0,Math.floor((P.cy-P.h/2/P.scale)/step)),lastY=Math.min(255,Math.ceil((P.cy+P.h/2/P.scale)/step));
  // Do not overload a tile server if the selected viewport is extremely wide.
  if((lastX-firstX+1)*(lastY-firstY+1)>30){$('mapAttribution').textContent='Offline vector fallback · 10 km grid';return}
  let loaded=0,failed=0;
  for(let x=firstX;x<=lastX;x++)for(let y=firstY;y<=lastY;y++){
    const img=document.createElement('img');img.alt='';img.loading='eager';img.decoding='async';
    img.style.left=((x*step-P.cx)*P.scale+P.w/2)+'px';img.style.top=((y*step-P.cy)*P.scale+P.h/2)+'px';
    img.style.width=(tileSize+1)+'px';img.style.height=(tileSize+1)+'px';
    img.onload=()=>{loaded++;$('mapAttribution').textContent='© OpenStreetMap contributors · EPSG:3310 overlay'};
    img.onerror=()=>{failed++;img.remove();if(failed>4&&!loaded){tileFailed=true;lay.innerHTML='';$('mapAttribution').textContent='Offline vector fallback · 10 km grid'}};
    img.src=`https://tile.openstreetmap.org/${z}/${x}/${y}.png`;lay.appendChild(img);
  }
}
function riskColor(r){if(r<20)return '#c9ddbe';if(r<40)return '#a9b8a7';if(r<60)return '#dec66e';if(r<80)return '#eca15d';return '#d65c35'}
function topIndices(scores,ids){const amount=Math.max(1,Math.ceil(ids.length*.10));return [...ids].sort((a,b)=>scores[b]-scores[a]||a-b).slice(0,amount)}
function daySet(){if(dayFilter)return [dayFilter];if(period)return Object.keys(S.days).filter(d=>d.startsWith(period));return Object.keys(S.days)}
function drawMap(viewChanged=false){if(!S)return;projectSetup();if(viewChanged)renderTiles();const P=projector,sc=S.scores[issue];if(!sc)return;
  $('mapCount').textContent=`${fmt(eligible.length)} eligible cells`;
  const base=$('gridShapes'),activity=$('activityShapes'),top=$('topShapes'),outcome=$('outcomeShapes'),selection=$('selectionShapes');
  for(const x of [base,activity,top,outcome,selection])x.replaceChildren();
  const tops=new Set(topIndices(sc.forecast,eligible));
  S.cells.forEach((c,i)=>{
    const pts=c.polygon.map(p=>P.to(...p).map(v=>v.toFixed(1)).join(',')).join(' ');
    const chosen=selectedSet.has(i);const poly=el('polygon',{points:pts,fill:riskColor(sc.forecast[i]),'fill-opacity':mode==='history'?(chosen?.2:.08):(chosen?.83:.12),class:'grid-cell'+(selectedCell===i?' selected':'')});
    poly.addEventListener('pointerdown',ev=>{ev.stopPropagation();if(drawMode){ev.preventDefault();drag={kind:'new',from:clientXY(ev),original:[...area]};try{$('mapSvg').setPointerCapture(ev.pointerId)}catch{}}});
    poly.addEventListener('click',ev=>{ev.stopPropagation();if(!drawMode){selectedCell=i;updateInspector();drawMap(false)}});
    base.appendChild(poly);
    if(mode==='forecast'&&chosen&&tops.has(i)){top.appendChild(el('polygon',{points:pts,class:'top-cell'}))}
  });
  if(mode==='history'){
    const count=new Map();for(const d of daySet()){
      const active=S.days[d];if(!active)continue;let found=(sensor==='m'?active.m:sensor==='v'?active.v:[...new Set([...active.m,...active.v])]);
      for(const i of found)if(selectedSet.has(i))count.set(i,(count.get(i)||0)+1)
    }
    const max=Math.max(1,...count.values());for(const [i,n] of count){const c=S.cells[i],p=P.to(c.lon,c.lat);activity.appendChild(el('circle',{cx:p[0],cy:p[1],r:clamp(3+4*Math.sqrt(n/max),3,8),class:'activity-circle'}))}
  }
  if(mode==='forecast'&&revealed){for(const o of S.observations){if(o.first&&o.ts.slice(0,10)===issue&&selectedSet.has(o.cell)){
    const p=P.to(o.lon,o.lat);outcome.appendChild(el('circle',{cx:p[0],cy:p[1],r:7,class:'outcome-circle'}));outcome.appendChild(el('circle',{cx:p[0],cy:p[1],r:2.5,class:'outcome-center'}))
  }}}
  const NW=P.to(area[0],area[3]),SE=P.to(area[2],area[1]);const x1=Math.min(NW[0],SE[0]),x2=Math.max(NW[0],SE[0]),y1=Math.min(NW[1],SE[1]),y2=Math.max(NW[1],SE[1]);
  // Rectangle border is drag-enabled; the interior remains clickable for cell inspection.
  const rect=el('rect',{x:x1,y:y1,width:x2-x1,height:y2-y1,class:'selection-rect','pointer-events':'stroke'});
  rect.addEventListener('pointerdown',e=>startDrag(e,'move'));selection.appendChild(rect);
  const handles=[['nw',x1,y1],['ne',x2,y1],['sw',x1,y2],['se',x2,y2]];
  for(const [side,x,y] of handles){const handle=el('circle',{cx:x,cy:y,r:7,class:'selection-handle'});handle.addEventListener('pointerdown',e=>startDrag(e,side));selection.appendChild(handle)}
}
function clientXY(e){const b=$('mapSvg').getBoundingClientRect();return [e.clientX-b.left,e.clientY-b.top]}
function startDrag(e,kind){if(drawMode)return;e.preventDefault();e.stopPropagation();drag={kind,from:clientXY(e),original:[...area]};try{$('mapSvg').setPointerCapture(e.pointerId)}catch{}}
function setArea(a){const r=[Math.min(a[0],a[2]),Math.min(a[1],a[3]),Math.max(a[0],a[2]),Math.max(a[1],a[3])];area=[clamp(r[0],S.bounds[0],S.bounds[2]),clamp(r[1],S.bounds[1],S.bounds[3]),clamp(r[2],S.bounds[0],S.bounds[2]),clamp(r[3],S.bounds[1],S.bounds[3])];if(area[2]-area[0]<.04)area[2]=area[0]+.04;if(area[3]-area[1]<.04)area[3]=area[1]+.04;recomputeEligible();refresh(false)}
$('mapSvg').addEventListener('pointerdown',e=>{if(drawMode){e.preventDefault();const xy=clientXY(e);drag={kind:'new',from:xy,original:[...area]};try{$('mapSvg').setPointerCapture(e.pointerId)}catch{}}});
$('mapSvg').addEventListener('pointermove',e=>{if(!drag||!projector)return;const [x,y]=clientXY(e),[x0,y0]=drag.from;const ll0=projector.from(x0,y0),ll1=projector.from(x,y),orig=drag.original;
  if(drag.kind==='move'){const delta=projector.from(x,y),initial=projector.from(x0,y0);const dx=delta[0]-initial[0],dy=delta[1]-initial[1];area=[orig[0]+dx,orig[1]+dy,orig[2]+dx,orig[3]+dy]}
  else if(drag.kind==='new'){area=[Math.min(ll0[0],ll1[0]),Math.min(ll0[1],ll1[1]),Math.max(ll0[0],ll1[0]),Math.max(ll0[1],ll1[1])]}
  else{area=[...orig];if(drag.kind.includes('w'))area[0]=ll1[0];if(drag.kind.includes('e'))area[2]=ll1[0];if(drag.kind.includes('n'))area[3]=ll1[1];if(drag.kind.includes('s'))area[1]=ll1[1]}
  area=[Math.min(area[0],area[2]),Math.min(area[1],area[3]),Math.max(area[0],area[2]),Math.max(area[1],area[3])];area=[clamp(area[0],S.bounds[0],S.bounds[2]),clamp(area[1],S.bounds[1],S.bounds[3]),clamp(area[2],S.bounds[0],S.bounds[2]),clamp(area[3],S.bounds[1],S.bounds[3])];recomputeEligible();drawMap(false)
});
function stopDrag(){if(!drag)return;const kind=drag.kind;drag=null;if(kind==='new'&&(area[2]-area[0]<.04||area[3]-area[1]<.04)){area=[...initArea];toast('Draw a larger region to apply the filter.')}
  if(kind==='new'){drawMode=false;$('drawArea').classList.remove('active');$('drawHint').classList.add('hidden')}
  recomputeEligible();refresh(false)
}
$('mapSvg').addEventListener('pointerup',stopDrag);$('mapSvg').addEventListener('pointercancel',stopDrag);
function changeIssue(date){if(!S.scores[date])return;issue=date;revealed=false;selectedCell=null;$('issueDate').value=date;refresh(false)}
function evalScores(ids,which,days){let captured=0,total=0,eventDays=0;const amount=Math.max(1,Math.ceil(ids.length*.1));for(const d of days){const item=S.scores[d];let ev=item.events.filter(i=>selectedSet.has(i));total+=ev.length;if(ev.length)eventDays++;const top=new Set([...ids].sort((a,b)=>item[which][b]-item[which][a]||a-b).slice(0,amount));for(const i of ev)if(top.has(i))captured++}
  return {captured,total,eventDays,days:days.length,ratio:total?captured/total:null}
}
function refresh(changedTiles=false){if(!S)return;recomputeEligible();updateHeader();drawMap(changedTiles);updateTop();updateInspector();updateMetrics();updateCalendar();updateComparison();updateReveal()}
function updateHeader(){const d=new Date(`${issue}T00:00:00Z`),next=new Date(d.getTime()+86400000);const dateReadable=d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});const nextReadable=next.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
  $('validWindow').textContent=`${dateReadable} 00:00 → ${nextReadable} 00:00 UTC`;
  $('floatingDate').textContent=dateReadable.toUpperCase()+' · 00:00 UTC';$('floatingSub').textContent='Valid until '+nextReadable+' 00:00 UTC';
  $('mapStateLabel').textContent=mode==='forecast'?'HISTORICAL RISK RANKING':'DETECTED HOTSPOT HISTORY';
  $('mapSubtitle').textContent=mode==='forecast'?'Select a cell to see drivers. Drag the rectangle border or corners to change area.':'Click a month or daily bar to filter observed cell activity.';
  $('methodName').textContent=S.meta.selected_model==='historical baseline'?'Smoothed historical baseline':S.meta.selected_model;
  $('dataModeCaption').textContent='Historical replay — current forecast unavailable.';
  $('dataRibbon').textContent=S.meta.synthetic?'SYNTHETIC DEMO DATA':'USER-SUPPLIED MODIS 2025';
  $('dataDetail').textContent=S.meta.synthetic?'Fabricated detections, not real wildfires. Never use for safety decisions.':`${fmt(S.meta.observation_count)} in-grid hotspot records from ${S.meta.imports.map(i=>i.file).join(' + ')}; source not independently verified.`;
  $('dataRibbon').style.background=S.meta.synthetic?'#ed7845':'#557a62';
  const hasVIIRS=S.meta.available_sensors.includes('VIIRS');
  document.querySelectorAll('[data-sensor="v"]').forEach(b=>{b.disabled=!hasVIIRS;b.title=hasVIIRS?'View VIIRS activity':'VIIRS has not been supplied'});
  $('sensorAvailability').textContent=hasVIIRS?'Both sensors loaded; comparing detected cell-days.':'VIIRS data unavailable. The displayed history is MODIS-only; unavailable VIIRS does not mean VIIRS observed zero fires.';
  $('inputNotice').textContent=`No current forecast: the last supplied hotspot record is ${S.meta.coverage_end}. Weather, fuel and incident inputs unavailable. ${eligible.length===0?'Selected area has no eligible cells.':''}`;
  $('coverageText').textContent=`${S.meta.coverage_start} — ${S.meta.coverage_end} · Overpass completeness unknown`;
  $('mapCount').textContent=`${eligible.length} eligible cells`;
  $('observedLegend').classList.toggle('hidden',!revealed||mode!=='forecast');
  $('calendarYear').textContent=S.meta.coverage_start.slice(0,4);
  $('forecastTab').classList.toggle('active',mode==='forecast');$('historyTab').classList.toggle('active',mode==='history');
  $('forecastControls').classList.toggle('hidden',mode!=='forecast');$('historyControls').classList.toggle('hidden',mode!=='history');
  $('headerMode').textContent=mode==='forecast'?'HISTORICAL REPLAY':'FIRE HISTORY';
  const replayDates=datesToReplay(),idx=replayDates.indexOf(issue);
  $('prevDay').disabled=idx<=0;$('nextDay').disabled=idx>=replayDates.length-1;
}
function updateTop(){const container=$('topCells');container.innerHTML='';$('eligibleCount').textContent=fmt(eligible.length);$('areaKm').textContent=`${fmt(eligible.length*100)} km² approx. · each cell 100 km²`;
  if(!eligible.length){container.textContent='No eligible grid cells in this area.';return}
  const score=S.scores[issue].forecast;const ordered=[...eligible].sort((a,b)=>score[b]-score[a]||a-b).slice(0,5);
  for(let r=0;r<ordered.length;r++){const i=ordered[r],c=S.cells[i],row=document.createElement('div');row.className='top-row';row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label',`Inspect ${c.id}`);
  row.innerHTML=`<span class="top-rank">${String(r+1).padStart(2,'0')}</span><div class="cell-loc">${c.lat.toFixed(2)}°N, ${Math.abs(c.lon).toFixed(2)}°W<small>${c.id}</small></div><span class="risk-number">${score[i]}<small> / 100</small></span>`;
  row.onclick=()=>{selectedCell=i;drawMap();updateInspector()};row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();row.click()}};container.appendChild(row)}
}
function updateInspector(){const detail=$('cellDetail');$('cellEmpty').classList.toggle('hidden',selectedCell!==null);detail.classList.toggle('hidden',selectedCell===null);
  if(selectedCell===null)return;const c=S.cells[selectedCell],risk=S.scores[issue].forecast[selectedCell];const issueMs=Date.parse(issue+'T00:00:00Z');
  const earlier=S.observations.filter(o=>o.cell===selectedCell&&Date.parse(o.ts)<issueMs);
  const countDays=d=>earlier.filter(o=>o.first&&Date.parse(o.ts)>=issueMs-d*86400000).length;
  const hits7=earlier.filter(o=>Date.parse(o.ts)>=issueMs-7*86400000).length;
  const sorted=earlier.sort((a,b)=>b.ts.localeCompare(a.ts));const latest=sorted.length?sorted[0].ts.replace('T',' ').slice(0,16)+' UTC':'None recorded';
  detail.innerHTML=`<div class="cell-id">${c.id}</div><div class="cell-coords">${c.lat.toFixed(4)}° N &nbsp; ${Math.abs(c.lon).toFixed(4)}° W · 10 km grid</div><div class="cell-rank-row"><strong>${risk}<small style="font-size:14px"> / 100</small></strong><span>Relative risk percentile<br>not a probability</span></div><div class="driver"><span>New activity starts · past 7d</span><b>${countDays(7)}</b></div><div class="driver"><span>New activity starts · past 30d</span><b>${countDays(30)}</b></div><div class="driver"><span>New activity starts · past 90d</span><b>${countDays(90)}</b></div><div class="driver"><span>Hotspot observations · past 7d</span><b>${hits7}</b></div><div class="driver"><span>Last recorded detection</span><b>${latest}</b></div><div class="driver"><span>Weather / fuel inputs</span><b style="color:#ad6a3b">Unavailable</b></div><div class="input-stamp">Forecast issued ${issue} 00:00 UTC · All driver timestamps precede issue time. No current observations or post-issue inputs used.</div>`;
}
function updateMetrics(){const test=datesToReplay();const selected=evalScores(eligible,'forecast',test),baseline=evalScores(eligible,'baseline',test);
  const experimental=S.scores[issue].experimental?evalScores(eligible,'experimental',test):null;
  $('testRecall').innerHTML=selected.ratio===null?'—':`${(selected.ratio*100).toFixed(1)}<small>%</small>`;
  $('baselineRecall').textContent=nicePct(baseline.ratio);$('candidateRecall').textContent=experimental?nicePct(experimental.ratio):'—';
  $('testCaptured').textContent=`${selected.captured} / ${selected.total}`;
  $('testDays').textContent=fmt(test.length);
  $('testPeriod').textContent=`${test[0]||''} → ${test[test.length-1]||''}`;
}
function updateReveal(){const btn=$('revealBtn'),result=$('dayResults');btn.classList.toggle('revealed',revealed);$('revealText').textContent=revealed?'Hide observed events':'Reveal what happened';$('revealIcon').textContent=revealed?'◌':'◉';$('revealHint').textContent=revealed?'Orange-and-white rings mark newly detected activity. Risk colours have not changed.':'Observed events stay hidden until you reveal them.';
  result.classList.toggle('hidden',!revealed);
  if(!revealed)return;const forecast=evalScores(eligible,'forecast',[issue]);const baseline=evalScores(eligible,'baseline',[issue]);const experimental=S.scores[issue].experimental?evalScores(eligible,'experimental',[issue]):null;
  result.innerHTML=`<strong>OBSERVED IN THE FOLLOWING 24H</strong><div class="big">${forecast.captured} / ${forecast.total} captured</div><p>Top 10% of ${eligible.length} selected cells. The historical baseline captured ${baseline.captured} / ${baseline.total}. ${experimental?`An experimental logistic model captured ${experimental.captured} / ${experimental.total} (not the shipped forecast). `:''}${forecast.total?'This is one illustrative replay day; see aggregate held-out track record.':'No first-detected event was recorded inside this area that day; coverage is unknown.'}</p>`;
}
function summarizeDays(dayNames){const agg={m:0,v:0,union:0,mOnly:0,vOnly:0,both:0};for(const d of dayNames){const a=S.days[d];if(!a)continue;const mm=new Set(a.m.filter(i=>selectedSet.has(i))),vv=new Set(a.v.filter(i=>selectedSet.has(i)));
    let overlap=0;for(const i of mm)if(vv.has(i))overlap++;
    agg.m+=mm.size;agg.v+=vv.size;agg.both+=overlap;agg.union+=mm.size+vv.size-overlap;agg.mOnly+=mm.size-overlap;agg.vOnly+=vv.size-overlap;
  }return agg}
function periodDaysFor(prefix){const min=S.meta.coverage_start,max=S.meta.coverage_end;let date=new Date(min+'T00:00:00Z');const end=new Date(max+'T00:00:00Z');const all=[];
  while(date<=end){const d=date.toISOString().slice(0,10);if(d.startsWith(prefix))all.push(d);date.setUTCDate(date.getUTCDate()+1)}return all}
function updateCalendar(){const box=$('calendar');box.replaceChildren();const years=[];for(let y=Number(S.meta.coverage_start.slice(0,4));y<=Number(S.meta.coverage_end.slice(0,4));y++)years.push(y);
  // In multi-year mode, years appear as explicit separate rows with 12 month columns.
  if(years.length>1)box.style.gridTemplateColumns='75px repeat(12,minmax(0,1fr))';else box.style.gridTemplateColumns='';
  const totals=[];for(const year of years)for(let month=1;month<=12;month++)totals.push(summarizeDays(periodDaysFor(`${year}-${String(month).padStart(2,'0')}`)).union);
  const max=Math.max(...totals,1);
  years.forEach((year,yi)=>{if(years.length>1){const label=document.createElement('div');label.textContent=year;label.style.cssText='font-weight:800;display:grid;place-items:center;font-size:12px';box.appendChild(label)}
    for(let month=1;month<=12;month++){const key=`${year}-${String(month).padStart(2,'0')}`,n=totals[yi*12+month-1],ratio=n/max;const heat=n===0?0:ratio<.16?1:ratio<.40?2:ratio<.72?3:4;const btn=document.createElement('button');btn.className=`month-box heat${heat}`+(period===key?' active':'');btn.innerHTML=`<span class="month-name">${months[month-1]}</span><span class="month-value">${fmt(n)}</span>`;
      btn.title=`${allMonths[month-1]} ${year}: ${n} combined active cell-days. Click to filter.`;btn.onclick=()=>{period=period===key?null:key;dayFilter=null;mode='history';refresh(false)};box.appendChild(btn)}});
  const detail=$('dailyDetail');detail.classList.toggle('hidden',!period);$('historyPeriod').textContent=dayFilter|| (period?`${allMonths[Number(period.slice(5))-1]} ${period.slice(0,4)}`:'All available dates');
  if(!period)return;const days=periodDaysFor(period),series=days.map(d=>summarizeDays([d]).union),high=Math.max(1,...series);
  detail.innerHTML=`<div class="daily-heading"><strong>${allMonths[Number(period.slice(5))-1]} ${period.slice(0,4)} · daily activity</strong><button class="linklike" id="clearDaily">Clear day ×</button></div><div class="daily-bars" id="bars"></div><div class="daily-note">Click a bar to filter observations shown on the map. Each bar counts combined active cell-days.</div>`;
  const bars=$('bars');series.forEach((n,i)=>{const b=document.createElement('button');b.className='daily-bar'+(dayFilter===days[i]?' active':'');b.style.height=`${Math.max(3,Math.round(n/high*60))}px`;b.title=`${days[i]} · ${n} active cell-days`;b.setAttribute('aria-label',b.title);b.onclick=()=>{dayFilter=dayFilter===days[i]?null:days[i];refresh(false)};bars.appendChild(b)});
  $('clearDaily').onclick=()=>{dayFilter=null;refresh(false)}
}
function updateComparison(){const r=summarizeDays(daySet()),viirsReady=S.meta.available_sensors.includes('VIIRS');$('modisCount').textContent=fmt(r.m);$('viirsCount').textContent=viirsReady?fmt(r.v):'N/A';$('combinedCount').textContent=fmt(r.union);
  $('onlyModis').textContent=viirsReady?fmt(r.mOnly):'N/A';$('onlyViirs').textContent=viirsReady?fmt(r.vOnly):'N/A';$('bothCount').textContent=viirsReady?fmt(r.both):'N/A';
  $('agreementNote').textContent=S.meta.available_sensors.includes('VIIRS')?`${dayFilter||period||'All dates'} · selected area`:'VIIRS missing';
  const chunks=[['m',r.mOnly],['v',r.vOnly],['b',r.both]];$('agreementBar').innerHTML=viirsReady?chunks.map(([cl,n])=>`<span class="${cl}" style="width:${r.union?100*n/r.union:0}%"></span>`).join(''):'';
}
function switchMode(m){mode=m;refresh(false);if(m==='history')$('calendar').scrollIntoView({behavior:'smooth',block:'nearest'})}
$('forecastTab').onclick=()=>switchMode('forecast');$('historyTab').onclick=()=>switchMode('history');$('jumpHistory').onclick=()=>switchMode('history');
$('revealBtn').onclick=()=>{revealed=!revealed;updateReveal();drawMap(false)};
$('prevDay').onclick=()=>{const a=datesToReplay(),i=a.indexOf(issue);if(i>0)changeIssue(a[i-1])};
$('nextDay').onclick=()=>{const a=datesToReplay(),i=a.indexOf(issue);if(i<a.length-1)changeIssue(a[i+1])};
$('issueDate').onchange=e=>{const dates=datesToReplay(),want=e.target.value;const closest=dates.reduce((a,b)=>Math.abs(Date.parse(b)-Date.parse(want))<Math.abs(Date.parse(a)-Date.parse(want))?b:a,dates[0]);if(want!==closest)toast('Replay dates limited to chronologically held-out days. Nearest available date selected.');changeIssue(closest)};
$('drawArea').onclick=()=>{drawMode=!drawMode;drag=null;$('drawArea').classList.toggle('active',drawMode);$('drawHint').classList.toggle('hidden',!drawMode)};
$('resetArea').onclick=()=>{area=[...initArea];recomputeEligible();toast('Study area reset to the demo region');refresh(false)};
$('zoomIn').onclick=()=>zoom(.75);$('zoomOut').onclick=()=>zoom(1.35);
function zoom(f){const cx=(view[0]+view[2])/2,cy=(view[1]+view[3])/2,dx=(view[2]-view[0])*f/2,dy=(view[3]-view[1])*f/2;if(dx>.22&&dx<3.5)view=[cx-dx,cy-dy,cx+dx,cy+dy];refresh(true)}
$('clearCell').onclick=()=>{selectedCell=null;refresh(false)};
$('clearPeriod').onclick=()=>{period=null;dayFilter=null;refresh(false)};
for(const btn of document.querySelectorAll('.sensor-btn'))btn.onclick=()=>{sensor=btn.dataset.sensor;document.querySelectorAll('.sensor-btn').forEach(e=>e.classList.toggle('active',e===btn));refresh(false)};
$('exportCsv').onclick=()=>{const heading=['period_utc','modis_active_cell_days','viirs_active_cell_days','combined_active_cell_days','both_sensors_same_cell_day','modis_only','viirs_only'];const years=[...new Set(periodDaysFor('').map(d=>d.slice(0,4)))];const rows=[heading];for(const y of years)for(let m=1;m<=12;m++){const key=`${y}-${String(m).padStart(2,'0')}`;if(period&&!key.startsWith(period))continue;const r=summarizeDays(periodDaysFor(key));rows.push([key,r.m,r.v,r.union,r.both,r.mOnly,r.vOnly])}
  const blob=new Blob([rows.map(row=>row.join(',')).join('\n')+'\n'],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`emberwatch_${period||'all'}_active_cell_days.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)};
function openModal(type){const box=$('modalContent');$('modalTitle').textContent=type==='import'?'Import your FIRMS observations':'How the forecast works';$('modalBackdrop').classList.remove('hidden');
  if(type==='import'){
    box.innerHTML=`<p><b>MODIS 2025 from skib.csv is already loaded.</b> Choose a MODIS CSV to replace it, and/or add VIIRS NOAA-21 to compare sensors. A single sensor CSV is enough. Replays are regenerated for a Northern California 10 km grid; records outside that grid are not used. Successful imports replace the prepared data.</p><label>MODIS C6.1 (.csv, optional replacement)<input id="modisFile" type="file" accept=".csv"></label><label>VIIRS NOAA-21 (.csv, optional)<input id="viirsFile" type="file" accept=".csv"></label><button class="reveal-btn" id="startImport">Import, train and refresh ↗</button><p id="importResponse" class="warning hidden"></p><p class="tiny">At least 121 days of retained records required for replay. Columns: latitude, longitude, acq_date, acq_time. Dates YYYY-MM-DD or unambiguous DD/MM/YYYY or MM/DD/YYYY; HHMM time interpreted as UTC. File limit: 40 MB each. If only VIIRS is uploaded, bundled skib.csv is kept.</p>`;
    $('startImport').onclick=async()=>{const m=$('modisFile').files[0],v=$('viirsFile').files[0];if(!m&&!v){$('importResponse').textContent='Select at least one sensor CSV file.';$('importResponse').classList.remove('hidden');return}const form=new FormData();if(m)form.append('modis',m);if(v)form.append('viirs',v);const btn=$('startImport');btn.disabled=true;btn.textContent='Validating and generating replay…';try{const response=await fetch('/api/import',{method:'POST',body:form});const out=await response.json();if(!response.ok)throw Error(out.detail||'Import failed');await loadState();$('modalBackdrop').classList.add('hidden');toast(`Imported ${out.observations} in-grid satellite observations`)}catch(e){$('importResponse').textContent=e.message;$('importResponse').classList.remove('hidden')}finally{btn.disabled=false;btn.textContent='Import, train and refresh ↗'}};
  }else{
    const r=S.meta;box.innerHTML=`<p><b>${r.demo_type}</b>. This project creates relative rankings for first satellite-detected hotspots. It is not a real-time wildfire warning or an estimate of ignition probability.</p><h3>Forecast definition</h3><p>One prediction is one 10 km EPSG:3310 cell at midnight UTC, valid for the following 24 hours. The smoothed historical baseline ranks cells using earlier satellite-derived new-activity counts (last 30/90 days and cumulative history), plus neighbouring 30-day starts. All eligible cells receive a score, including never-detected cells. Colour represents a percentile, not calibrated risk.</p><h3>Target and evidence</h3><p>A candidate first-detection event begins when no earlier satellite hotspot lies within 15 km and 72 hours. This is a practical proxy, <b>not confirmed ignition</b>; ongoing fires crossing cells are less likely to be counted as new events. The first three days are excluded to allow lookback. Unobserved hotspots are non-detections, not proof of no fire; satellite coverage completeness is unknown.</p><h3>Model and validation</h3><p>Calendar days are split chronologically into training (${r.train_range.join(' – ')}), validation (${r.validation_range.join(' – ')}) and later test (${r.test_range.join(' – ')}), with three-day gaps. A logistic regression is evaluated separately but the conservative historical baseline ships by default. Test metrics compare identical dates and cells. There are <b>${r.test.selected.events} first-detection events across ${r.test.selected.days} held-out days</b> in the full grid.</p><h3>Sensor harmonization</h3><p>Available sensors: ${r.available_sensors.join(', ')}. ${r.missing_sensors.length?'Missing sensors: '+r.missing_sensors.join(', ')+'. Sensor agreement is not measurable with one source.':''} The monthly chart reports <b>active cell-days</b>. Each sensor independently contributes at most one count per cell and UTC date; the combined metric is their union, counting a shared cell-day once. This is agreement at coarse space/time resolution, <b>not precise observation matching</b>. MODIS / VIIRS overpasses, detection thresholds and pixel footprints differ. The claimed 205 notebook matches cannot be audited without its source notebook/data.</p><h3>Data provenance & missing inputs</h3><p>${r.imports.map(x=>`${x.sensor}: ${x.file} (${x.kept} kept; ${x.malformed} malformed; ${x.out_of_area} outside grid)`).join('<br>')}.</p><p>Weather reanalysis/issued forecasts, fuel, ignition incident records, coverage masks and burned-area imagery were not supplied. No weather is used to forecast. To measure cross-sensor overlap, obtain the NOAA-21 VIIRS source; supplied MODIS provenance is not independently verified.</p>`;
  }
}
$('importBtn').onclick=()=>openModal('import');$('infoBtn').onclick=()=>openModal('method');$('openMethod').onclick=()=>openModal('method');$('closeModal').onclick=()=>$('modalBackdrop').classList.add('hidden');$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))e.currentTarget.classList.add('hidden')});window.addEventListener('keydown',e=>{if(e.key==='Escape'){drag=null;drawMode=false;$('drawHint').classList.add('hidden');$('drawArea').classList.remove('active');$('modalBackdrop').classList.add('hidden')}});
window.addEventListener('resize',()=>{if(S)drawMap(true)});
async function loadState(){const response=await fetch('/api/state',{cache:'no-store'});if(!response.ok)throw Error('Prepared data missing. See README for commands.');S=await response.json();area=[...initArea];period=null;dayFilter=null;selectedCell=null;revealed=false;mode='forecast';issue=S.example_date;const dates=datesToReplay();$('issueDate').min=dates[0];$('issueDate').max=dates[dates.length-1];$('issueDate').value=issue;recomputeEligible();refresh(true)}
loadState().catch(err=>{$('dataDetail').textContent='App data unavailable: '+err.message;$('topCells').textContent='Run the data preparation command in README.md';toast('Unable to load the prepared dataset.')});
