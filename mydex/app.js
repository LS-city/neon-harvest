/* MyDex standalone app.
   Players: 50 pages (1 Info Card, 2 Fight Card, 3 Cyber Soldier Card, 4-50 saved cards), Radar, Discover, Customize.
   Businesses: pages stored in mdVenues (biz:true). Rassir (owner) creates them and marks them paid; staff can edit their own tabs
   once the updated firestore.rules are published. Same accounts and cards as the MyDex inside NEON HARVEST. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const PAGES=50, BIZ="#FFC24B", BIZ_PRICE=50;
const NEON={cyan:"#7ceaff",blue:"#5da2ff",violet:"#b98cff",magenta:"#ff5fe0",pink:"#ff5c9f",orange:"#ff9a3d",lime:"#c6ff3d",aqua:"#3dffd8",red:"#ff4a5a",gold:"#ffcf4a",mint:"#7dffb2",ghost:"#e8eefc"};
const FC_GAMES=[["t8","Tekken 8"],["sf6","Street Fighter 6"],["mk1","Mortal Kombat 1"],["ggst","Guilty Gear -Strive-"],["dbfz","Dragon Ball FighterZ"],["ssbu","Super Smash Bros. Ultimate"],["gbvsr","Granblue Fantasy Versus: Rising"],["cotw","Fatal Fury: City of the Wolves"],["2xko","2XKO"],["mvc","Marvel vs. Capcom Fighting Collection"],["uni2","Under Night In-Birth II"],["vf5","Virtua Fighter 5 R.E.V.O."],["other","Other game"]];
const SC_GAMES=[["cod","Call of Duty"],["wz","Call of Duty: Warzone"],["gow","Gears of War"],["mr","Marvel Rivals"],["fn","Fortnite"],["apex","Apex Legends"],["val","VALORANT"],["cs2","Counter-Strike 2"],["ow2","Overwatch 2"],["halo","Halo Infinite"],["r6","Rainbow Six Siege"],["bf","Battlefield"],["destiny","Destiny 2"],["finals","THE FINALS"],["other","Other game"]];
const PLATS={pc:"PC",xbox:"Xbox",nintendo:"Nintendo",playstation:"PlayStation"};
const FRAMES=[["solid","Solid"],["dashed","Dashed"],["double","Double"],["glow","Glow"],["none","None"]];
const SYMBOLS=["","*","+","#","@","&","%","$","!","?","X","Z"];
const MOODS={g:["Approachable","#3dff9a"],y:["Cautious","#ffd83d"],r:["Not approachable","#ff4d5e"]};
const gameName=(list,g)=>g&&g.g==="other"?String(g.n||"Other game"):((list.find(x=>x[0]===(g&&g.g))||[0,"Game"])[1]);
const two=n=>String(n).padStart(2,"0");

let USER=null, DB=null, ME=null, ADMIN=false, NAME="Runner";
const S={dex:{look:{color:"cyan",frame:"solid",symbol:""},pages:{},pnames:{},radarOn:false}, bgs:{}, card:null, fc:null, sc:null,
  venues:[], pres:[], cards:{}, allCards:null, pos:null, page:1, tab:"pages", radarKm:5};
let saveT=0, presT=0, unsubPres=null;

/* ---------------- helpers ---------------- */
function toast(t){ const d=document.createElement("div"); d.className="toast"; d.setAttribute("role","status"); d.textContent=t; document.body.append(d); setTimeout(()=>d.remove(),2600); }
const accent=()=>NEON[S.dex.look.color]||NEON.cyan;
function save(){ clearTimeout(saveT); saveT=setTimeout(()=>{ DB.doc("data/users/"+ME+"/dex2").set(S.dex).catch(()=>toast("Couldn't save. Check your connection.")); },500); }
function km(a,b){ const R=6371, r=x=>x*Math.PI/180, dLa=r(b.lat-a.lat), dLn=r(b.lng-a.lng); const h=Math.sin(dLa/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLn/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
const distTxt=d=>d<1?Math.round(d*1000)+" m":d.toFixed(1)+" km";
const cellOf=(la,ln)=>Math.floor(la*100)+"_"+Math.floor(ln*100);
const cellCenter=c=>{ const p=String(c||"").split("_"); if(p.length!==2) return null; return {lat:(+p[0]+.5)/100,lng:(+p[1]+.5)/100}; };
const bizList=()=>S.venues.filter(v=>v.biz&&isActive(v));
function isActive(v){ return v.active!==false && (!v.paidUntil || v.paidUntil>=Date.now()-864e5); }
function shrink(file,max,q){ return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>{ let s=Math.min(1,max/Math.max(img.width,img.height)); const draw=(qq)=>{ const c=document.createElement("canvas"); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s); c.getContext("2d").drawImage(img,0,0,c.width,c.height); return c.toDataURL("image/jpeg",qq); };
    let out=draw(q), qq=q; while(out.length>850000&&qq>.35){ qq-=.1; out=draw(qq); } while(out.length>850000&&s>.2){ s*=.8; out=draw(qq); } URL.revokeObjectURL(img.src); res(out); }; img.onerror=()=>rej(new Error("bad image")); img.src=URL.createObjectURL(file); }); }
function pickFile(){ return new Promise(res=>{ const i=document.createElement("input"); i.type="file"; i.accept="image/*"; i.style.cssText="position:fixed;left:-9999px;opacity:0";
  document.body.append(i); i.onchange=()=>{ const f=i.files&&i.files[0]||null; i.remove(); res(f); }; i.click(); }); }
function getPos(){ return new Promise((res,rej)=>{ if(!navigator.geolocation) return rej(new Error("no gps")); navigator.geolocation.getCurrentPosition(p=>{ S.pos={lat:p.coords.latitude,lng:p.coords.longitude}; res(S.pos); },rej,{enableHighAccuracy:false,timeout:15000,maximumAge:120000}); }); }

/* Tap-twice confirm (no browser pop-ups: some phones and installed apps block them). */
function armed(el,label){ if(!el) return true; if(el.dataset.armed==="1") return true; const o=el.textContent; el.dataset.armed="1"; el.textContent=label||"Tap again to confirm"; el.classList.add("warn");
  setTimeout(()=>{ if(el.isConnected&&el.dataset.armed==="1"){ el.dataset.armed=""; el.textContent=o; el.classList.remove("warn"); } },4000); return false; }
const today0=()=>{ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); };
const dayOf=s=>{ const t=Date.parse(String(s||"")+"T00:00:00"); return isFinite(t)?t:null; };
const fmtDay=s=>{ const t=dayOf(s); return t?new Date(t).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}):""; };
const liveSpecials=v=>(v.specials||[]).filter(it=>!it.until||dayOf(it.until)>=today0());
const liveEvents=v=>(v.events||[]).filter(it=>!it.date||dayOf(it.date)>=today0()).sort((a,b)=>(dayOf(a.date)||9e15)-(dayOf(b.date)||9e15));
/* Share links: ?p=<player id> opens a player's card, ?b=<business id> opens a business page. */
const appUrl=()=>location.origin+location.pathname;
const linkFor=(t,id)=>appUrl()+"?"+t+"="+encodeURIComponent(id);
const qrSrc=url=>"https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&data="+encodeURIComponent(url);
async function shareLink(url,text){ try{ if(navigator.share){ await navigator.share({title:"MyDex",text,url}); return; } }catch(e){ if(e&&e.name==="AbortError") return; }
  try{ await navigator.clipboard.writeText(url); toast("Link copied. Paste it anywhere."); }catch(e){ sheet(`<h2>Your link</h2><p class="dim">Copy this link:</p><input class="copyfield" readonly value="${esc(url)}" aria-label="Share link">`,s=>{ const i=s.querySelector(".copyfield"); i.focus(); i.select(); }); } }
function showQR(t,id,name){ const url=linkFor(t,id);
  sheet(`<h2>${t==="b"?"QR code for "+esc(name):"Your MyDex QR code"}</h2>
    <p class="dim">${t==="b"?"Print it and put it at the counter. Scanning it opens your business page so players can add it to their MyDex.":"Anyone who scans this opens your card and can add you to their MyDex."}</p>
    <div class="qrbox"><img src="${esc(qrSrc(url))}" alt="QR code linking to ${esc(name)} on MyDex" width="260" height="260"></div>
    <div class="mono small" style="word-break:break-all">${esc(url)}</div>
    <div class="btns"><a class="btn pri linkbtn" href="${esc(qrSrc(url))}" target="_blank" rel="noopener">Open QR to save or print</a><button class="btn" data-a="shareLink" data-v="${t}:${esc(id)}">Share link</button></div>`); }
/* ---------------- sheet (pop-up panel) ---------------- */
function sheet(html,onOpen){ const s=$("#sheet"); s.innerHTML=`<div class="sheet-card" role="dialog" aria-modal="true"><button class="x" data-a="closeSheet" aria-label="Close">Close</button>${html}</div>`; s.hidden=false; if(onOpen) onOpen(s); }
function closeSheet(){ $("#sheet").hidden=true; $("#sheet").innerHTML=""; }

/* ---------------- cards ---------------- */
function avatar(card,size){ const c=accent(); const sym=S.dex.look.symbol; const nm=card&&card.name||NAME;
  if(card&&card.photo) return `<img class="av" style="width:${size}px;height:${size}px;border-color:${c}" src="${esc(card.photo)}" alt="">`;
  return `<div class="av" style="width:${size}px;height:${size}px;border-color:${c};color:${c}">${esc(sym||nm.slice(0,1).toUpperCase())}</div>`; }
function frameStyle(){ const f=S.dex.look.frame, c=accent(); if(f==="none") return "border:1px solid var(--line)"; if(f==="glow") return `border:2px solid ${c};box-shadow:0 0 18px ${c}55`; return `border:${f==="double"?4:2}px ${f} ${c}`; }
function infoPage(){ const c=S.card, nm=c&&c.name||NAME, mood=MOODS[c&&c.mood]||null, facts=(c&&c.facts||[]).filter(Boolean);
  return `<section class="card" style="${frameStyle()}">
    <div class="row">${avatar(c,72)}<div class="col"><div class="nm">${esc(nm)}${S.dex.look.symbol?` <span style="color:${accent()}">${esc(S.dex.look.symbol)}</span>`:""}</div>
      <div class="mono dim">DEX ID ${esc(ME.slice(0,8).toUpperCase())}</div>${mood?`<div class="mood"><i style="background:${mood[1]}"></i>${mood[0]}</div>`:""}</div></div>
    <p class="bio">${c&&c.bio?esc(c.bio):`<span class="dim">No bio yet. Tap Edit card to add one.</span>`}</p>
    ${facts.length?`<ul class="facts">${facts.map(f=>`<li>${esc(f)}</li>`).join("")}</ul>`:""}
    <div class="dim small">Encountered ${+(c&&c.met)||0} people</div>
  </section>
  <div class="btns"><button class="btn pri" data-a="classic">Edit card</button><button class="btn" data-a="share">Share my card</button><button class="btn" data-a="myQR">My QR code</button></div>`; }
function gamesPage(title,doc,list,findLbl){ const games=doc&&doc.games||[], plats=(doc&&doc.plats||[]).map(p=>PLATS[p]||p);
  return `<section class="card" style="${frameStyle()}"><h2>${title}</h2>
    ${plats.length?`<div class="chips">${plats.map(p=>`<span class="chipx">${esc(p)}</span>`).join("")}</div>`:""}
    ${games.length?games.map(g=>`<div class="game"><div class="col"><b>${esc(gameName(list,g))}</b><span class="dim small">${esc(PLATS[g.plat]||g.plat||"")}${g.main?" · Main: "+esc(g.main):""}</span></div><span class="mono">${esc(g.tag||"")}</span></div>`).join("")
      :`<p class="dim">No games added yet. Tap Edit to add your games and in-game names.</p>`}
    ${doc&&doc.st?`<div class="dim small">Record: ${+doc.st.w||0}W · ${+doc.st.l||0}L</div>`:""}
  </section>
  <div class="btns"><button class="btn pri" data-a="classic">Edit / fights</button><button class="btn" data-a="tab" data-v="discover">${findLbl}</button></div>`; }
function bizCard(v,pageNo){ return `<section class="card biz">
    <div class="row between"><span class="biztag">${bizIcon(14)} BUSINESS</span>${pageNo?`<span class="small" style="color:#e8d9a8">Saved to page ${pageNo}</span>`:""}</div>
    <div class="row">${v.logo?`<img class="logo" src="${esc(v.logo)}" alt="">`:`<div class="logo">${bizIcon(26)}</div>`}<div class="col"><div class="nm">${esc(v.name)}</div><div class="small" style="color:#e8d9a8">${esc(v.type||"Local business")}</div></div></div>
    ${v.info?`<p class="bio" style="color:#efe3bd">${esc(v.info)}</p>`:""}
    ${bizHighlights(v)}
    <button class="btn gold" data-a="biz" data-v="${esc(v.id)}">Open business page</button>
  </section>`; }
function bizHighlights(v){ const sp=liveSpecials(v), ev=liveEvents(v); let h="";
  if(ev[0]) h+=`<button class="hl" data-a="bizTab" data-v="${esc(v.id)}" data-t="events"><span class="hlk">NEXT EVENT</span><b>${esc(ev[0].name)}</b><span class="small">${esc(fmtDay(ev[0].date))}${ev[0].time?" · "+esc(ev[0].time):""}</span></button>`;
  if(sp[0]) h+=`<button class="hl" data-a="bizTab" data-v="${esc(v.id)}" data-t="specials"><span class="hlk">SPECIAL${sp.length>1?"S ("+sp.length+")":""}</span><b>${esc(sp[0].name)}</b>${sp[0].price?`<span class="small">${esc(sp[0].price)}</span>`:""}</button>`;
  return h; }
function playerMini(c,id,pageNo){ return `<section class="card">
    <div class="row between"><span class="small dim">PLAYER</span>${pageNo?`<span class="small dim">Saved to page ${pageNo}</span>`:""}</div>
    <div class="row">${c&&c.photo?`<img class="av" style="width:64px;height:64px" src="${esc(c.photo)}" alt="">`:`<div class="av" style="width:64px;height:64px">${esc((c&&c.name||"?").slice(0,1))}</div>`}
      <div class="col"><div class="nm">${esc(c?c.name:"Loading...")}</div>${c&&MOODS[c.mood]?`<div class="mood"><i style="background:${MOODS[c.mood][1]}"></i>${MOODS[c.mood][0]}</div>`:""}</div></div>
    ${c&&c.bio?`<p class="bio">${esc(c.bio)}</p>`:""}
  </section>`; }
const bizIcon=s=>`<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 9l2-5h14l2 5M4 9v11h16V9M9 20v-6h6v6"/></svg>`;

/* ---------------- pages ---------------- */
function bgFor(n){ return S.bgs["p"+n]||S.bgs.all||null; }
function pageName(n){ return S.dex.pnames[n]||({1:"Info Card",2:"Fight Card",3:"Cyber Soldier Card"}[n])||""; }
function pageBody(n){
  if(n===1) return infoPage();
  if(n===2) return gamesPage("Fight Card",S.fc,FC_GAMES,"Find fighters");
  if(n===3) return gamesPage("Cyber Soldier Card",S.sc,SC_GAMES,"Find squadmates");
  const e=S.dex.pages[n];
  if(e&&e.t==="biz"){ const v=S.venues.find(x=>x.id===e.id); if(v) return bizCard(v,n)+pageTools(n); return `<section class="card"><p class="dim">This business isn't on MyDex anymore.</p></section>`+pageTools(n); }
  if(e&&e.t==="player"){ loadCard(e.id); return playerMini(S.cards[e.id],e.id,n)+pageTools(n); }
  return `<section class="empty"><h2>Page ${n} is empty</h2><p class="dim">Find a business or player on Radar or Discover and tap <b>Add to page</b>. They'll land on your next empty page.</p>
    <div class="btns"><button class="btn" data-a="tab" data-v="radar">Open Radar</button><button class="btn" data-a="tab" data-v="discover">Discover</button></div></section>`; }
function pageTools(n){ return `<div class="btns"><button class="btn" data-a="movePage" data-v="${n}">Move to page...</button><button class="btn" data-a="removePage" data-v="${n}">Remove</button></div>`; }
function renderPages(){ const box=$("#pages"); const left=box.scrollLeft; let h="";
  for(let n=1;n<=PAGES;n++){ const bg=bgFor(n);
    h+=`<div class="page" data-n="${n}">${bg?`<div class="bgimg" style="background-image:url('${bg.img}');background-size:${bg.fit==="contain"?"contain":"cover"}"></div><div class="bgdim" style="background:rgba(10,11,20,${(+bg.dim||0)/100})"></div>`:""}<div class="pin">${pageBody(n)}</div></div>`; }
  box.innerHTML=h; box.scrollLeft=left; updIndicator(); }
function updIndicator(){ const box=$("#pages"); const n=Math.min(PAGES,Math.max(1,Math.round(box.scrollLeft/Math.max(1,box.clientWidth))+1)); S.page=n;
  $("#pgnum").innerHTML=`PAGE <b>${two(n)}</b> / ${PAGES}`; $("#pgname").textContent=pageName(n);
  const t=$("#ticks"); if(t){ let h=""; for(let i=1;i<=10;i++){ const blk=Math.ceil(n/5); h+=`<i class="${i===blk?"on":i<=0?"":""}"></i>`; } t.innerHTML=h; } }
function goPage(n){ const box=$("#pages"); box.scrollTo({left:(n-1)*box.clientWidth,behavior:"smooth"}); }
function pagePicker(){ let h=`<h2>Go to page</h2><div class="pgrid">`; for(let n=1;n<=PAGES;n++){ const e=S.dex.pages[n]; const used=n<=3||e; h+=`<button class="pg ${used?"used":""} ${e&&e.t==="biz"?"isbiz":""}" data-a="goPage" data-v="${n}" aria-label="Page ${n}">${n}</button>`; } h+=`</div><p class="dim small">Highlighted pages have something saved. Gold pages hold a business.</p>`; sheet(h); }
function addToPage(t,id){ for(let n=4;n<=PAGES;n++){ const e=S.dex.pages[n]; if(e&&e.t===t&&e.id===id){ toast("Already on page "+n); return; } }
  for(let n=4;n<=PAGES;n++){ if(!S.dex.pages[n]){ S.dex.pages[n]={t,id,at:Date.now()}; save(); renderPages(); toast("Added to page "+n); return n; } }
  toast("All 50 pages are full. Remove one first."); }

/* ---------------- business page (player view) ---------------- */
function openBiz(id,tab){ const v=S.venues.find(x=>x.id===id); if(!v) return; tab=tab||"info";
  const sp=liveSpecials(v), ev=liveEvents(v);
  const tabs=[["info","Info"],["specials","Specials"],["events","Events"],["rewards","Rewards"],["inventory","Inventory"],["menu","Menu"]].filter(([k])=>k==="info"||(k==="specials"?sp.length:k==="events"?ev.length:(v[k]&&v[k].length)));
  let saved=0; for(let n=4;n<=PAGES;n++){ const e=S.dex.pages[n]; if(e&&e.t==="biz"&&e.id===id) saved=n; }
  const d=S.pos&&v.lat!=null?km(S.pos,{lat:v.lat,lng:v.lng}):null;
  const list=k=>(v[k]||[]).map(it=>`<div class="item"><div class="col"><b>${esc(it.name)}</b>${it.note?`<span class="dim small">${esc(it.note)}</span>`:""}</div>${it.price?`<span class="mono" style="color:#e8d9a8">${esc(it.price)}</span>`:""}</div>`).join("");
  const body=tab==="info"?`${v.info?`<p class="bio">${esc(v.info)}</p>`:""}${v.hours?`<div class="item"><b>Hours</b><span>${esc(v.hours)}</span></div>`:""}${v.address?`<div class="item"><b>Address</b><span>${esc(v.address)}</span></div>`:""}${d!=null?`<div class="item"><b>Distance</b><span>${distTxt(d)}</span></div>`:""}`
    :tab==="specials"?sp.map(it=>`<div class="item"><div class="col"><b>${esc(it.name)}</b>${it.note?`<span class="dim small">${esc(it.note)}</span>`:""}${it.until?`<span class="small" style="color:#ffb27a">Ends ${esc(fmtDay(it.until))}</span>`:""}</div>${it.price?`<span class="mono" style="color:#e8d9a8">${esc(it.price)}</span>`:""}</div>`).join("")
    :tab==="events"?ev.map(it=>`<div class="item ev"><div class="evdate">${it.date?`<b>${esc(new Date(dayOf(it.date)).getDate())}</b><span>${esc(new Date(dayOf(it.date)).toLocaleDateString(undefined,{month:"short"}))}</span>`:"<b>TBA</b>"}</div><div class="col" style="flex:1"><b>${esc(it.name)}</b><span class="small" style="color:#e8d9a8">${esc(fmtDay(it.date))}${it.time?" · "+esc(it.time):""}</span>${it.note?`<span class="dim small">${esc(it.note)}</span>`:""}</div>${it.price?`<span class="mono" style="color:#e8d9a8">${esc(it.price)}</span>`:""}</div>`).join("")
    :tab==="rewards"?list("rewards")+`<p class="dim small">Show your MyDex at the counter to claim a reward.</p>`:list(tab);
  sheet(`<div class="bizhead">${v.banner?`<img src="${esc(v.banner)}" alt="">`:""}<span class="biztag">${bizIcon(14)} BUSINESS</span></div>
    <div class="row" style="margin-top:-30px;position:relative">${v.logo?`<img class="logo" src="${esc(v.logo)}" alt="">`:`<div class="logo">${bizIcon(26)}</div>`}<div class="col"><div class="nm">${esc(v.name)}</div><div class="small" style="color:#e8d9a8">${esc(v.type||"Local business")}</div></div></div>
    <div class="btns">${saved?`<button class="btn" data-a="goPageClose" data-v="${saved}">On your page ${saved}</button>`:`<button class="btn gold" data-a="addBiz" data-v="${esc(id)}">+ Add to page</button>`}<button class="btn" data-a="shareLink" data-v="b:${esc(id)}">Share</button></div>
    <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${k===tab}" class="${k===tab?"on":""}" data-a="bizTab" data-v="${esc(id)}" data-t="${k}">${l}</button>`).join("")}</div>
    <div class="tabbody">${body||`<p class="dim">Nothing here yet.</p>`}</div>`); }
function openPlayer(id){ loadCard(id).then(()=>{ const c=S.cards[id]; let saved=0; for(let n=4;n<=PAGES;n++){ const e=S.dex.pages[n]; if(e&&e.t==="player"&&e.id===id) saved=n; }
  sheet(playerMini(c,id,0)+`<div class="btns">${id===ME?`<p class="dim">This is you.</p>`:saved?`<button class="btn" data-a="goPageClose" data-v="${saved}">On your page ${saved}</button>`:`<button class="btn pri" data-a="addPlayer" data-v="${esc(id)}">+ Add to page</button>`}<button class="btn" data-a="shareLink" data-v="p:${esc(id)}">Share</button></div>`); }); }
async function loadCard(id){ if(S.cards[id]!==undefined) return; S.cards[id]=null; try{ const s=await DB.doc("mdCards/"+id).get(); S.cards[id]=s.exists?s.data():{name:"Unknown player"}; }catch(e){ S.cards[id]={name:"Unknown player"}; } if(S.tab==="pages") renderPages(); }

/* ---------------- radar ---------------- */
function renderRadar(){ const v=$("#view");
  if(!S.pos){ v.innerHTML=`<div class="pad"><h1>Radar</h1><p class="dim">Radar shows businesses and players near you. Businesses show as <b style="color:${BIZ}">gold diamonds</b>, players as <b style="color:${accent()}">dots</b>.</p><button class="btn pri" data-a="radarOn">Turn on Radar</button><p class="dim small">Your exact location is never shared. If you choose to show up for others, they only see your rough area.</p></div>`; return; }
  const R=S.radarKm, size=320, c=size/2, sc=(c-18)/R, me=S.pos;
  const bizs=bizList().filter(b=>b.lat!=null).map(b=>({b,d:km(me,{lat:b.lat,lng:b.lng})})).sort((a,b)=>a.d-b.d);
  const now=Date.now(), pl=S.pres.filter(p=>p.id!==ME&&p.at>now-15*60e3&&p.cell).map(p=>({p,pt:cellCenter(p.cell)})).filter(x=>x.pt).map(x=>({...x,d:km(me,x.pt)})).sort((a,b)=>a.d-b.d);
  const xy=pt=>{ const dx=(pt.lng-me.lng)*111.32*Math.cos(me.lat*Math.PI/180), dy=(pt.lat-me.lat)*110.57; return [c+dx*sc,c-dy*sc]; };
  let marks="";
  pl.filter(x=>x.d<=R).forEach(x=>{ const [X,Y]=xy(x.pt); marks+=`<button class="mk pl" style="left:${X-8}px;top:${Y-8}px;background:${accent()}" data-a="player" data-v="${esc(x.p.id)}" aria-label="Player ${esc(x.p.name)}"></button>`; });
  bizs.filter(x=>x.d<=R).forEach(x=>{ const [X,Y]=xy(x.b); marks+=`<button class="mk bz" style="left:${X-15}px;top:${Y-15}px" data-a="biz" data-v="${esc(x.b.id)}" aria-label="Business ${esc(x.b.name)}"><span>${bizIcon(15)}</span></button>`; });
  v.innerHTML=`<div class="pad"><div class="row between"><h1>Radar</h1><div class="seg">${[1,5,25].map(k=>`<button class="${k===R?"on":""}" data-a="radarKm" data-v="${k}">${k} km</button>`).join("")}</div></div>
    <div class="radar" style="width:${size}px;height:${size}px"><div class="ring" style="inset:${c*.33}px"></div><div class="ring" style="inset:${c*.66}px"></div><div class="me"></div>${marks}</div>
    <div class="legend"><span><i class="dot" style="background:${accent()}"></i>Player</span><span><i class="dia"></i>Business</span></div>
    <label class="toggle"><input type="checkbox" data-a="visible" ${S.dex.radarOn?"checked":""}> Show me on other players' Radar</label>
    <h2>Businesses nearby</h2>${bizs.length?bizs.slice(0,15).map(x=>`<button class="lrow bizrow" data-a="biz" data-v="${esc(x.b.id)}"><span class="dia sm"></span><b>${esc(x.b.name)}</b><span class="dim small">${esc(x.b.type||"")}</span><span class="small" style="margin-left:auto">${distTxt(x.d)}</span></button>`).join(""):`<p class="dim">No businesses on MyDex near you yet.</p>`}
    <h2>Players nearby</h2>${pl.length?pl.slice(0,15).map(x=>`<button class="lrow" data-a="player" data-v="${esc(x.p.id)}"><i class="dot" style="background:${accent()}"></i><b>${esc(x.p.name||"Player")}</b><span class="small" style="margin-left:auto">~${distTxt(x.d)}</span></button>`).join(""):`<p class="dim">No players showing on Radar near you right now.</p>`}</div>`; }
function watchPres(){ if(unsubPres) return; unsubPres=DB.collection("mdPres").onSnapshot(s=>{ S.pres=s.docs.map(d=>({id:d.id,...d.data()})); if(S.tab==="radar") renderRadar(); },()=>{}); }
function pushPres(){ clearTimeout(presT); if(!S.dex.radarOn||!S.pos) return; const nm=(S.card&&S.card.name||NAME).slice(0,18);
  DB.doc("mdPres/"+ME).set({name:nm,cell:cellOf(S.pos.lat,S.pos.lng),mood:(S.card&&S.card.mood)||"g",at:Date.now()}).catch(()=>{}); presT=setTimeout(pushPres,120000); }

/* ---------------- discover ---------------- */
async function renderDiscover(){ const v=$("#view"); const q=(S.q||"").toLowerCase();
  if(S.allCards===null){ S.allCards=[]; DB.collection("mdCards").limit(500).get().then(s=>{ S.allCards=s.docs.map(d=>({id:d.id,...d.data()})); s.docs.forEach(d=>{ S.cards[d.id]=d.data(); }); if(S.tab==="discover") renderDiscover(); }).catch(()=>{}); }
  const bz=bizList().filter(b=>!q||(b.name+" "+(b.type||"")).toLowerCase().includes(q));
  const pl=(S.allCards||[]).filter(c=>c.id!==ME&&(!q||String(c.name||"").toLowerCase().includes(q))).slice(0,40);
  const had=document.activeElement&&document.activeElement.id==="q";
  v.innerHTML=`<div class="pad"><h1>Discover</h1><label class="srch"><span class="sr">Search</span><input id="q" type="search" placeholder="Search businesses and players" value="${esc(S.q||"")}"></label>
    <h2 style="color:${BIZ}">Businesses</h2>${bz.length?bz.map(b=>`<button class="lrow bizrow" data-a="biz" data-v="${esc(b.id)}"><span class="dia sm"></span><b>${esc(b.name)}</b><span class="dim small">${esc(b.type||"")}</span></button>`).join(""):`<p class="dim">${q?"No businesses match.":"No businesses on MyDex yet."}</p>`}
    <h2>Players</h2>${pl.length?pl.map(c=>`<button class="lrow" data-a="player" data-v="${esc(c.id)}">${c.photo?`<img class="av" style="width:32px;height:32px" src="${esc(c.photo)}" alt="">`:`<i class="dot" style="background:${accent()}"></i>`}<b>${esc(c.name)}</b></button>`).join(""):`<p class="dim">${S.allCards&&S.allCards.length?"No players match.":"Loading players..."}</p>`}</div>`;
  if(had){ const i=$("#q"); i.focus(); i.setSelectionRange(i.value.length,i.value.length); } }

/* ---------------- customize ---------------- */
function renderMe(){ const v=$("#view"), L=S.dex.look, p=S.bgPage||S.page||1, bg=S.bgs["p"+p]||null, all=S.bgs.all||null;
  v.innerHTML=`<div class="pad"><h1>Customize</h1>
    <section class="card" style="${frameStyle()}"><div class="row">${avatar(S.card,60)}<div class="col"><div class="nm">${esc(S.card&&S.card.name||NAME)}</div><div class="small" style="color:${accent()}">Live preview</div></div></div></section>
    <h2>Card color</h2><div class="swatches">${Object.entries(NEON).map(([k,c])=>`<button class="sw ${L.color===k?"on":""}" style="background:${c}" data-a="color" data-v="${k}" aria-label="${k}"></button>`).join("")}</div>
    <h2>Frame</h2><div class="seg wrap">${FRAMES.map(([k,l])=>`<button class="${L.frame===k?"on":""}" data-a="frame" data-v="${k}">${l}</button>`).join("")}</div>
    <h2>Symbol</h2><div class="seg wrap">${SYMBOLS.map(s=>`<button class="${L.symbol===s?"on":""}" data-a="symbol" data-v="${esc(s)}">${s||"None"}</button>`).join("")}</div>
    <h2>Page backgrounds</h2>
    <label class="fld">Page <select id="bgpage">${Array.from({length:PAGES},(_,i)=>`<option value="${i+1}" ${i+1===p?"selected":""}>Page ${i+1}${pageName(i+1)?" · "+esc(pageName(i+1)):""}</option>`).join("")}</select></label>
    <div class="bgprev" style="${bg||all?`background-image:url('${(bg||all).img}');background-size:${(bg||all).fit==="contain"?"contain":"cover"}`:""}"><div style="position:absolute;inset:0;background:rgba(10,11,20,${((bg||all)?+(bg||all).dim:0)/100})"></div><span>${bg?"This page's image":all?"Using your all-pages image":"No image on this page"}</span></div>
    <button class="btn pri" data-a="bgUpload">Upload image for page ${p}</button>
    ${bg||all?`<div class="seg"><button class="${(bg||all).fit!=="contain"?"on":""}" data-a="bgFit" data-v="cover">Fill page</button><button class="${(bg||all).fit==="contain"?"on":""}" data-a="bgFit" data-v="contain">Fit whole image</button></div>
    <label class="fld">Darken so text stays readable: <b id="dimv">${(bg||all).dim}%</b><input id="bgdim" type="range" min="0" max="80" value="${(bg||all).dim}"></label>`:""}
    <div class="btns">${bg?`<button class="btn" data-a="bgAll">Use on all pages</button><button class="btn" data-a="bgRemove">Remove image</button>`:all?`<button class="btn" data-a="bgRemoveAll">Remove all-pages image</button>`:""}</div>
    <p class="dim small">Your image only sits behind your cards. Cards, buttons and text stay in place on top.</p>
    <h2>Page name</h2><label class="fld"><span class="sr">Name for page ${p}</span><input id="pname" maxlength="24" placeholder="Name page ${p}" value="${esc(S.dex.pnames[p]||"")}"></label>
    <h2>Account</h2><div class="btns"><button class="btn" data-a="classic">Classic MyDex (badges, vault, goals)</button><button class="btn" data-a="signout">Sign out</button></div></div>`; }
// Each background is its own document next to the player's save: data/users/{uid}/dexbg_p1 ... dexbg_p50, dexbg_all.
async function setBg(key,val){ const ref=DB.doc("data/users/"+ME+"/dexbg_"+key); if(val){ S.bgs[key]=val; await ref.set(val); } else { delete S.bgs[key]; await ref.delete(); } }

/* ---------------- business owner + admin ---------------- */
const myBiz=()=>S.venues.filter(v=>v.biz&&(v.staff||[]).includes(ME));
function renderBizTab(){ const v=$("#view"), mine=ADMIN?S.venues.filter(x=>x.biz):myBiz();
  v.innerHTML=`<div class="pad"><h1 style="color:${BIZ}">My business</h1>${mine.length?mine.map(b=>`<section class="card biz"><div class="row between"><b>${esc(b.name)}</b><span class="small" style="color:${isActive(b)?"#3dff9a":"#ff9a3d"}">${isActive(b)?"Live":"Not live"}</span></div>
      <div class="stats"><div><span class="dim small">Specials</span><b>${liveSpecials(b).length}</b></div><div><span class="dim small">Upcoming events</span><b>${liveEvents(b).length}</b></div></div>
      ${b.paidUntil?`<div class="small" style="color:#e8d9a8">Plan: $${BIZ_PRICE}/mo · paid through ${new Date(b.paidUntil).toLocaleDateString()}</div>`:""}
      <div class="btns"><button class="btn gold" data-a="editBiz" data-v="${esc(b.id)}">Edit page</button><button class="btn" data-a="biz" data-v="${esc(b.id)}">Preview</button><button class="btn" data-a="bizQR" data-v="${esc(b.id)}">QR code</button><button class="btn" data-a="shareLink" data-v="b:${esc(b.id)}">Share link</button></div></section>`).join("")
    :`<p class="dim">You're not set up as staff on a business page yet.</p>`}</div>`; }
function renderAdmin(){ const v=$("#view"), all=S.venues, biz=all.filter(x=>x.biz), live=biz.filter(isActive);
  v.innerHTML=`<div class="pad"><div class="row between"><h1 style="color:#b98bff">Admin</h1><span class="pill" style="background:#b98bff">OWNER ONLY</span></div>
    <div class="stats"><div><span class="dim small">Players</span><b>${S.allCards?S.allCards.length:"..."}</b></div><div><span class="dim small">Live businesses</span><b>${live.length}</b></div><div><span class="dim small">Monthly</span><b>$${live.length*BIZ_PRICE}</b></div></div>
    <button class="btn gold" data-a="editBiz" data-v="">+ New business page</button>
    <h2>Business pages</h2>${biz.length?biz.map(b=>`<button class="lrow bizrow" data-a="editBiz" data-v="${esc(b.id)}"><span class="dia sm"></span><b>${esc(b.name)}</b><span class="small" style="margin-left:auto;color:${isActive(b)?"#3dff9a":"#ff9a3d"}">${isActive(b)?"Live":"Off"}${b.paidUntil?" · to "+new Date(b.paidUntil).toLocaleDateString():""}</span></button>`).join(""):`<p class="dim">No business pages yet.</p>`}
    ${all.length>biz.length?`<h2>Check-in venues (classic)</h2>${all.filter(x=>!x.biz).map(b=>`<button class="lrow" data-a="editBiz" data-v="${esc(b.id)}"><b>${esc(b.name)}</b><span class="dim small" style="margin-left:auto">Tap to turn into a business page</span></button>`).join("")}`:""}
    <h2>More tools</h2><div class="btns"><button class="btn" data-a="classicAdmin">Classic MyDex admin (bans, badges, reports)</button></div>
    <p class="dim small">Businesses pay you $${BIZ_PRICE} a month. When a payment comes in, open their page and set "Paid through" one month ahead. Pages past their paid date drop off Radar and Discover automatically.</p></div>`; }
function itemsEditor(k,label,arr){ return `<h2>${label}</h2>${k==="specials"?`<p class="dim small">Deals and limited-time offers. Add an end date and it disappears on its own after that day.</p>`:k==="events"?`<p class="dim small">Tournaments, game nights, launches. Past events hide themselves.</p>`:""}<div id="ed_${k}">${(arr||[]).map((it,i)=>itemRow(k,i,it)).join("")}</div><button class="btn" data-a="addItem" data-v="${k}">+ Add ${label.toLowerCase().replace(/s$/,"")}</button>`; }
const itemRow=(k,i,it)=>`<div class="erow" data-k="${k}"><input aria-label="Name" placeholder="${k==="events"?"Event name":k==="specials"?"Special (e.g. 2-for-1 drinks)":"Name"}" value="${esc(it.name||"")}" class="i_name"><input aria-label="Price or points" placeholder="${k==="rewards"?"Points / cost":k==="events"?"Entry fee":"Price"}" value="${esc(it.price||"")}" class="i_price">${k==="events"?`<label class="mini">Date<input type="date" class="i_date" value="${esc(it.date||"")}"></label><label class="mini">Time<input class="i_time" placeholder="e.g. 8 PM" maxlength="20" value="${esc(it.time||"")}"></label>`:k==="specials"?`<label class="mini">Ends (optional)<input type="date" class="i_date" value="${esc(it.until||"")}"></label><span></span>`:""}<input aria-label="Details" placeholder="Details (optional)" value="${esc(it.note||"")}" class="i_note"><button class="btn sm" data-a="delItem" aria-label="Remove">Remove</button></div>`;
function editBiz(id){ const v=id?S.venues.find(x=>x.id===id):null, b=v||{name:"",info:"",radius:150,staff:[],biz:true,active:true};
  const staffNames=(b.staff||[]).map(u=>(S.cards[u]&&S.cards[u].name)||u).join(", ");
  const paid=b.paidUntil?new Date(b.paidUntil).toISOString().slice(0,10):"";
  S.edit={id:id||null,logo:b.logo||"",banner:b.banner||""};
  sheet(`<h2 style="color:${BIZ}">${id?"Edit business page":"New business page"}</h2>
    <label class="fld">Business name<input id="b_name" maxlength="40" value="${esc(b.name)}"></label>
    <label class="fld">Type (e.g. Arcade, Smoke shop, Cafe)<input id="b_type" maxlength="30" value="${esc(b.type||"")}"></label>
    <label class="fld">About<textarea id="b_info" maxlength="300" rows="3">${esc(b.info||"")}</textarea></label>
    <label class="fld">Hours<input id="b_hours" maxlength="60" value="${esc(b.hours||"")}"></label>
    <label class="fld">Address<input id="b_addr" maxlength="80" value="${esc(b.address||"")}"></label>
    <div class="row gap"><button class="btn sm" data-a="bLogo">${S.edit.logo?"Change":"Add"} logo</button><button class="btn sm" data-a="bBanner">${S.edit.banner?"Change":"Add"} banner</button></div>
    ${ADMIN?`<h2>Location (for Radar)</h2><div class="row gap"><input id="b_lat" aria-label="Latitude" placeholder="Latitude" value="${b.lat!=null?b.lat:""}"><input id="b_lng" aria-label="Longitude" placeholder="Longitude" value="${b.lng!=null?b.lng:""}"></div><button class="btn sm" data-a="bHere">Use my current location</button>
    <h2>Billing</h2><label class="fld">Paid through<input id="b_paid" type="date" value="${paid}"></label><button class="btn sm" data-a="bMonth">+1 month from today ($${BIZ_PRICE})</button>
    <label class="toggle"><input type="checkbox" id="b_active" ${b.active!==false?"checked":""}> Live on MyDex</label>
    <label class="fld">Staff who can edit (MyDex names, comma separated)<input id="b_staff" value="${esc(staffNames)}"></label>`:""}
    ${itemsEditor("specials","Specials",b.specials)}${itemsEditor("events","Events",b.events)}${itemsEditor("rewards","Rewards",b.rewards)}${itemsEditor("inventory","Inventory",b.inventory)}${itemsEditor("menu","Menu",b.menu)}
    <div class="msg" id="b_msg" role="status"></div>
    <div class="btns"><button class="btn gold" data-a="bSave">Save page</button>${id?`<button class="btn" data-a="bizQR" data-v="${esc(id)}">QR code</button>`:""}${ADMIN&&id?`<button class="btn" data-a="bDelete">Delete</button>`:""}</div>`); }
async function saveBiz(){ const id=S.edit.id, old=id?S.venues.find(x=>x.id===id)||{}:{}; const val=s=>($(s)?$(s).value.trim():"");
  const items=k=>[...document.querySelectorAll(`#ed_${k} .erow`)].map(r=>{ const o={name:r.querySelector(".i_name").value.trim().slice(0,40),price:r.querySelector(".i_price").value.trim().slice(0,20),note:r.querySelector(".i_note").value.trim().slice(0,120)};
    const d=r.querySelector(".i_date"), t=r.querySelector(".i_time"); if(k==="events"){ o.date=d?d.value:""; o.time=t?t.value.trim().slice(0,20):""; } if(k==="specials"&&d&&d.value) o.until=d.value; return o; }).filter(x=>x.name).slice(0,40);
  const msg=$("#b_msg"); const name=val("#b_name"); if(!name){ msg.textContent="Give the business a name."; return; }
  const body={...old,name,type:val("#b_type"),info:val("#b_info"),hours:val("#b_hours"),address:val("#b_addr"),logo:S.edit.logo,banner:S.edit.banner,specials:items("specials"),events:items("events"),rewards:items("rewards"),inventory:items("inventory"),menu:items("menu"),biz:true,at:Date.now()};
  delete body.id;
  if(ADMIN){ const la=parseFloat(val("#b_lat")), ln=parseFloat(val("#b_lng")); if(!isFinite(la)||!isFinite(ln)){ msg.textContent="Add the business location so it shows on Radar."; return; }
    body.lat=la; body.lng=ln; body.radius=old.radius||150; body.active=$("#b_active").checked; const p=val("#b_paid"); body.paidUntil=p?new Date(p+"T23:59:59").getTime():null;
    const names=val("#b_staff").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean), staff=[];
    if(names.length){ if(!S.allCards||!S.allCards.length){ try{ const s=await DB.collection("mdCards").limit(500).get(); S.allCards=s.docs.map(d=>({id:d.id,...d.data()})); }catch(e){} }
      for(const n of names){ const m=(S.allCards||[]).find(c=>String(c.name||"").toLowerCase()===n)||(old.staff||[]).includes(n)&&{id:n}; if(!m){ msg.textContent=`No player named ${n}.`; return; } staff.push(m.id); } }
    body.staff=staff; }
  try{ if(id) await DB.doc("mdVenues/"+id).set(body); else await DB.collection("mdVenues").add(body); closeSheet(); toast("Business page saved."); }
  catch(e){ msg.textContent=e&&e.code==="permission-denied"?"MyDex can't save this yet. Rassir needs to publish the updated database rules in Firebase.":"Couldn't save. Check your connection."; } }

/* ---------------- classic MyDex (badges, vault, fights) ---------------- */
function openClassic(view){ if($("#classic")) return; const w=document.createElement("div"); w.id="classic"; const fr=document.createElement("iframe"); fr.title="Classic MyDex"; fr.setAttribute("allow","geolocation"); fr.src="../neon-harvest/mydex.html?v=20&app=1"+(view?"#"+view:""); w.append(fr); document.body.append(w); }
function closeClassic(){ const w=$("#classic"); if(w) w.remove(); }

/* ---------------- shell ---------------- */
function render(){ document.documentElement.style.setProperty("--acc",accent());
  const nav=[["pages","Pages"],["radar","Radar"],["discover","Discover"],["me","Me"]]; if(myBiz().length&&!ADMIN) nav.push(["biz","Business"]); if(ADMIN) nav.push(["admin","Admin"]);
  $("#nav").style.gridTemplateColumns=`repeat(${nav.length},minmax(0,1fr))`;
  $("#nav").innerHTML=nav.map(([k,l])=>`<button class="${S.tab===k?"on":""} ${k==="admin"?"adm":""} ${k==="biz"?"bz":""}" data-a="tab" data-v="${k}" aria-current="${S.tab===k?"page":"false"}">${l}</button>`).join("");
  const onPages=S.tab==="pages"; $("#pages").hidden=!onPages; $("#pagebar").hidden=!onPages; $("#view").hidden=onPages;
  if(onPages) renderPages(); else if(S.tab==="radar") renderRadar(); else if(S.tab==="discover") renderDiscover(); else if(S.tab==="me") renderMe(); else if(S.tab==="biz") renderBizTab(); else if(S.tab==="admin") renderAdmin(); }

const ACT={
  tab:v=>{ S.tab=v; closeSheet(); if(v==="radar"&&S.pos) watchPres(); if(v==="admin"&&S.allCards===null) renderDiscoverPreload(); render(); $("#view").scrollTop=0; },
  closeSheet, classic:()=>openClassic(), classicAdmin:()=>openClassic("admin"),
  share:()=>shareLink(linkFor("p",ME),"Add me on MyDex: "+(S.card&&S.card.name||NAME)),
  myQR:()=>showQR("p",ME,S.card&&S.card.name||NAME),
  shareLink:v=>{ const k=v.indexOf(":"), t=v.slice(0,k), id=v.slice(k+1); const nm=t==="b"?((S.venues.find(x=>x.id===id)||{}).name||"this business"):((S.cards[id]&&S.cards[id].name)||"this player");
    shareLink(linkFor(t,id),t==="b"?"Check out "+nm+" on MyDex":(id===ME?"Add me on MyDex: "+nm:"Check out "+nm+" on MyDex")); },
  bizQR:v=>{ const b=S.venues.find(x=>x.id===v); showQR("b",v,b?b.name:"this business"); },
  goPage:v=>{ closeSheet(); goPage(+v); }, goPageClose:v=>{ closeSheet(); S.tab="pages"; render(); setTimeout(()=>goPage(+v),50); },
  pagePicker, biz:v=>openBiz(v), bizTab:(v,el)=>openBiz(v,el.dataset.t), player:v=>openPlayer(v),
  addBiz:v=>{ const n=addToPage("biz",v); if(n){ const b=S.venues.find(x=>x.id===v); openBiz(v); } },
  addPlayer:v=>{ addToPage("player",v); openPlayer(v); },
  removePage:(v,el)=>{ if(!armed(el,"Tap again to remove")) return; delete S.dex.pages[v]; save(); renderPages(); toast("Removed from page "+v); },
  movePage:v=>{ let h=`<h2>Move page ${v} to...</h2><div class="pgrid">`; for(let n=4;n<=PAGES;n++){ const e=S.dex.pages[n]; h+=`<button class="pg ${e?"used":""} ${e&&e.t==="biz"?"isbiz":""}" data-a="moveTo" data-v="${v}:${n}" ${n===+v?"disabled":""} aria-label="Page ${n}">${n}</button>`; } sheet(h+`</div><p class="dim small">If the page you pick already has something, the two swap.</p>`); },
  moveTo:v=>{ const [from,to]=v.split(":").map(Number); const a=S.dex.pages[from], b=S.dex.pages[to]; S.dex.pages[to]=a; if(b) S.dex.pages[from]=b; else delete S.dex.pages[from]; save(); closeSheet(); renderPages(); setTimeout(()=>goPage(to),50); toast("Moved to page "+to); },
  radarOn:async()=>{ try{ await getPos(); watchPres(); pushPres(); render(); }catch(e){ toast("Allow location access to use Radar."); } },
  radarKm:v=>{ S.radarKm=+v; renderRadar(); },
  visible:(v,el)=>{ S.dex.radarOn=el.checked; save(); if(el.checked) pushPres(); else { clearTimeout(presT); DB.doc("mdPres/"+ME).delete().catch(()=>{}); } },
  color:v=>{ S.dex.look.color=v; save(); render(); }, frame:v=>{ S.dex.look.frame=v; save(); render(); }, symbol:v=>{ S.dex.look.symbol=v; save(); render(); },
  bgUpload:async()=>{ const f=await pickFile(); if(!f) return; toast("Uploading..."); try{ const img=await shrink(f,1280,.75); const p=S.bgPage||S.page||1, cur=S.bgs["p"+p]||S.bgs.all; await setBg("p"+p,{img,fit:cur?cur.fit:"cover",dim:cur?cur.dim:40}); toast("Background set for page "+p); render(); }catch(e){ console.error(e); toast(e&&e.message==="bad image"?"That file isn't an image MyDex can read. Try a JPG or PNG.":"Couldn't save that image. Check your connection and try again."); } },
  bgFit:async v=>{ const p=S.bgPage||S.page||1, k=S.bgs["p"+p]?"p"+p:"all"; await setBg(k,{...S.bgs[k],fit:v}); render(); },
  bgAll:async()=>{ const p=S.bgPage||S.page||1, b=S.bgs["p"+p]; if(!b) return; await setBg("all",b); for(const k of Object.keys(S.bgs)) if(k!=="all") await setBg(k,null); toast("Using this image on all 50 pages."); render(); },
  bgRemove:async()=>{ const p=S.bgPage||S.page||1; await setBg("p"+p,null); render(); }, bgRemoveAll:async()=>{ await setBg("all",null); render(); },
  signout:(v,el)=>{ if(!armed(el,"Tap again to sign out")) return; window.claude.signOut().then(()=>location.reload()); },
  editBiz:v=>editBiz(v||null), bSave:saveBiz,
  bDelete:async(v,el)=>{ if(!armed(el,"Tap again to delete for good")) return; try{ await DB.doc("mdVenues/"+S.edit.id).delete(); closeSheet(); toast("Deleted."); }catch(e){ toast("Couldn't delete."); } },
  bHere:async()=>{ try{ const p=await getPos(); $("#b_lat").value=p.lat.toFixed(6); $("#b_lng").value=p.lng.toFixed(6); }catch(e){ toast("Allow location access first."); } },
  bMonth:()=>{ const d=new Date(); d.setMonth(d.getMonth()+1); $("#b_paid").value=d.toISOString().slice(0,10); $("#b_active").checked=true; },
  bLogo:async(v,el)=>{ const f=await pickFile(); if(!f) return; S.edit.logo=await shrink(f,256,.8); el.textContent="Logo added"; },
  bBanner:async(v,el)=>{ const f=await pickFile(); if(!f) return; S.edit.banner=await shrink(f,900,.72); el.textContent="Banner added"; },
  addItem:k=>{ const box=$("#ed_"+k); box.insertAdjacentHTML("beforeend",itemRow(k,box.children.length,{})); box.lastElementChild.querySelector("input").focus(); },
  delItem:(v,el)=>el.closest(".erow").remove()
};
function renderDiscoverPreload(){ DB.collection("mdCards").limit(500).get().then(s=>{ S.allCards=s.docs.map(d=>({id:d.id,...d.data()})); if(S.tab==="admin") renderAdmin(); }).catch(()=>{}); }

document.addEventListener("click",e=>{ const el=e.target.closest("[data-a]"); if(!el) return; if(e.target.closest("#sheet")&&e.target.id==="sheet") return; const f=ACT[el.dataset.a]; if(f&&el.tagName!=="INPUT"){ e.preventDefault(); f(el.dataset.v,el); } });
document.addEventListener("change",e=>{ const el=e.target; if(el.matches('input[data-a="visible"]')) ACT.visible(null,el);
  if(el.id==="bgpage"){ S.bgPage=+el.value; renderMe(); }
  if(el.id==="bgdim"){ const p=S.bgPage||S.page||1, k=S.bgs["p"+p]?"p"+p:"all"; setBg(k,{...S.bgs[k],dim:+el.value}).then(()=>{ if(S.tab==="me") renderMe(); }); }
  if(el.id==="pname"){ const p=S.bgPage||S.page||1; const t=el.value.trim().slice(0,24); if(t) S.dex.pnames[p]=t; else delete S.dex.pnames[p]; save(); } });
document.addEventListener("input",e=>{ if(e.target.id==="q"){ S.q=e.target.value; renderDiscover(); } if(e.target.id==="bgdim"){ const d=$("#dimv"); if(d) d.textContent=e.target.value+"%"; } });
$("#sheet").addEventListener("click",e=>{ if(e.target.id==="sheet") closeSheet(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ if($("#classic")) closeClassic(); else closeSheet(); } });

function openDeepLink(){ const q=new URLSearchParams(location.search), b=q.get("b"), p=q.get("p"); if(!b&&!p) return;
  history.replaceState(null,"",appUrl());
  if(p){ if(p===ME){ S.tab="pages"; render(); goPage(1); } else openPlayer(p); return; }
  let tries=0; const go=()=>{ if(S.venues.some(x=>x.id===b)) return openBiz(b); if(++tries<20) return setTimeout(go,300); toast("That business isn't on MyDex anymore."); }; go(); }
/* ---------------- start ---------------- */
async function start(){
  if(!window.claude||!window.claude.use){ $("#bootmsg").textContent="MyDex couldn't connect. Check your internet and reload."; return; }
  const [u,db]=await Promise.all([window.claude.use("user"),window.claude.use("db")]);
  USER=u; DB=db; ME=u?await u.id():null;
  if(!u||!db||!ME){ $("#bootmsg").textContent="Sign in to open your MyDex."; return; }
  try{ ADMIN=!!(await u.isOwner()); }catch(e){}
  try{ const s=await db.doc("data/users/"+ME+"/save").get(); if(s.exists&&s.data().name) NAME=String(s.data().name); }catch(e){}
  if(NAME==="Runner") NAME=(await u.name())||"Runner";
  try{ const s=await db.doc("data/users/"+ME+"/dex2").get(); if(s.exists){ const d=s.data(); S.dex={...S.dex,...d,look:{...S.dex.look,...(d.look||{})},pages:d.pages||{},pnames:d.pnames||{}}; } }catch(e){}
  try{ const s=await db.collection("data/users/"+ME).get(); s.docs.forEach(d=>{ if(d.id.startsWith("dexbg_")){ const b=d.data(); if(b&&b.img) S.bgs[d.id.slice(6)]=b; } }); }catch(e){}
  // Bridge for the classic MyDex editor (same as inside NEON HARVEST).
  window.NHMYDEX={ nameIssue:n=>{ const c=String(n||"").replace(/\s+/g," ").trim(); const l=Array.from(c).length; if(l<3) return "Use at least 3 characters."; if(l>16) return "Keep it to 16 characters or fewer."; if(["vex","admin","staff","system","moderator","owner","anthropic","claude"].includes(c.toLowerCase())||(c.toLowerCase()==="rassir"&&!ADMIN)) return "That name is reserved."; return null; },
    db:()=>DB, uid:()=>ME, name:()=>NAME, isAdmin:()=>ADMIN, close:closeClassic, toast, art:()=>"",
    forgeList:()=>({items:[],weapons:[],wardrobe:[],vehicles:[],parts:[],pcs:[],drugs:[],pets:[]}), online:()=>[], forgeCan:()=>false, forgePay:()=>{} };
  DB.doc("mdCards/"+ME).onSnapshot(s=>{ S.card=s.exists?s.data():null; if(S.card) S.cards[ME]=S.card; if(S.tab==="pages"||S.tab==="me") render(); },()=>{});
  DB.doc("hfcCards/"+ME).onSnapshot(s=>{ S.fc=s.exists?s.data():null; if(S.tab==="pages") renderPages(); },()=>{});
  DB.doc("cscCards/"+ME).onSnapshot(s=>{ S.sc=s.exists?s.data():null; if(S.tab==="pages") renderPages(); },()=>{});
  DB.collection("mdVenues").onSnapshot(s=>{ S.venues=s.docs.map(d=>({id:d.id,...d.data()})); render(); },()=>{});
  $("#boot").hidden=true; $("#app").hidden=false; render();
  $("#pages").addEventListener("scroll",()=>{ clearTimeout(S.scT); S.scT=setTimeout(updIndicator,60); },{passive:true});
  if(S.dex.radarOn) getPos().then(()=>{ watchPres(); pushPres(); }).catch(()=>{});
  openDeepLink();
}
start().catch(e=>{ console.error(e); $("#bootmsg").textContent="Something went wrong loading MyDex. Reload to try again."; });
})();
