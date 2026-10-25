'use strict';
/* WARFRONT FIVE is a fictional browser strategy game, not a weapon system. */
const $=id=>document.getElementById(id);
const $all=selector=>Array.from(document.querySelectorAll(selector));
const catalog={
  MISSILES:[
    {id:'m1',name:'R-17 Elbrus',subtitle:'ARCHIVE MODEL / VIRTUAL',image:'/assets/missile-01.webp'},
    {id:'m2',name:'9K79 Tochka-U',subtitle:'ARCHIVE MODEL / VIRTUAL',image:'/assets/missile-02.webp'},
    {id:'m3',name:'9K52 Luna-M',subtitle:'ARCHIVE MODEL / VIRTUAL',image:'/assets/missile-03.webp'},
    {id:'m4',name:'S-75 Dvina',subtitle:'ARCHIVE MODEL / VIRTUAL',image:'/assets/missile-04.webp'},
    {id:'m5',name:'P-15 Termit',subtitle:'ARCHIVE MODEL / VIRTUAL',image:'/assets/missile-05.webp'},
    {id:'m6',name:'Kh-22',subtitle:'ARCHIVE MODEL / VIRTUAL',image:'/assets/missile-06.webp'},
    {id:'m7',name:'R-11 Zemlya',subtitle:'ARCHIVE MODEL / VIRTUAL',image:'/assets/missile-07.webp'}
  ],
  ATV:[
    {id:'a1',name:'Recon Quad',subtitle:'ATV PHOTO 01 / GAME UNIT',image:'/assets/atv-01.webp'},
    {id:'a2',name:'Patrol Quad',subtitle:'ATV PHOTO 02 / GAME UNIT',image:'/assets/atv-02.webp'},
    {id:'a3',name:'Field Jeep',subtitle:'UTILITY VEHICLE PHOTO 03 / GAME UNIT',image:'/assets/atv-03.webp'},
    {id:'a4',name:'Utility 4x4',subtitle:'UTILITY VEHICLE PHOTO 04 / GAME UNIT',image:'/assets/atv-04.webp'},
    {id:'a5',name:'Armored Scout',subtitle:'UTILITY VEHICLE PHOTO 05 / GAME UNIT',image:'/assets/atv-05.webp'}
  ],
  UAV:[
    {id:'u1',name:'Sky Surveyor',subtitle:'UAV REFERENCE / PLAYER PHOTO',image:'/assets/uav-01.jpg'},
    {id:'u2',name:'Night Glider',subtitle:'UAV REFERENCE / PLAYER PHOTO',image:'/assets/uav-02.jpg'},
    {id:'u3',name:'Signal Kite',subtitle:'UAV REFERENCE / PLAYER PHOTO',image:'/assets/uav-03.jpg'}
  ],
  JETS:[
    {id:'j1',name:'Falcon Strike',subtitle:'JET REFERENCE / PLAYER PHOTO',image:'/assets/jet-01.jpg'},
    {id:'j2',name:'Storm Talon',subtitle:'JET REFERENCE / PLAYER PHOTO',image:'/assets/jet-02.jpg'},
    {id:'j3',name:'Gray Viper',subtitle:'JET REFERENCE / PLAYER PHOTO',image:'/assets/jet-03.jpg'}
  ],
  TANKS:[
    {id:'t1',name:'Iron Defender',subtitle:'TANK REFERENCE / PLAYER PHOTO',image:'/assets/tank-01.jpg'},
    {id:'t2',name:'Sentinel Mk II',subtitle:'TANK REFERENCE / PLAYER PHOTO',image:'/assets/tank-02.jpg'},
    {id:'t3',name:'Citadel',subtitle:'TANK REFERENCE / PLAYER PHOTO',image:'/assets/tank-03.jpg'}
  ],
  OTHER:[
    {id:'v1',name:'Support Truck',subtitle:'LOGISTICS / PLAYER PHOTO',image:'/assets/support-truck.webp'},
    {id:'v2',name:'Field Rover',subtitle:'GROUND TRANSPORT / PLAYER PHOTO',image:'/assets/atv-01.webp'},
    {id:'v3',name:'Cargo Utility',subtitle:'SUPPLY VEHICLE / PLAYER PHOTO',image:'/assets/atv-02.webp'},
    {id:'v4',name:'Signal Relay Truck',subtitle:'COMMUNICATIONS / PLAYER PHOTO',image:'/assets/signal-truck.webp'},
    {id:'v5',name:'Field Truck',subtitle:'FIELD SUPPORT / PLAYER PHOTO',image:'/assets/field-truck.jpg'}
  ]
};
const allItems=Object.values(catalog).flat();
const byId=Object.fromEntries(allItems.map(v=>[v.id,v]));
const byCategory=Object.fromEntries(Object.entries(catalog).flatMap(([category,items])=>items.map(item=>[item.id,category])));
let me=null,roster=[],source=null,map=null,pc=null,stream=null,activePeer=null,pending=null;
let armed=false,category='MISSILES',selectedId='m1',lastPlace=0;
let remotePendingIce=[],pendingIce=[],sessionEpoch=0;
const filterDefaults={grit:8,gritSize:3,hue:0,saturation:100,brightness:100,glitch:0};
let filterScope='global';
const filterProfiles={global:{...filterDefaults},camera:{...filterDefaults,grit:0,glitch:0}};
const filterFields=Object.keys(filterDefaults);
const uiDefaults={theme:'steel',layout:'standard'};
let uiState={...uiDefaults};
const log=(text,css='')=>{const el=document.createElement('div');el.className=`msg ${css}`;el.textContent=text;$('chat').append(el);$('chat').scrollTop=$('chat').scrollHeight;};
const post=async(path,data)=>{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const value=await response.json();if(!response.ok||value.error)throw Error(value.error||'Server error');return value;};
const act=(kind,data={})=>post('/event',{id:me.id,kind,...data});
const setStatus=text=>{$('status').innerHTML='';const i=document.createElement('i');$('status').append(i,document.createTextNode(text));$('status').classList.toggle('online',!!me&&text.startsWith('ONLINE'));};
function clock(){const d=new Date();$('clock').textContent=d.toLocaleTimeString([],{hour12:false});}
function initMap(){
  if(typeof L==='undefined'){$('map').textContent='Map library unavailable. Check your internet connection.';return;}
  map=L.map('map',{zoomControl:true,worldCopyJump:true}).setView([39.10,-94.57],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(map);
  map.on('mousemove',e=>$('coords').textContent=`LAT ${e.latlng.lat.toFixed(3)} / LON ${e.latlng.lng.toFixed(3)}`);
  map.on('click',async e=>{
    if(window.warfrontOverlay?.handleMapClick(e))return;
    if(!armed||!me)return;
    if(Date.now()-lastPlace<1600){log('Game effect cooling down.');return;}
    lastPlace=Date.now();const {lat,lng}=e.latlng,kind=category==='MISSILES'?'strike':'deploy';
    disarm();try{await act(kind,{lat,lng,assetId:selectedId})}catch(error){log(`Action failed: ${error.message}`)}
  });
}
function teamTone(team){return team==='RED'?'#ff746e':'#76d7ff';}
function showMissileBanner(item,e){
  const frame=document.querySelector('.map-frame'); if(!frame)return;
  const old=frame.querySelector('.missile-banner'); if(old)old.remove();
  const el=document.createElement('div'); el.className='missile-banner';
  el.innerHTML=`MISSILE VISUAL / ${item.name}<small>${e.team} TEAM • ${e.name} • MAP EFFECT ONLY</small>`;
  frame.append(el); setTimeout(()=>el.remove(),2600);
}
function flashMapFrame(){const frame=document.querySelector('.map-frame'); if(!frame)return; frame.classList.remove('missile-flash'); void frame.offsetWidth; frame.classList.add('missile-flash'); setTimeout(()=>frame.classList.remove('missile-flash'),650);}
function animateEvent(e){
  const item=byId[e.assetId]||{name:'Game item'};
  const isStrike=e.kind==='strike';
  if(map){
    const css=isStrike?'strike-mark':'deploy-mark';
    const marker=L.marker([e.lat,e.lng],{icon:L.divIcon({className:'',html:isStrike?'<div class="missile-impact"></div>':`<div class="${css}"></div>`,iconSize:isStrike?[62,62]:[18,18],iconAnchor:isStrike?[31,31]:[9,9]})}).addTo(map);
    const popup=document.createElement('div');popup.textContent=`${isStrike?'SIMULATED EFFECT':'SIMULATED DEPLOYMENT'} / ${item.name} / ${e.team} TEAM`;
    marker.bindPopup(popup);setTimeout(()=>{if(map?.hasLayer(marker))map.removeLayer(marker)},isStrike?14000:30000);
    if(isStrike){
      const base=window.warfrontOverlay?.getBase?.(e.team);
      const trailLayers=[];
      if(base){
        const trail=L.polyline([[base.lat,base.lng],[e.lat,e.lng]],{color:teamTone(e.team),weight:2,opacity:.95,dashArray:'12 8',interactive:false,className:'missile-path'}).addTo(map);
        const origin=L.marker([base.lat,base.lng],{icon:L.divIcon({className:'',html:'<div class="missile-origin"></div>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map);
        trailLayers.push(trail,origin);
      }
      flashMapFrame();
      showMissileBanner(item,e);
      if(me&&e.team===me.team){
        const z=Math.max(map.getZoom(),11);
        map.flyTo([e.lat,e.lng],z,{duration:.85});
      }
      setTimeout(()=>trailLayers.forEach(layer=>{if(map?.hasLayer(layer))map.removeLayer(layer)}),5200);
    }
  }
  if(me&&e.team===me.team)log(`${isStrike?'VIRTUAL MISSILE EFFECT':'GAME UNIT DEPLOYED'} • ${e.name} • ${item.name}`,me.team==='RED'?'red':'');
}
function displayEvent(e){
  if(!me)return;
  if(e.kind==='chat'&&e.team===me.team){const d=document.createElement('div');d.className=`msg ${e.team==='RED'?'red':''}`;const b=document.createElement('b');b.textContent=e.name+': ';d.append(b,document.createTextNode(e.text));$('chat').append(d);$('chat').scrollTop=$('chat').scrollHeight;}
  if(e.kind==='strike'||e.kind==='deploy')animateEvent(e);
}
function renderRoster(){
  $('count').textContent=`${roster.length} / 5`;const bs=roster.filter(x=>x.team==='BLUE').length,rs=roster.filter(x=>x.team==='RED').length;
  $('blueCount').textContent=bs;$('redCount').textContent=rs;$('players').replaceChildren();
  const target=$('target'),previous=target.value;target.replaceChildren(new Option('Select connected player',''));
  roster.forEach(p=>{
    const row=document.createElement('div');row.className=`player ${p.team==='RED'?'red':''}`;
    const indicator=document.createElement('span');indicator.className='player-dot';
    const name=document.createElement('span');name.className='player-name';name.textContent=p.name;
    const team=document.createElement('small');team.textContent=`${p.team}${p.id===me.id?' / YOU':''}`;
    row.append(indicator,name,team);$('players').append(row);
    if(p.id!==me.id)target.add(new Option(`${p.name} / ${p.team}`,p.id));
  });
  if([...target.options].some(x=>x.value===previous))target.value=previous;
  if(activePeer&&!roster.some(p=>p.id===activePeer))closeCall();
}
function arm(){if(!me){log('Join the multiplayer game first.');return}if(!map){log('Wait for the map to load.');return}armed=true;$('strikeBtn').classList.add('armed');$('strikeBtn').textContent='TAP A MAP LOCATION';$('mapToast').hidden=false;$('mapToast').textContent=`READY / ${byId[selectedId].name}`;$('modeHelp').textContent=`Tap anywhere on the map to play a fictional ${category==='MISSILES'?'missile effect':'unit deployment'}; this has no real-world action.`;}
function disarm(){armed=false;$('strikeBtn').classList.remove('armed');$('strikeBtn').textContent='PLACE SELECTED GAME ITEM';$('mapToast').hidden=true;$('modeHelp').textContent='Choose an item on the right, then use PLACE to activate map placement.';}
function renderSelection(){
  const item=byId[selectedId];$('activeSelection').replaceChildren();
  const t=document.createElement('div');t.className='selection-type';t.textContent=`${category} / SIMULATION`;
  const name=document.createElement('strong');name.textContent=item.name;
  const desc=document.createElement('small');desc.textContent=category==='MISSILES'?'VIRTUAL MISSILE VISUAL • NO REAL CAPABILITIES':'VIRTUAL GAME UNIT • MAP MARKER ONLY';
  $('activeSelection').append(t,name,desc);$('selectedLabel').textContent=`${item.name.toUpperCase()} / SIMULATION`;
}
function vehicleSvg(group){
  const common='viewBox="0 0 200 100" role="img" aria-label="Stylized fictional unit"';
  let inside='';
  if(group==='ATV')inside='<circle cx="59" cy="76" r="15"/><circle cx="145" cy="76" r="15"/><path d="M39 65 L61 41 L105 37 L137 56 L164 68 L155 70 L49 70 Z"/><path d="M90 34 L105 17 L130 17 L144 34" fill="none" stroke-width="4"/>';
  if(group==='UAV')inside='<path d="M15 57 L86 45 L99 19 L110 45 L185 57 L111 69 L106 85 L96 85 L89 68 Z"/>';
  if(group==='TANKS')inside='<path d="M30 64 L60 43 L143 43 L165 65 Z"/><rect x="72" y="24" width="65" height="25"/><path d="M116 27 L191 19" stroke-width="7"/><rect x="24" y="66" width="148" height="18" rx="9"/><circle cx="52" cy="75" r="9"/><circle cx="93" cy="75" r="9"/><circle cx="136" cy="75" r="9"/>';
  if(group==='OTHER')inside='<path d="M19 32 H119 V68 H19 Z"/><path d="M120 44 H156 L178 63 V69 H120 Z"/><circle cx="55" cy="75" r="15"/><circle cx="148" cy="75" r="15"/><path d="M140 48 H152 L166 62 H140 Z"/>';
  return `<svg ${common}>${inside}</svg>`;
}
function renderCatalog(){
  $('catalogTitle').textContent=category==='OTHER'?'OTHER VEHICLES':category;
  $('catalogCount').textContent=String(catalog[category].length).padStart(2,'0');
  $all('.category-tab').forEach(button=>button.classList.toggle('active',button.dataset.category===category));
  const grid=$('catalogGrid');grid.replaceChildren();
  for(const item of catalog[category]){
    const card=document.createElement('button');card.type='button';card.className=`unit-card ${selectedId===item.id?'selected':''}`;card.setAttribute('aria-pressed',selectedId===item.id?'true':'false');
    if(item.image){const image=document.createElement('img');image.src=item.image;image.alt=`Uploaded reference image for ${item.name} game card`;image.loading='lazy';card.append(image)}
    else{const art=document.createElement('div');art.className='unit-art';art.innerHTML=vehicleSvg(category);card.append(art)}
    const copy=document.createElement('div');copy.className='unit-card-copy';const name=document.createElement('strong');name.textContent=item.name;
    const sub=document.createElement('small');sub.textContent=item.subtitle;copy.append(name,sub);card.append(copy);
    card.addEventListener('click',()=>{selectedId=item.id;renderCatalog();renderSelection();disarm()});grid.append(card);
  }
}
function switchCategory(next){if(!catalog[next])return;category=next;selectedId=catalog[next][0].id;renderCatalog();renderSelection();disarm();}
function readFilters(){try{const saved=JSON.parse(localStorage.getItem('warfront-five-filters')||'{}');for(const key of ['global','camera'])for(const field of filterFields)if(Number.isFinite(Number(saved[key]?.[field])))filterProfiles[key][field]=Number(saved[key][field]);}catch{}}
function updateFilterOutput(field,value){const output=$(`${field}Value`);output.textContent=field==='hue'?`${value}°`:['brightness','saturation'].includes(field)?`${value}%`:field==='gritSize'?String(value).padStart(2,'0'):String(value)}
function loadFilterSliders(){const profile=filterProfiles[filterScope];for(const field of filterFields){$(field).value=profile[field];updateFilterOutput(field,profile[field]);}}
function applyFilters(){
  const g=filterProfiles.global,c=filterProfiles.camera,root=document.documentElement.style;
  root.setProperty('--brightness',g.brightness/100);root.setProperty('--saturation',g.saturation/100);root.setProperty('--hue',g.hue+'deg');
  root.setProperty('--grain-opacity',(g.grit/100*.26).toFixed(3));root.setProperty('--grain-tile',(24+g.gritSize*26)+'px');root.setProperty('--glitch-opacity',(g.glitch/100*.52).toFixed(3));
  root.setProperty('--cam-brightness',c.brightness/100);root.setProperty('--cam-saturation',c.saturation/100);root.setProperty('--cam-hue',c.hue+'deg');
  root.setProperty('--cam-grain-opacity',(c.grit/100*.45).toFixed(3));root.setProperty('--cam-grain-tile',(24+c.gritSize*26)+'px');root.setProperty('--cam-glitch-opacity',(c.glitch/100*.6).toFixed(3));
  try{localStorage.setItem('warfront-five-filters',JSON.stringify(filterProfiles))}catch{}
}
function readUiState(){
  try{const saved=JSON.parse(localStorage.getItem('warfront-five-ui')||'{}');
    if(typeof saved.theme==='string')uiState.theme=saved.theme;
    if(typeof saved.layout==='string')uiState.layout=saved.layout;
  }catch{}
}
function syncPresetButtons(group,value){$all(`[data-${group}]`).forEach(btn=>btn.classList.toggle('active',btn.dataset[group]===value));}
function applyUiState(){
  document.body.dataset.theme=uiState.theme;
  document.body.dataset.layout=uiState.layout;
  syncPresetButtons('theme',uiState.theme);
  syncPresetButtons('layout',uiState.layout);
  try{localStorage.setItem('warfront-five-ui',JSON.stringify(uiState))}catch{}
}
function initThemeBuilder(){
  readUiState();
  applyUiState();
  $all('#themeButtons [data-theme]').forEach(btn=>btn.addEventListener('click',()=>{uiState.theme=btn.dataset.theme;applyUiState()}));
  $all('#layoutButtons [data-layout]').forEach(btn=>btn.addEventListener('click',()=>{uiState.layout=btn.dataset.layout;applyUiState();setTimeout(()=>map?.invalidateSize(),180)}));
}
function initFilters(){readFilters();loadFilterSliders();applyFilters();$('filterScope').addEventListener('change',()=>{filterScope=$('filterScope').value;loadFilterSliders()});for(const f of filterFields){$(f).addEventListener('input',()=>{filterProfiles[filterScope][f]=Number($(f).value);updateFilterOutput(f,$(f).value);applyFilters()})}
 $('resetFilters').addEventListener('click',()=>{Object.assign(filterProfiles[filterScope],filterDefaults);loadFilterSliders();applyFilters()});
 $('filterShortcut').addEventListener('click',()=>{$('filtersPanel').scrollIntoView({behavior:'smooth',block:'center'})});
}
async function joinGame(){
 $('joinError').textContent='';$('joinBtn').disabled=true;
 try{
  const r=await post('/join',{name:$('name').value.trim(),team:$('team').value});
  me={id:r.id,name:$('name').value.trim(),team:$('team').value};roster=r.roster;$('join').hidden=true;setStatus(`ONLINE / ${me.team}`);$('chatTeam').textContent=me.team;
  renderRoster();r.events.forEach(displayEvent);window.warfrontOverlay?.setBases(r.bases||{});
  source=new EventSource(`/events?id=${encodeURIComponent(me.id)}`);
  source.onmessage=e=>{const d=JSON.parse(e.data);if(d.kind==='roster'){roster=d.data;renderRoster()}if(d.kind==='event')displayEvent(d.data);if(d.kind==='base')window.warfrontOverlay?.receiveBase(d.data);if(d.kind==='signal'&&d.data.to===me.id)onSignal(d.data)};
  source.onerror=()=>setStatus('RECONNECTING');source.onopen=()=>setStatus(`ONLINE / ${me.team}`);
  setTimeout(()=>map?.invalidateSize(),150);
 }catch(error){$('joinError').textContent=error.message}finally{$('joinBtn').disabled=false}
}
/* Permission-controlled, opt-in 1:1 WebRTC video and audio. */
const rtcConfig={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
function closeCall(notify=false){const recipient=activePeer;if(notify&&recipient&&me)act('signal',{to:recipient,type:'end',signal:{}}).catch(()=>{});sessionEpoch++;if(pc){pc.onicecandidate=null;pc.close();pc=null}if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}activePeer=null;pendingIce=[];$('remoteVideo').srcObject=null;$('localVideo').srcObject=null;$('videoLabel').textContent='OFFLINE';}
async function getMedia(video){if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera and microphone require HTTPS and permission');return navigator.mediaDevices.getUserMedia({audio:true,video:video?{facingMode:{ideal:'environment'}}:false});}
async function setupPeer(to,video){closeCall();const epoch=sessionEpoch;activePeer=to;stream=await getMedia(video);if(epoch!==sessionEpoch){stream.getTracks().forEach(t=>t.stop());return} $('localVideo').srcObject=stream;pc=new RTCPeerConnection(rtcConfig);
 for(const track of stream.getTracks())pc.addTrack(track,stream);
 pc.ontrack=e=>{$('remoteVideo').srcObject=e.streams[0]||new MediaStream([e.track]);$('remoteVideo').play().catch(()=>{});$('videoLabel').textContent='LIVE'};
 pc.onicecandidate=e=>{if(e.candidate&&activePeer===to)act('signal',{to,type:'ice',signal:{candidate:e.candidate.toJSON()}}).catch(()=>{})};
 pc.onconnectionstatechange=()=>{if(pc&&['failed','disconnected'].includes(pc.connectionState))$('videoLabel').textContent='SIGNAL LOST'};
 for(const candidate of pendingIce.splice(0)){try{if(pc.remoteDescription)await pc.addIceCandidate(candidate);else remotePendingIce.push(candidate)}catch{}}
}
async function callPlayer(video){const to=$('target').value;if(!to){log('Choose a person to call.');return}try{await setupPeer(to,video);const offer=await pc.createOffer();await pc.setLocalDescription(offer);await act('signal',{to,type:'offer',signal:{sdp:pc.localDescription,video}});$('videoLabel').textContent='RINGING'}catch(error){log(`Call unavailable: ${error.message}`);closeCall()}}
async function applyRemoteSdp(desc){if(!pc)return;await pc.setRemoteDescription(desc);for(const candidate of remotePendingIce.splice(0)){try{await pc.addIceCandidate(candidate)}catch{}}}
async function onSignal(data){
 if(data.type==='offer'){
  if(activePeer){await act('signal',{to:data.from,type:'end',signal:{}}).catch(()=>{});return}
  pending=data;$('caller').textContent=`${roster.find(x=>x.id===data.from)?.name||'Player'} requests a ${data.signal.video?'video':'voice'} call.`;$('incoming').hidden=false;return;
 }
 if(data.type==='end'){closeCall();$('incoming').hidden=true;pending=null;log('Call ended or declined.');return}
 if(data.type==='ice'&&data.signal?.candidate){const c=new RTCIceCandidate(data.signal.candidate);if(pc&&activePeer===data.from&&pc.remoteDescription)try{await pc.addIceCandidate(c)}catch{}else if(pending?.from===data.from)pendingIce.push(c);else if(activePeer===data.from)remotePendingIce.push(c);return}
 if(!pc||activePeer!==data.from)return;
 try{
  if(data.type==='answer'){await applyRemoteSdp(data.signal.sdp);$('videoLabel').textContent='CONNECTING'}
  if(data.type==='renegotiate'){await applyRemoteSdp(data.signal.sdp);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await act('signal',{to:data.from,type:'answer',signal:{sdp:pc.localDescription}})}
 }catch(error){log(`Connection issue: ${error.message}`)}
}
async function acceptCall(){const offer=pending;pending=null;$('incoming').hidden=true;if(!offer)return;const offeredCandidates=pendingIce.splice(0);try{await setupPeer(offer.from,offer.signal.video);remotePendingIce.push(...offeredCandidates);await applyRemoteSdp(offer.signal.sdp);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await act('signal',{to:offer.from,type:'answer',signal:{sdp:pc.localDescription}});$('videoLabel').textContent='CONNECTING'}catch(error){log(`Call unavailable: ${error.message}`);closeCall()}}
async function shareCam(){if(!activePeer||!pc||!stream){log('Start or answer a call first.');return}try{const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});const track=camera.getVideoTracks()[0];const sender=pc.getSenders().find(v=>v.track?.kind==='video');if(sender){await sender.replaceTrack(track);stream.getVideoTracks().forEach(t=>t.stop());stream.addTrack(track)}else{pc.addTrack(track,stream);stream.addTrack(track);const offer=await pc.createOffer();await pc.setLocalDescription(offer);await act('signal',{to:activePeer,type:'renegotiate',signal:{sdp:pc.localDescription}})}$('localVideo').srcObject=stream;$('videoLabel').textContent='SHARING CAMERA'}catch(error){log(`Camera unavailable: ${error.message}`)}}
function bind(){
 $('joinBtn').addEventListener('click',joinGame);$('name').addEventListener('keydown',event=>{if(event.key==='Enter')joinGame()});
 $all('.category-tab').forEach(button=>button.addEventListener('click',()=>switchCategory(button.dataset.category)));
 $('strikeBtn').addEventListener('click',arm);$('cancelBtn').addEventListener('click',disarm);
 $('chatForm').addEventListener('submit',async e=>{e.preventDefault();if(!me)return;const input=$('message'),text=input.value.trim();if(!text)return;input.value='';try{await act('chat',{text})}catch(error){log(error.message)}});
 $('voiceBtn').addEventListener('click',()=>callPlayer(false));$('videoBtn').addEventListener('click',()=>callPlayer(true));$('camBtn').addEventListener('click',shareCam);$('hangBtn').addEventListener('click',()=>closeCall(true));
 $('accept').addEventListener('click',acceptCall);$('decline').addEventListener('click',()=>{const from=pending?.from;$('incoming').hidden=true;pending=null;pendingIce=[];if(from&&me)act('signal',{to:from,type:'end',signal:{}}).catch(()=>{})});
 window.addEventListener('beforeunload',()=>{source?.close();closeCall()});
}
clock();setInterval(clock,1000);initMap();bind();initFilters();initThemeBuilder();renderCatalog();renderSelection();
