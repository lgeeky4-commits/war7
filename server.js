'use strict';
/* WARFRONT FIVE: fictional map-based strategy game, not a real weapon system. */
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const PORT=Number(process.env.PORT||3000);
const PUBLIC=path.join(__dirname,'public');
const players=new Map(),history=[],clients=new Set(),lastAction=new Map();
// Fictional team bases in a generic U.S. city; not military locations.
const bases={BLUE:{lat:39.102,lng:-94.571},RED:{lat:39.086,lng:-94.607}};
const lastBaseChange=new Map();
const insideUSA=(lat,lng)=>((lat>=24&&lat<=50&&lng>=-125&&lng<=-66)||(lat>=51&&lat<=72&&lng>=-170&&lng<=-130)||(lat>=18&&lat<=23&&lng>=-161&&lng<=-154));
const ASSETS={
 MISSILES:['m1','m2','m3','m4','m5','m6','m7'],
 ATV:['a1','a2','a3','a4','a5'],UAV:['u1','u2','u3'],JETS:['j1','j2','j3'],TANKS:['t1','t2','t3'],OTHER:['v1','v2','v3','v4','v5']
};
const CATEGORY=Object.fromEntries(Object.entries(ASSETS).flatMap(([kind,ids])=>ids.map(id=>[id,kind])));
const roadCache=new Map(),roadInflight=new Map();
const roadProviders=[
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];
const mapDist=(a,b)=>{
  const mean=(a[0]+b[0])*Math.PI/360;
  return Math.hypot((a[0]-b[0])*111195,(a[1]-b[1])*111195*Math.cos(mean));
};
function processRoadData(payload){
  const roads=(payload.elements||[]).filter(el=>el.type==='way'&&Array.isArray(el.geometry))
    .map(el=>({coords:el.geometry.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>[Number(p.lat.toFixed(6)),Number(p.lon.toFixed(6))])}))
    .filter(road=>road.coords.length>=2)
    .map(road=>({coords:road.coords,meters:road.coords.reduce((sum,p,i)=>i?sum+mapDist(road.coords[i-1],p):sum,0)}))
    .filter(road=>road.meters>=60)
    .sort((a,b)=>b.meters-a.meters)
    .slice(0,120)
    .map(({coords})=>({coords}));
  if(roads.length<4)throw Error('No usable street geometry in this area');
  return roads;
}
async function queryRoads(lat,lng){
  const latSpan=.009,lngSpan=.016;
  const bbox=[lat-latSpan,lng-lngSpan,lat+latSpan,lng+lngSpan].map(n=>n.toFixed(5)).join(',');
  const query=`[out:json][timeout:9];way["highway"~"^(residential|tertiary|secondary|primary|unclassified|living_street|service)$"](${bbox});out geom;`;
  let lastError;
  for(const endpoint of roadProviders){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const result=await fetch(endpoint,{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:'data='+encodeURIComponent(query),signal:controller.signal
      });
      if(!result.ok)throw Error(`Provider returned ${result.status}`);
      return processRoadData(await result.json());
    }catch(e){lastError=e}finally{clearTimeout(timer)}
  }
  throw lastError||Error('Road service unavailable');
}
async function cachedRoads(lat,lng){
  const key=`${(Math.round(lat*200)/200).toFixed(3)},${(Math.round(lng*200)/200).toFixed(3)}`;
  const now=Date.now(),entry=roadCache.get(key);
  if(entry&&now-entry.time<15*60*1000)return entry.roads;
  if(roadInflight.has(key))return roadInflight.get(key);
  const pending=queryRoads(lat,lng).then(roads=>{
    roadCache.set(key,{roads,time:Date.now()});
    if(roadCache.size>30)roadCache.delete(roadCache.keys().next().value);
    return roads;
  }).finally(()=>roadInflight.delete(key));
  roadInflight.set(key,pending);return pending;
}

const uid=()=>crypto.randomBytes(14).toString('hex');
const roster=()=>[...players.values()].map(({id,name,team})=>({id,name,team}));
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function publish(kind,data,recipient,team){const payload=`data: ${JSON.stringify({kind,data})}\n\n`;for(const c of clients){if(recipient&&c.id!==recipient)continue;if(team&&players.get(c.id)?.team!==team)continue;try{c.res.write(payload)}catch{}}}
function removePlayer(id){if(!players.has(id))return;players.delete(id);lastAction.delete(id);lastBaseChange.delete(id);publish('roster',roster());}
function serveFile(res,pathname){
 const file=pathname==='/'?'index.html':pathname.slice(1);
 if(!['index.html','app.js','map-ops.js','style.css'].includes(file)&&!/^assets\/[a-z0-9-]+\.(webp|png|jpg|jpeg)$/i.test(file))return json(res,{error:'Not found'},404);
 const location=path.join(PUBLIC,file);const ext=path.extname(file);
 const ct={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
 fs.readFile(location,(err,bytes)=>{if(err)return json(res,{error:'File not found'},404);res.writeHead(200,{'Content-Type':ct[ext]||'application/octet-stream','Cache-Control':file.startsWith('assets/')?'public, max-age=7200':'no-cache','X-Content-Type-Options':'nosniff'});res.end(bytes)});
}
async function parseJson(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>32_000)throw Error('Request too large')}try{return JSON.parse(data)}catch{throw Error('Invalid JSON')}}
const server=http.createServer(async(req,res)=>{
 let url;try{url=new URL(req.url,'http://localhost')}catch{return json(res,{error:'Invalid URL'},400)}
 if(req.method==='GET'&&url.pathname==='/health')return json(res,{ok:true,app:'WARFRONT FIVE',players:players.size,max:5});
 if(req.method==='GET'&&url.pathname==='/api/roads'){
   const lat=Number(url.searchParams.get('lat')),lng=Number(url.searchParams.get('lng'));
   if(!Number.isFinite(lat)||!Number.isFinite(lng)||!insideUSA(lat,lng))return json(res,{error:'Choose a U.S. map area'},400);
   try{return json(res,{ok:true,source:'OpenStreetMap road geometry',roads:await cachedRoads(lat,lng)})}
   catch{return json(res,{error:'Street geometry temporarily unavailable. Retry or use demo roads.'},503)}
 }

 if(req.method==='GET'&&url.pathname==='/events'){
   const id=url.searchParams.get('id');if(!players.has(id))return json(res,{error:'Join first'},403);
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
   res.write(': game connection\n\n');const c={id,res};clients.add(c);const timer=setInterval(()=>{try{res.write(': tick\n\n')}catch{}},20000);
   res.on('close',()=>{clearInterval(timer);clients.delete(c);if(![...clients].some(x=>x.id===id))removePlayer(id)});return;
 }
 if(req.method==='POST'){
  let d;try{d=await parseJson(req)}catch(err){return json(res,{error:err.message},400)}
  if(!d||typeof d!=='object'||Array.isArray(d))return json(res,{error:'Invalid request'},400);
  if(url.pathname==='/join'){
    if(players.size>=5)return json(res,{error:'Game full: 5 players maximum'},409);
    const name=String(d.name||'').trim().slice(0,22);const team=d.team;
    if(name.length<2||!['BLUE','RED'].includes(team))return json(res,{error:'Enter a name (2+ characters) and choose a team'},400);
    if([...players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return json(res,{error:'That callsign is taken'},409);
    const p={id:uid(),name,team};players.set(p.id,p);publish('roster',roster());return json(res,{id:p.id,roster:roster(),events:history.filter(e=>e.kind!=='chat'||e.team===team),bases});
  }
  if(url.pathname!=='/event')return json(res,{error:'Not found'},404);
  const p=players.get(d.id);if(!p)return json(res,{error:'Session expired; join again'},403);
  if(d.kind==='chat'){
    const text=String(d.text||'').trim().slice(0,350);if(!text)return json(res,{error:'Empty message'},400);
    const ev={id:uid(),kind:'chat',team:p.team,name:p.name,text,time:Date.now()};history.push(ev);if(history.length>70)history.shift();publish('event',ev,null,p.team);return json(res,{ok:true});
  }
  if(d.kind==='base:move'){
    const lat=Number(d.lat),lng=Number(d.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||!insideUSA(lat,lng))return json(res,{error:'Choose a U.S. position for this fictional base'},400);
    if(Date.now()-(lastBaseChange.get(p.id)||0)<1200)return json(res,{error:'Choose a new location after a moment'},429);
    lastBaseChange.set(p.id,Date.now());bases[p.team]={lat:Number(lat.toFixed(5)),lng:Number(lng.toFixed(5))};
    publish('base',{team:p.team,lat:bases[p.team].lat,lng:bases[p.team].lng});return json(res,{ok:true,base:bases[p.team]});
  }
  if(d.kind==='strike'||d.kind==='deploy'){
    const {lat,lng}=d,assetId=String(d.assetId||'');const cat=CATEGORY[assetId];
    if(!cat||(d.kind==='strike')!==(cat==='MISSILES'))return json(res,{error:'Choose an item from its category'},400);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat< -85||lat>85||lng< -180||lng>180)return json(res,{error:'Invalid map location'},400);
    const prev=lastAction.get(p.id)||0;if(Date.now()-prev<1500)return json(res,{error:'Effect cooldown: try again shortly'},429);
    lastAction.set(p.id,Date.now());const ev={id:uid(),kind:d.kind,assetId,team:p.team,name:p.name,lat,lng,time:Date.now()};
    history.push(ev);if(history.length>70)history.shift();publish('event',ev);return json(res,{ok:true});
  }
  if(d.kind==='signal'){
    const to=String(d.to||'');if(to===p.id||!players.has(to))return json(res,{error:'Player not connected'},400);
    if(!['offer','answer','ice','renegotiate','end'].includes(d.type))return json(res,{error:'Invalid signal'},400);
    const message=JSON.stringify(d.signal||{});if(message.length>18000)return json(res,{error:'Signal too large'},413);
    publish('signal',{from:p.id,to,signal:d.signal||{},type:d.type},to);return json(res,{ok:true});
  }
  return json(res,{error:'Unknown game action'},400);
 }
 if(req.method==='GET')return serveFile(res,decodeURIComponent(url.pathname));
 return json(res,{error:'Method not allowed'},405);
});
server.listen(PORT,'0.0.0.0',()=>console.log(`WARFRONT FIVE listening on ${PORT}`));
