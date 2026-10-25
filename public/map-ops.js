'use strict';
/* WARFRONT FIVE world simulation. The basemap is geographical; bases, aircraft,
   vehicles, positions, licenses, light cycles and jams are entirely fictional. */
(() => {
  if (!window.L || !map) return;
  const el=id=>document.getElementById(id);
  const DEFAULT_BASES={BLUE:{lat:39.102,lng:-94.571},RED:{lat:39.086,lng:-94.607}};
  let bases={...DEFAULT_BASES};
  let placeBase=false,roadEpoch=0,roadAbort=null,roadSource='loading',lastRoadCenter=null,roadReloadTimer=null;
  let roads=[],cars=[],planes=[],baseMarkers={};
  let carRoutes=L.layerGroup().addTo(map),carMarkers=L.layerGroup().addTo(map),airMarkers=L.layerGroup().addTo(map),signals=L.layerGroup().addTo(map);
  const dotRenderer=L.canvas({padding:.35});
  let baseLayers={},basemap='terrain',vision='normal',lastTime=performance.now();
  const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const clampInt=(x,a,b,def)=>Number.isFinite(+x)?clamp(Math.round(+x),a,b):def;
  const prefs={mapStyle:'terrain',vision:'normal',red:100,green:100,blue:100,air:true,cars:false,density:100};
  try{const saved=JSON.parse(localStorage.getItem('warfront-usa-ops')||'{}');
    if(['terrain','streets','satellite'].includes(saved.mapStyle))prefs.mapStyle=saved.mapStyle;
    if(['normal','rgb','heat','night'].includes(saved.vision))prefs.vision=saved.vision;
    for(const ch of ['red','green','blue'])prefs[ch]=clampInt(saved[ch],0,200,100);
    if(typeof saved.air==='boolean')prefs.air=saved.air;
    if(typeof saved.cars==='boolean')prefs.cars=false;
    prefs.density=clampInt(saved.density,20,200,100);
  }catch{}
  prefs.cars=false;
  const save=()=>{try{localStorage.setItem('warfront-usa-ops',JSON.stringify(prefs))}catch{}};
  const activeTeam=()=>me?.team||'BLUE';
  const activeBase=()=>bases[activeTeam()]||DEFAULT_BASES.BLUE;
  const coord=latlng=>`${latlng.lat.toFixed(4)} / ${latlng.lng.toFixed(4)}`;
  const text=(id,t)=>{if(el(id))el(id).textContent=t};
  function renderBases(){
    for(const team of ['BLUE','RED']){
      const b=bases[team];if(!b)continue;
      if(baseMarkers[team])map.removeLayer(baseMarkers[team]);
      const html=`<span class="fictional-base ${team==='BLUE'?'blue':'red'}"><b>${team[0]}</b></span>`;
      baseMarkers[team]=L.marker([b.lat,b.lng],{icon:L.divIcon({className:'fictional-base-wrap',html,iconSize:[34,34],iconAnchor:[17,17]}),zIndexOffset:400}).addTo(map);
      baseMarkers[team].bindPopup(`${team} TEAM BASE<br>FICTIONAL / U.S. MAP`);
    }
    const b=activeBase();text('baseCoords',`${activeTeam()} BASE / USA · ${coord(b)}`);
  }
  function clearCarLayers(){cars=[];carRoutes.clearLayers();carMarkers.clearLayers();signals.clearLayers();text('carCount','000');}
  function clearPlanes(){planes=[];airMarkers.clearLayers();text('airCount','00');}
  function getMapLayers(){
    map.eachLayer(layer=>{if(layer instanceof L.TileLayer && !baseLayers.streets)baseLayers.streets=layer;});
    if(!baseLayers.streets)baseLayers.streets=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19});
    baseLayers.terrain=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',{
      attribution:'Map tiles &copy; Esri, HERE, Garmin, USGS, OpenStreetMap contributors',maxZoom:19});
    baseLayers.satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
      attribution:'Imagery &copy; Esri and its imagery providers',maxZoom:19});
  }
  function setMapStyle(style){
    if(!baseLayers[style])return;
    for(const layer of Object.values(baseLayers))if(map.hasLayer(layer))map.removeLayer(layer);
    baseLayers[style].addTo(map);
    // Keep markers above the base map.
    basemap=style;prefs.mapStyle=style;save();
    document.querySelectorAll('.map-style').forEach(btn=>btn.classList.toggle('active',btn.dataset.mapstyle===style));
  }
  function setVision(view){
    if(!['normal','rgb','heat','night'].includes(view))return;
    vision=view;prefs.vision=view;save();
    el('map').dataset.vision=view;
    document.querySelectorAll('.vision-mode').forEach(btn=>btn.classList.toggle('active',btn.dataset.vision===view));
    el('rgbSliders').hidden=view!=='rgb';
  }
  function setRgb(){
    const out=[];
    for(const ch of ['red','green','blue']){
      const v=clampInt(el(`${ch}Channel`).value,0,200,100);prefs[ch]=v;
      text(`${ch}ChannelValue`,`${v}%`);
    }
    const v=[prefs.red/100,prefs.green/100,prefs.blue/100];
    el('warfrontRgbMatrix').setAttribute('values',`${v[0]} 0 0 0 0  0 ${v[1]} 0 0 0  0 0 ${v[2]} 0 0  0 0 0 1 0`);
    save();
  }
  function countRoadLength(coords){
    let length=0;
    for(let i=1;i<coords.length;i++) length+=distance(coords[i-1],coords[i]);
    return length;
  }
  function distance(a,b){
    const lat=(a[0]+b[0])*Math.PI/360;
    return Math.hypot((a[0]-b[0])*111195,(a[1]-b[1])*111195*Math.cos(lat));
  }
  function normaliseRoute(coords){
    if(!coords||coords.length<2)return null;
    const dist=[0];let total=0;
    for(let i=1;i<coords.length;i++){total+=distance(coords[i-1],coords[i]);dist.push(total)}
    if(total<45)return null;
    return {coords,dist,total};
  }
  function positionOn(route,meters){
    const target=clamp(meters,0,route.total);
    let k=1;while(k<route.dist.length-1&&route.dist[k]<target)k++;
    const low=route.dist[k-1],high=route.dist[k],t=high>low?(target-low)/(high-low):0;
    const a=route.coords[k-1],b=route.coords[k];
    return {lat:a[0]+(b[0]-a[0])*t,lng:a[1]+(b[1]-a[1])*t,bearing:Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI};
  }
  function demoRoads(base){
    const results=[],ys=[-.006,-.003,0,.003,.006],xs=[-.009,-.005,0,.005,.009];
    for(const y of ys)results.push({coords:[[base.lat+y,base.lng-.012],[base.lat+y,base.lng+.012]],kind:'DEMO'});
    for(const x of xs)results.push({coords:[[base.lat-.010,base.lng+x],[base.lat+.010,base.lng+x]],kind:'DEMO'});
    results.push({coords:[[base.lat-.009,base.lng-.011],[base.lat+.009,base.lng+.011]],kind:'DEMO'});
    return results;
  }
  async function getRoadsFromOSM(base,controller){
    // This local endpoint fetches actual mapped street lines; it does not reveal
    // positions, registrations, or activities of real vehicles.
    const url=`/api/roads?lat=${base.lat.toFixed(5)}&lng=${base.lng.toFixed(5)}`;
    const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
    if(!response.ok)throw Error('Mapped road service unavailable');
    const payload=await response.json();
    const output=(payload.roads||[]).filter(e=>Array.isArray(e.coords))
      .map(e=>({coords:e.coords,kind:'OSM'})).filter(e=>e.coords.length>=2&&countRoadLength(e.coords)>55);
    if(output.length<4)throw Error('Not enough streets mapped here');
    return output;
  }
  function roadBadges(){
    const jams=cars.filter(c=>c.status==='STUCK / JAM').length;
    const reds=cars.filter(c=>c.status==='RED LIGHT').length;
    text('jamStatus',`TRAFFIC / ${jams} JAMMED · ${reds} RED LIGHT${jams||reds?' · SIMULATED':''}`);
    text('carCount',prefs.cars?String(cars.length).padStart(3,'0'):'OFF');
    text('airCount',prefs.air?String(planes.length).padStart(2,'0'):'OFF');
    text('roadHud',`ROAD ${prefs.cars?String(cars.length).padStart(3,'0'):'OFF'} / FICTIONAL`);
    text('airHud',`AIR ${prefs.air?String(planes.length).padStart(2,'0'):'OFF'} / FICTIONAL`);
  }
  function drawRouteNetwork(routes){
    carRoutes.clearLayers();signals.clearLayers();
    if(!prefs.cars)return;
    if(roadSource==='demo'){
      routes.forEach(route=>L.polyline(route.coords,{color:'#a3e0ff',weight:2,opacity:.34,dashArray:'7 8',interactive:false}).addTo(carRoutes));
    }
    const used=[];
    for(const route of routes.slice(0,4)){
      const r=normaliseRoute(route.coords);if(!r)continue;
      const loc=positionOn(r,r.total*.5);
      if(used.some(p=>distance(p,[loc.lat,loc.lng])<90))continue;
      used.push([loc.lat,loc.lng]);
      L.circleMarker([loc.lat,loc.lng],{radius:4,weight:1,color:'#08171b',fillColor:'#ff654f',fillOpacity:.85,interactive:false}).addTo(signals);
    }
  }
  function drawCars(routes){
    carMarkers.clearLayers();cars=[];
    if(!prefs.cars)return;
    const candidates=routes.map(r=>normaliseRoute(r.coords)).filter(Boolean);
    if(!candidates.length)return;
    // Leaflet Canvas dots are far less demanding on a phone than 200 HTML icons.
    const desired=prefs.density;
    const colors=['#ffdb83','#a6edfc','#cbe9e3','#e9c0a7'];
    for(let i=0;i<desired;i++){
      const route=candidates[(i*41+Math.floor(i/17)*13)%candidates.length];
      const phase=((i*3719+97)%997)/997;
      const plate=`SIM-${String(2100+(i*137)%7600).padStart(4,'0')}`;
      const loc=positionOn(route,route.total*phase);
      const marker=L.circleMarker([loc.lat,loc.lng],{
        renderer:dotRenderer,radius:2.7,stroke:false,fillColor:colors[i%colors.length],
        fillOpacity:.95,bubblingMouseEvents:false
      }).addTo(carMarkers);
      const c={route,meters:route.total*phase,dir:i%2===0?1:-1,
        speed:3.5+(i%9)*.85,plate,status:i===0?'RED LIGHT':i===1?'STUCK / JAM':'MOVING',
        until:performance.now()+(i===0?4700:i===1?7600:0),marker,lastStop:0};
      marker.bindPopup(()=>`SIMULATED ROAD CAR<br>${c.plate} (FICTIONAL)<br>${c.status}<br>SIM SPEED ${Math.round(c.speed*3.6)} km/h`);
      cars.push(c);
    }
    roadBadges();
  }
  function trafficCenter(){
    const view=map.getCenter();
    // Cars follow visible road data when zoomed into a street-scale view.
    return map.getZoom()>=11?{lat:view.lat,lng:view.lng}:activeBase();
  }
  async function reloadTraffic(useDemo=false){
    roadEpoch++;const epoch=roadEpoch;
    if(roadAbort)roadAbort.abort();
    clearCarLayers();
    if(!prefs.cars){text('roadStatus','ROAD DOTS: OFF');roadBadges();return}
    const center=trafficCenter();lastRoadCenter=center;
    if(useDemo){
      roadSource='demo';roads=demoRoads(center);
      drawRouteNetwork(roads);drawCars(roads);
      text('roadStatus','DEMO STREETS / FICTIONAL GRID');
      return;
    }
    roadSource='loading';roads=[];
    text('roadStatus','LOADING MAPPED ROADS...');
    const controller=new AbortController();roadAbort=controller;
    const timeout=setTimeout(()=>controller.abort(),23000);
    try{
      const osmRoads=await getRoadsFromOSM(center,controller);
      if(epoch===roadEpoch){
        roadSource='osm';roads=osmRoads;
        drawRouteNetwork(roads);drawCars(roads);
        text('roadStatus',`ON MAPPED STREETS / ${cars.length} SIM DOTS`);
      }
    }catch(error){
      if(epoch===roadEpoch){
        roadSource='unavailable';
        text('roadStatus','MAPPED ROADS UNAVAILABLE: RETRY OR DEMO');
      }
    }finally{clearTimeout(timeout)}
  }
  function scheduleRoadReload(){
    if(!prefs.cars || map.getZoom()<11)return;
    const pos=trafficCenter();
    if(lastRoadCenter && distance([pos.lat,pos.lng],[lastRoadCenter.lat,lastRoadCenter.lng])<1050)return;
    clearTimeout(roadReloadTimer);
    roadReloadTimer=setTimeout(()=>reloadTraffic(),850);
  }
  function spawnPlanes(){
    clearPlanes();if(!prefs.air)return;
    const b=activeBase();
    for(let i=0;i<6;i++){
      const marker=L.marker([b.lat,b.lng],{icon:L.divIcon({className:'sim-plane-wrap',html:'<span class="sim-plane">➤</span>',iconSize:[26,26],iconAnchor:[13,13]}),zIndexOffset:300}).addTo(airMarkers);
      const plane={marker,index:i,phase:i*Math.PI/3,radiusLat:.005+(i%3)*.003,radiusLng:.008+(i%2)*.007,speed:.06+i*.008,altitude:4800+i*1650,code:`SIM-AIR-${String(i+1).padStart(2,'0')}`};
      marker.bindPopup(()=>`${plane.code}<br>FICTIONAL AIR TRAFFIC<br>SIM ALTITUDE ${plane.altitude} m`);
      planes.push(plane);
    }
    roadBadges();
  }
  function renderPlanes(now){
    if(!prefs.air)return;
    const b=activeBase();
    for(const p of planes){const t=p.phase+now/1000*p.speed;
      const lat=b.lat+Math.sin(t)*p.radiusLat, lng=b.lng+Math.cos(t)*p.radiusLng;
      p.marker.setLatLng([lat,lng]);
      const heading=(Math.atan2(Math.cos(t)*p.radiusLat,-Math.sin(t)*p.radiusLng)*180/Math.PI)+90;
      const icon=p.marker.getElement()?.querySelector('.sim-plane');if(icon)icon.style.transform=`rotate(${heading}deg)`;
    }
  }
  function carTick(time,dt){
    if(!prefs.cars)return;
    const red=Math.floor(Date.now()/6500)%2===0;
    const elements=signals.getLayers();elements.forEach((l,i)=>l.setStyle({fillColor:red?'#ff6b5f':'#5ce8a5'}));
    for(const c of cars){
      if(c.status!=='MOVING'){
        if(time<c.until)continue;
        c.status='MOVING';c.lastStop=time;
      }
      if(Math.random()<.0009 && time-c.lastStop>1300){c.status='STUCK / JAM';c.until=time+3000+Math.random()*7000;continue}
      const old=c.meters,step=dt*c.speed*c.dir;
      c.meters+=step;
      if(c.meters<0){c.meters=-c.meters;c.dir=1}
      else if(c.meters>c.route.total){c.meters=2*c.route.total-c.meters;c.dir=-1}
      const checkpoint=c.route.total*.5;
      if(red&&time-c.lastStop>6000&&((old<checkpoint&&c.meters>=checkpoint)||(old>checkpoint&&c.meters<=checkpoint))){
        c.status='RED LIGHT';c.until=time+2200+Math.random()*2900;continue;
      }
      const loc=positionOn(c.route,c.meters);
      c.marker.setLatLng([loc.lat,loc.lng]);
      // A tiny circle has no directional arrow; it remains a dot on the road.
    }
    if(Math.floor(time/1500)!==Math.floor((time-dt*1000)/1500))roadBadges();
  }
  function ticker(time){
    if(time-lastTime<180){requestAnimationFrame(ticker);return}
    const dt=clamp((time-lastTime)/1000,0,.8);lastTime=time;
    if(!document.hidden){renderPlanes(time);carTick(time,dt)}
    requestAnimationFrame(ticker);
  }
  function receiveBase(data){
    if(!data||!['RED','BLUE'].includes(data.team))return;
    if(!Number.isFinite(+data.lat)||!Number.isFinite(+data.lng))return;
    const updated={lat:Number((+data.lat).toFixed(5)),lng:Number((+data.lng).toFixed(5))};
    const previous=bases[data.team];
    if(previous && Math.abs(previous.lat-updated.lat)<.00001 && Math.abs(previous.lng-updated.lng)<.00001)return;
    bases[data.team]=updated;renderBases();
    if(data.team===activeTeam()){
      spawnPlanes();reloadTraffic();
      text('baseCoords',`${data.team} BASE / USA · ${coord(bases[data.team])}`);
    }
  }
  function setBases(data){
    if(data&&typeof data==='object')for(const team of ['BLUE','RED'])if(data[team])bases[team]={lat:+data[team].lat,lng:+data[team].lng};
    renderBases();const base=activeBase();
    map.setView([base.lat,base.lng],13);
    spawnPlanes();reloadTraffic();
  }
  function handleMapClick(event){
    if(!placeBase)return false;
    placeBase=false;
    el('basePlaceBtn').classList.remove('active');
    text('basePlaceBtn','MOVE BASE');
    el('mapToast').hidden=true;
    if(!me){text('roadStatus','JOIN THE GAME BEFORE MOVING BASE');return true}
    const {lat,lng}=event.latlng;
    act('base:move',{lat,lng}).then(()=>{
      receiveBase({team:me.team,lat,lng});text('roadStatus','BASE RELOCATED TO U.S. MAP POINT');
    }).catch(error=>{text('roadStatus',`BASE MOVE: ${error.message}`);log(error.message)});
    return true;
  }
  function init(){
    getMapLayers();setMapStyle(prefs.mapStyle);
    renderBases();
    for(const ch of ['red','green','blue'])el(`${ch}Channel`).value=prefs[ch];
    setRgb();setVision(prefs.vision);
    document.querySelectorAll('.map-style').forEach(btn=>btn.addEventListener('click',()=>setMapStyle(btn.dataset.mapstyle)));
    document.querySelectorAll('.vision-mode').forEach(btn=>btn.addEventListener('click',()=>setVision(btn.dataset.vision)));
    for(const ch of ['red','green','blue'])el(`${ch}Channel`).addEventListener('input',setRgb);
    el('quickBaseHome').addEventListener('click',()=>el('baseHomeBtn').click());
    el('quickBaseMove').addEventListener('click',()=>el('basePlaceBtn').click());
    el('baseHomeBtn').addEventListener('click',()=>{const b=activeBase();map.flyTo([b.lat,b.lng],14);text('baseCoords',`${activeTeam()} BASE / USA · ${coord(b)}`)});
    el('basePlaceBtn').addEventListener('click',()=>{
      if(!me){text('roadStatus','JOIN FIRST TO MOVE YOUR BASE');return}
      placeBase=!placeBase;
      if(placeBase){disarm();el('basePlaceBtn').classList.add('active');text('basePlaceBtn','TAP U.S. LOCATION');el('mapToast').hidden=false;text('mapToast','MOVE FICTIONAL BASE: TAP U.S. MAP')}
      else{el('basePlaceBtn').classList.remove('active');text('basePlaceBtn','MOVE BASE');el('mapToast').hidden=true}
    });
    el('airToggle').checked=prefs.air;
    el('carsToggle').checked=prefs.cars;
    el('trafficDensity').value=prefs.density;
    text('densityValue',String(prefs.density).padStart(3,'0'));
    el('airToggle').addEventListener('change',()=>{prefs.air=el('airToggle').checked;save();spawnPlanes()});
    el('carsToggle').addEventListener('change',()=>{prefs.cars=el('carsToggle').checked;save();reloadTraffic()});
    el('trafficDensity').addEventListener('input',()=>{prefs.density=clampInt(el('trafficDensity').value,20,200,100);text('densityValue',String(prefs.density).padStart(3,'0'));save();if(roads.length)drawCars(roads)});
    el('retryRoadsBtn').addEventListener('click',()=>reloadTraffic());
    el('demoRoadsBtn').addEventListener('click',()=>reloadTraffic(true));
    map.on('moveend',scheduleRoadReload);
    spawnPlanes();reloadTraffic();
    requestAnimationFrame(ticker);
  }
  function getBase(team){const b=bases[team]||bases[activeTeam()];return b?{lat:b.lat,lng:b.lng}:null;}
  window.warfrontOverlay={setBases,receiveBase,handleMapClick,getBase};
  init();
})();
