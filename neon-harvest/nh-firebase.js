/* NEON HARVEST: Firebase connector.
   Gives the game the same window.claude.use("user" | "db" | "room" | "assets") interface it uses on claude.ai,
   backed by Firebase Auth (Google + email/password), Cloud Firestore (saves, trading, shops) and
   Realtime Database (live presence + multiplayer events). */
(function(){
  "use strict";
  const CFG = window.NH_FIREBASE_CONFIG || {};
  const OWNER = String(window.NH_OWNER_EMAIL || "").toLowerCase();
  const configured = !!(CFG.apiKey && CFG.projectId && CFG.databaseURL && !/YOUR_/.test(CFG.apiKey + CFG.projectId + CFG.databaseURL));

  /* ---------- small UI helpers ---------- */
  const css = `
  #nh-auth{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px;
    background:radial-gradient(ellipse at 50% 30%,rgba(255,63,168,.25),transparent 60%),linear-gradient(180deg,rgba(11,7,22,.92),rgba(11,7,22,.98));
    font-family:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;color:#e9e2ff}
  #nh-auth[hidden]{display:none!important}
  #nh-auth .card{width:min(420px,100%);background:rgba(21,14,38,.95);border:1px solid #3a2a5c;box-shadow:0 0 60px rgba(255,63,168,.25);padding:24px 22px;display:flex;flex-direction:column;gap:12px}
  #nh-auth .logo{font-family:"Silkscreen","Courier New",monospace;font-size:clamp(26px,7vw,38px);color:#ff3fa8;text-shadow:0 0 14px #ff3fa8;text-align:center;line-height:1}
  #nh-auth .sub{font-family:"Silkscreen","Courier New",monospace;font-size:10px;letter-spacing:.16em;color:#38e8ff;text-align:center}
  #nh-auth .tabs{display:flex;gap:6px} #nh-auth .tabs button{flex:1}
  #nh-auth button,#nh-auth input{font-family:inherit;font-size:14px}
  #nh-auth button{background:#150e26;color:#e9e2ff;border:1px solid #3a2a5c;padding:10px 12px;cursor:pointer}
  #nh-auth button:hover{border-color:#38e8ff}
  #nh-auth button[aria-pressed="true"]{border-color:#38e8ff;color:#38e8ff}
  #nh-auth .hot{border-color:#ff3fa8;color:#fff;box-shadow:0 0 10px rgba(255,63,168,.35) inset}
  #nh-auth .google{display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#1a1428;border-color:#fff;font-weight:600}
  #nh-auth label{display:flex;flex-direction:column;gap:4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9a8cc0}
  #nh-auth input{background:#0d0818;color:#e9e2ff;border:1px solid #3a2a5c;padding:9px 10px;text-transform:none;letter-spacing:0}
  #nh-auth input:focus-visible,#nh-auth button:focus-visible{outline:2px solid #38e8ff;outline-offset:1px}
  #nh-auth .or{display:flex;align-items:center;gap:10px;color:#9a8cc0;font-size:11px} #nh-auth .or::before,#nh-auth .or::after{content:"";flex:1;height:1px;background:#3a2a5c}
  #nh-auth .msg{min-height:1.2em;font-size:12px;color:#ff5a4a} #nh-auth .msg:empty{display:none}
  #nh-auth button,#nh-auth input{touch-action:manipulation} @media (pointer:coarse){#nh-auth input{font-size:16px}#nh-auth button{min-height:44px}} #nh-auth .msg.ok{color:#43f0a4}
  #nh-auth .link{background:none;border:0;padding:0;color:#38e8ff;text-decoration:underline;font-size:12px;align-self:flex-start}
  #nh-auth .note{font-size:11px;color:#9a8cc0;text-align:center}`;
  function ensureStyle(){ if(document.getElementById("nh-auth-style")) return; const s=document.createElement("style"); s.id="nh-auth-style"; s.textContent=css; document.head.appendChild(s); }
  function h(tag, props, ...kids){ const e=document.createElement(tag); for(const [k,v] of Object.entries(props||{})){ if(k==="text") e.textContent=v; else if(k.startsWith("on")) e[k]=v; else e.setAttribute(k,v); } for(const c of kids) if(c!=null) e.append(c); return e; }

  if(!configured){
    // No Firebase project connected yet: the game runs in solo mode on this device.
    window.addEventListener("DOMContentLoaded",()=>{ ensureStyle();
      const ov=h("div",{id:"nh-auth"}); const card=h("div",{class:"card"});
      card.append(h("div",{class:"logo",text:"NEON HARVEST"}),h("div",{class:"sub",text:"SETUP NEEDED"}),
        h("p",{text:"Multiplayer and accounts aren't connected yet. The game owner needs to add a Firebase project to firebase-config.js (see the README)."}),
        h("button",{class:"hot",type:"button",text:"Play solo on this device",onclick:()=>ov.remove()}));
      ov.append(card); document.body.appendChild(ov); });
    return;
  }

  firebase.initializeApp(CFG);
  const auth=firebase.auth(), fs=firebase.firestore(), rt=firebase.database();
  const TAB=Math.random().toString(36).slice(2,10)+Date.now().toString(36);
  let current=null, serverOffset=0, readyResolve; const ready=new Promise(r=>readyResolve=r);
  rt.ref(".info/serverTimeOffset").on("value",s=>{ serverOffset=+s.val()||0; });
  const serverNow=()=>Date.now()+serverOffset;
  const displayName=u=>u.displayName||String(u.email||"").split("@")[0]||"Runner";
  const isOwner=()=>!!(current&&current.email&&current.email.toLowerCase()===OWNER&&current.emailVerified);

  /* ---------- sign-in screen ---------- */
  let ov=null;
  const ERR={"auth/invalid-email":"That email address doesn't look right.","auth/missing-password":"Enter a password.","auth/weak-password":"Use at least 6 characters for your password.",
    "auth/email-already-in-use":"An account with that email already exists. Sign in instead.","auth/invalid-credential":"Wrong email or password.","auth/wrong-password":"Wrong email or password.",
    "auth/user-not-found":"No account with that email. Create one first.","auth/too-many-requests":"Too many attempts. Wait a minute and try again.","auth/popup-closed-by-user":"The Google window was closed before signing in.",
    "auth/unauthorized-domain":"This website isn't on the Firebase project's authorized domains list yet (see the README).","auth/operation-not-allowed":"This sign-in method isn't turned on in the Firebase project yet (see the README).",
    "auth/network-request-failed":"Couldn't reach the sign-in server. Check your connection."};
  const errText=e=>ERR[e&&e.code]||(e&&e.message)||"Something went wrong. Try again.";
  function showAuth(mode){ ensureStyle(); if(ov) ov.remove(); mode=mode||"signin";
    ov=h("div",{id:"nh-auth",role:"dialog","aria-label":"Sign in to NEON HARVEST"}); const card=h("div",{class:"card"});
    const msg=h("div",{class:"msg",role:"status"}); const say=(t,ok)=>{ msg.textContent=t; msg.className="msg"+(ok?" ok":""); };
    const tabs=h("div",{class:"tabs"}); for(const [k,l] of [["signin","Sign in"],["signup","Create account"]]) tabs.append(h("button",{type:"button","aria-pressed":String(mode===k),text:l,onclick:()=>showAuth(k)}));
    const g=h("button",{class:"google",type:"button",onclick:async()=>{ say(""); try{ await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }catch(e){ if(e&&(e.code==="auth/popup-blocked"||e.code==="auth/operation-not-supported-in-this-environment")){ try{ await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider()); }catch(e2){ say(errText(e2)); } } else say(errText(e)); } }});
    g.innerHTML='<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
    g.append(document.createTextNode("Continue with Google"));
    const email=h("input",{id:"nh-email",type:"email",autocomplete:"email",placeholder:"you@example.com"}); const pass=h("input",{id:"nh-pass",type:"password",autocomplete:mode==="signup"?"new-password":"current-password",placeholder:mode==="signup"?"At least 6 characters":"Your password"});
    const go=h("button",{class:"hot",type:"submit",text:mode==="signup"?"Create account":"Sign in"});
    const form=h("form",{style:"display:flex;flex-direction:column;gap:10px"},h("label",{},"Email",email),h("label",{},"Password",pass),go);
    form.onsubmit=async e=>{ e.preventDefault(); say(""); go.disabled=true; try{ if(mode==="signup") await auth.createUserWithEmailAndPassword(email.value.trim(),pass.value); else await auth.signInWithEmailAndPassword(email.value.trim(),pass.value); }catch(err){ say(errText(err)); go.disabled=false; } };
    const forgot=h("button",{class:"link",type:"button",text:"Forgot your password?",onclick:async()=>{ if(!email.value.trim()){ say("Type your email above first."); return; } try{ await auth.sendPasswordResetEmail(email.value.trim()); say("Password reset email sent. Check your inbox.",true); }catch(e){ say(errText(e)); } }});
    card.append(h("div",{class:"logo",text:"NEON HARVEST"}),h("div",{class:"sub",text:"SECTOR 9 · CHIPS · PARTS · RIGS"}),tabs,g,h("div",{class:"or",text:"or use email"}),form);
    if(mode==="signin") card.append(forgot); card.append(msg,h("p",{class:"note",text:"NEON HARVEST is for players 21 and older. Your account keeps your stash, apartment, pickup codes and winnings on every device."}));
    ov.append(card); document.body.appendChild(ov); setTimeout(()=>email.focus(),30); }
  function hideAuth(){ if(ov){ ov.remove(); ov=null; } }

  /* ---------- 21+ age check: asked once per account, before the game loads ---------- */
  // Only "confirmed 21+" and the time are stored, in the player's private save area. The birth date itself is never saved.
  function ageGate(u){ return new Promise(async resolve=>{
    const ref=fs.doc("data/users/"+u.uid+"/age/check"), memo="nh_age_ok_"+u.uid;
    try{ if(localStorage.getItem(memo)==="1") return resolve(true); }catch(e){}
    try{ const s=await ref.get(); if(s.exists&&s.data().ok===true){ try{ localStorage.setItem(memo,"1"); }catch(e){} return resolve(true); } }catch(e){}
    ensureStyle(); if(ov) ov.remove();
    ov=h("div",{id:"nh-auth",role:"dialog","aria-label":"Confirm your age"}); const card=h("div",{class:"card"});
    const msg=h("div",{class:"msg",role:"status"});
    const dob=h("input",{id:"nh-dob",type:"date",autocomplete:"bday",max:new Date().toISOString().slice(0,10)});
    const go=h("button",{class:"hot",type:"submit",text:"Continue"});
    const form=h("form",{style:"display:flex;flex-direction:column;gap:10px"},h("label",{},"Date of birth",dob),go);
    form.onsubmit=async e=>{ e.preventDefault(); msg.textContent="";
      const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dob.value); if(!m){ msg.textContent="Enter your date of birth."; return; }
      const y=+m[1], mo=+m[2], d=+m[3], now=new Date(); let age=now.getFullYear()-y; if(now.getMonth()+1<mo||(now.getMonth()+1===mo&&now.getDate()<d)) age--;
      if(age<21){ card.innerHTML=""; card.append(h("div",{class:"logo",text:"NEON HARVEST"}),h("div",{class:"sub",text:"21+ ONLY"}),
          h("p",{text:"Sorry, NEON HARVEST is only for players 21 and older."}),h("button",{type:"button",text:"Sign out",onclick:()=>auth.signOut()})); return; }
      go.disabled=true; try{ await ref.set({ok:true,at:Date.now()}); }catch(err){ msg.textContent="Couldn't save that. Check your connection and try again."; go.disabled=false; return; }
      try{ localStorage.setItem(memo,"1"); }catch(e){} hideAuth(); resolve(true); };
    card.append(h("div",{class:"logo",text:"NEON HARVEST"}),h("div",{class:"sub",text:"21+ ONLY"}),
      h("p",{text:"NEON HARVEST is for adults 21 and older. Confirm your date of birth to continue. You'll only be asked once."}),form,msg,
      h("p",{class:"note",text:"Your birth date isn't saved, only that you're 21 or older. Smacked Shop pickups also require a photo ID."}),
      h("button",{class:"link",type:"button",text:"Sign out",onclick:()=>auth.signOut()}));
    ov.append(card); document.body.appendChild(ov); setTimeout(()=>dob.focus(),30); }); }

  auth.getRedirectResult().catch(()=>{});
  let signedInOnce=false;
  auth.onAuthStateChanged(async u=>{
    if(u){ current=u; hideAuth(); window.NH_ACCOUNT_LABEL="Signed in as "+(u.email||displayName(u));
      fs.doc("profiles/"+u.uid).set({name:displayName(u),at:Date.now()},{merge:true}).catch(()=>{});
      if(!signedInOnce){ signedInOnce=true; if(!document.body) await new Promise(r=>window.addEventListener("DOMContentLoaded",r,{once:true})); await ageGate(u); startPresence(); readyResolve(u); } }
    else { if(signedInOnce){ location.reload(); return; } current=null; if(document.body) showAuth(); else window.addEventListener("DOMContentLoaded",()=>showAuth()); } });

  /* ---------- Firestore <-> game data (nested arrays are encoded, Firestore can't store them) ---------- */
  const enc=(v,inArr)=>Array.isArray(v)?(inArr?{_a_:v.map(x=>enc(x,true))}:v.map(x=>enc(x,true))):(v&&typeof v==="object")?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>[k,enc(x,false)])):v;
  const dec=v=>Array.isArray(v)?v.map(dec):(v&&typeof v==="object")?(Object.keys(v).length===1&&Array.isArray(v._a_)?v._a_.map(dec):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,dec(x)]))):v;
  const clean=d=>enc(JSON.parse(JSON.stringify(d===undefined?null:d)),false);
  const wrapDoc=s=>({id:s.id,exists:!!s.exists,data:()=>s.exists?dec(s.data()):undefined,metadata:{fromCache:!!(s.metadata&&s.metadata.fromCache),hasPendingWrites:!!(s.metadata&&s.metadata.hasPendingWrites)}});
  const wrapQuery=qs=>{ const docs=qs.docs.map(wrapDoc); return {docs,size:docs.length,empty:!docs.length,metadata:{fromCache:!!qs.metadata.fromCache,hasPendingWrites:!!qs.metadata.hasPendingWrites},docChanges:()=>qs.docChanges().map(c=>({type:c.type,doc:wrapDoc(c.doc),oldIndex:c.oldIndex,newIndex:c.newIndex}))}; };
  const errOut=fn=>e=>{ if(fn) fn({code:(e&&e.code)||"unavailable",message:(e&&e.message)||"error"}); };
  function docRef(path){ const r=fs.doc(path); return { id:r.id, path,
    get:async()=>wrapDoc(await r.get()), set:d=>r.set(clean(d)), update:d=>r.update(clean(d)), delete:()=>r.delete(),
    onSnapshot:(next,err)=>r.onSnapshot(s=>next(wrapDoc(s)),errOut(err)),
    acquire:async o=>{ const ttl=Math.max(1000,Math.min(600000,(o&&o.ttlMs)||30000));
      try{ return await fs.runTransaction(async tx=>{ const s=await tx.get(r); const L=s.exists?s.data()._lease:null; const now=Date.now();
        if(L&&L.exp>now&&L.holder!==o.holder) return {acquired:false,expiresAt:new Date(L.exp).toISOString()};
        const upd={_lease:{holder:String(o.holder),exp:now+ttl},...clean(o.data||{})}; if(s.exists) tx.update(r,upd); else tx.set(r,upd);
        return {acquired:true,expiresAt:new Date(now+ttl).toISOString()}; }); }catch(e){ return {acquired:false}; } },
    collection:c=>collRef(path+"/"+c) }; }
  function query(q){ return { where:(f,op,v)=>query(q.where(f,op,v)), orderBy:(f,d)=>query(q.orderBy(f,d||"asc")), limit:n=>query(q.limit(n)),
    get:async()=>wrapQuery(await q.get()), onSnapshot:(next,err)=>q.onSnapshot(s=>next(wrapQuery(s)),errOut(err)) }; }
  function collRef(path){ const c=fs.collection(path); return Object.assign(query(c),{ doc:id=>docRef(path+"/"+(id||c.doc().id)), add:async d=>{ const r=await c.add(clean(d)); return docRef(path+"/"+r.id); } }); }
  const dbNS=Object.freeze({doc:docRef,collection:collRef});

  /* ---------- accounts ---------- */
  const profCache={};
  const userNS=Object.freeze({
    id:async()=>current?current.uid:null, name:async()=>current?displayName(current):"", email:async()=>current?(current.email||null):null, avatarUrl:async()=>current?(current.photoURL||null):null,
    me:async()=>current?{id:current.uid,name:displayName(current),avatarUrl:current.photoURL||null,email:current.email||null}:{id:null,name:"",avatarUrl:null,email:null},
    isOwner:async()=>isOwner(), canEdit:async()=>isOwner(), can:async()=>true, search:async()=>[],
    profiles:async ids=>{ ids=[].concat(ids||[]).filter(x=>typeof x==="string"&&x); const out={};
      await Promise.all(ids.map(async id=>{ if(!profCache[id]){ try{ const s=await fs.doc("profiles/"+id).get(); profCache[id]={id,name:s.exists?String(s.data().name||""):"",guest:false}; }catch(e){ return; } } out[id]=profCache[id]; }));
      for(const id of ids) if(!out[id]) out[id]={id,name:"",guest:false}; return out; } });

  /* ---------- live multiplayer (Realtime Database) ---------- */
  const peerMap=new Map(), peerHandlers=[], topicHandlers={}; let myPres={}, presRef=null, leaving=false;
  const mkPeer=(key,v)=>{ let p={}; try{ p=JSON.parse(v.p||"{}"); }catch(e){} return {peer:key,by:v.by||null,isMe:!!current&&v.by===current.uid,sameTab:key===TAB,kind:"viewer",guest:false,presence:Object.freeze(p),updatedAt:v.t?(+v.t-serverOffset):Date.now()}; };
  const fire=ch=>{ const peers=[...peerMap.values()]; for(const h of peerHandlers){ try{ h({peers,...ch}); }catch(e){ console.error(e); } } };
  const writePres=()=>{ if(!current||!presRef) return Promise.resolve(); return presRef.set({by:current.uid,p:JSON.stringify(myPres),t:firebase.database.ServerValue.TIMESTAMP}).catch(()=>{}); };
  function startPresence(){
    presRef=rt.ref("presence/"+TAB);
    rt.ref(".info/connected").on("value",s=>{ if(s.val()===true&&!leaving){ presRef.onDisconnect().remove(); writePres(); } });
    // If our record disappears while this tab is still open, write it back.
    presRef.on("value",s=>{ if(!s.exists()&&current&&!leaving) writePres(); });
    const bye=()=>{ leaving=true; try{ presRef.remove(); }catch(e){} };
    window.addEventListener("pagehide",bye); window.addEventListener("beforeunload",bye);
    window.addEventListener("pageshow",e=>{ if(e.persisted&&leaving){ leaving=false; writePres(); } });
    const all=rt.ref("presence");
    all.on("child_added",s=>{ const v=s.val(); if(!v) return; const p=mkPeer(s.key,v); peerMap.set(s.key,p); fire({joined:[p],left:[],updated:[]}); });
    all.on("child_changed",s=>{ const v=s.val(); if(!v) return; const p=mkPeer(s.key,v); peerMap.set(s.key,p); fire({joined:[],left:[],updated:[p]}); });
    all.on("child_removed",s=>{ const p=peerMap.get(s.key); peerMap.delete(s.key); if(p) fire({joined:[],left:[p],updated:[]}); });
    rt.ref("events").orderByChild("t").startAt(serverNow()-3000).on("child_added",s=>{ const v=s.val(); if(!v) return; const hs=topicHandlers[v.topic]; if(!hs||!hs.length) return;
      let data=null; try{ data=JSON.parse(v.d); }catch(e){ return; }
      const m={topic:v.topic,data,peer:v.peer,by:v.by||null,isMe:!!current&&v.by===current.uid,sameTab:v.peer===TAB,kind:"viewer",guest:false};
      for(const h of hs){ try{ h(m); }catch(e){ console.error(e); } } });
    setInterval(()=>{ rt.ref("events").orderByChild("t").endAt(serverNow()-120000).limitToFirst(40).once("value",s=>{ s.forEach(c=>{ c.ref.remove().catch(()=>{}); }); }); },30000);
  }
  const roomNS=Object.freeze({
    presence:async patch=>{ for(const [k,v] of Object.entries(patch||{})){ if(v===null||v===undefined) delete myPres[k]; else myPres[k]=v; } await writePres(); },
    peers:()=>[...peerMap.values()],
    onPeers:(h,onErr)=>{ peerHandlers.push(h); setTimeout(()=>h({peers:[...peerMap.values()],joined:[...peerMap.values()],left:[],updated:[]}),0); return ()=>{ const i=peerHandlers.indexOf(h); if(i>=0) peerHandlers.splice(i,1); }; },
    emit:async(topic,data)=>{ if(!current) return; const d=JSON.stringify(data===undefined?null:data); if(d.length>3900) throw {code:"invalid_argument",message:"data too large"};
      await rt.ref("events").push({by:current.uid,peer:TAB,topic:String(topic),d,t:firebase.database.ServerValue.TIMESTAMP}); },
    on:(topic,h)=>{ (topicHandlers[topic]=topicHandlers[topic]||[]).push(h); return ()=>{ const a=topicHandlers[topic]; const i=a.indexOf(h); if(i>=0) a.splice(i,1); }; },
    connected:()=>true });

  /* ---------- photo uploads for Smacked Shop (stored as small images in Firestore) ---------- */
  const assetsNS=Object.freeze({
    upload:async blob=>{ if(!isOwner()) throw {code:"not_granted",message:"Only the shop owner can upload."};
      const url=await new Promise((res,rej)=>{ const img=new Image(); const u=URL.createObjectURL(blob); img.onload=()=>{ const m=480, sc=Math.min(1,m/Math.max(img.width,img.height)); const c=document.createElement("canvas"); c.width=Math.round(img.width*sc); c.height=Math.round(img.height*sc); c.getContext("2d").drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg",.82)); }; img.onerror=()=>rej({code:"invalid_argument",message:"That file isn't an image."}); img.src=u; });
      const r=await fs.collection("assets").add({data:url,by:current.uid,at:Date.now()}); return {id:r.id,url,sizeBytes:url.length,contentType:"image/jpeg"}; },
    list:async()=>({assets:[],usage:0}), delete:async id=>{ await fs.doc("assets/"+id).delete(); } });

  const NS={user:userNS,db:dbNS,room:roomNS,assets:assetsNS};
  window.claude=Object.freeze({ use:async name=>{ await ready; return NS[name]||null; }, signOut:async()=>{ leaving=true; try{ if(presRef) await presRef.remove(); }catch(e){} return auth.signOut(); }, provider:"firebase" });
})();
