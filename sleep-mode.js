(()=>{
  'use strict';

  const FALLBACK_KEY='essenTracker.sleep.v1';
  const VERSION='66';

  function appState(){
    try{return (typeof state!=='undefined'&&state&&typeof state==='object')?state:null}catch(_){return null}
  }
  function appSave(){
    const s=appState();
    if(s){
      try{if(typeof save==='function'){save();return}}catch(_){ }
      try{localStorage.setItem('essenTracker.v01',JSON.stringify(s));return}catch(_){ }
    }
    try{localStorage.setItem(FALLBACK_KEY,JSON.stringify({sleepSessions:getSessions()}))}catch(_){ }
  }
  function getSessions(){
    const s=appState();
    if(s){
      if(!Array.isArray(s.sleepSessions))s.sleepSessions=[];
      return s.sleepSessions;
    }
    try{
      const raw=JSON.parse(localStorage.getItem(FALLBACK_KEY)||'{}');
      return Array.isArray(raw.sleepSessions)?raw.sleepSessions:[];
    }catch(_){return []}
  }
  function setFallbackSessions(list){
    if(appState())return;
    try{localStorage.setItem(FALLBACK_KEY,JSON.stringify({sleepSessions:list}))}catch(_){ }
  }
  function uid(){
    try{return crypto.randomUUID()}catch(_){return 'sleep-'+Date.now()+'-'+Math.random().toString(16).slice(2)}
  }
  function nowIso(){return new Date().toISOString()}
  function localDateString(d=new Date()){
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  function timeLabel(iso){
    if(!iso)return '–';
    try{return new Date(iso).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}catch(_){return '–'}
  }
  function durationLabel(start,end=new Date().toISOString()){
    const a=new Date(start),b=new Date(end);if(!Number.isFinite(+a)||!Number.isFinite(+b))return '';
    const mins=Math.max(0,Math.round((b-a)/60000)),h=Math.floor(mins/60),m=mins%60;
    return h?`${h} Std. ${m} Min.`:`${m} Min.`;
  }
  function activeSession(){
    const list=getSessions();
    for(let i=list.length-1;i>=0;i--)if(!list[i].endedAt)return list[i];
    return null;
  }
  function lastEvent(session){return session?.events?.[session.events.length-1]||null}
  function toast(msg){
    try{if(typeof showToast==='function'){showToast(msg);return}}catch(_){ }
    console.info(msg);
  }
  function persist(){
    const list=getSessions();setFallbackSessions(list);appSave();render();
  }

  function startSleep(){
    let current=activeSession();
    if(current){focusCard();return}
    const at=nowIso(),session={
      id:uid(),startedAt:at,startDate:localDateString(),endedAt:null,
      events:[{type:'sleep',at,source:'manual'}]
    };
    getSessions().push(session);
    closeTypeDialog();persist();toast('Schlaf gestartet');
    requestAnimationFrame(()=>focusCard());
  }
  function markWake(){
    const session=activeSession();if(!session)return;
    const last=lastEvent(session);
    if(last?.type==='wake'){render();return}
    if(last?.type==='up')return;
    session.events=session.events||[];
    session.events.push({type:'wake',at:nowIso(),reason:'',source:'manual'});
    persist();toast('Aufgewacht gespeichert');
  }
  function setWakeReason(reason){
    const session=activeSession();if(!session)return;
    const events=session.events||[];
    for(let i=events.length-1;i>=0;i--){
      if(events[i].type==='wake'){events[i].reason=reason;break}
    }
    persist();
  }
  function markResleep(){
    const session=activeSession();if(!session)return;
    const last=lastEvent(session);
    if(last?.type==='sleep')return;
    session.events=session.events||[];
    session.events.push({type:'sleep',at:nowIso(),source:'manual'});
    persist();toast('Wieder eingeschlafen gespeichert');
  }
  function markUp(){
    const session=activeSession();if(!session)return;
    const at=nowIso(),last=lastEvent(session);
    session.events=session.events||[];
    if(last?.type==='sleep')session.events.push({type:'wake',at,reason:'',implicit:true,source:'manual'});
    session.events.push({type:'up',at,source:'manual'});
    session.endedAt=at;
    persist();toast('Aufgestanden – Schlaf gespeichert');
  }
  function undoLast(){
    const session=activeSession();if(!session||!Array.isArray(session.events))return;
    if(session.events.length<=1){
      const list=getSessions(),idx=list.findIndex(x=>x.id===session.id);
      if(idx>=0)list.splice(idx,1);
      persist();toast('Schlafstart zurückgenommen');return;
    }
    session.events.pop();
    persist();toast('Letzten Schlaf-Schritt zurückgenommen');
  }

  function closeTypeDialog(){
    const dlg=document.querySelector('#typeDialog');
    try{if(dlg?.open)dlg.close()}catch(_){ }
  }
  function focusCard(){
    closeTypeDialog();
    const card=document.querySelector('#sleepModeCard');
    if(card){card.scrollIntoView({behavior:'smooth',block:'center'});card.classList.add('sleep-pulse');setTimeout(()=>card.classList.remove('sleep-pulse'),700)}
  }

  function injectStyle(){
    if(document.querySelector('#sleepModeStyle'))return;
    const style=document.createElement('style');style.id='sleepModeStyle';style.textContent=`
      .sleep-mode-card{margin:0 0 12px;padding:15px 15px 13px;border:1px solid var(--line,#e2d8c9);border-radius:19px;background:linear-gradient(145deg,rgba(245,246,237,.98),rgba(255,250,242,.96));box-shadow:var(--shadow,0 8px 22px rgba(77,64,48,.08));color:var(--ink,#2f2d29);position:relative;overflow:hidden}
      .sleep-mode-card[hidden]{display:none!important}.sleep-mode-card::after{content:'☾';position:absolute;right:12px;top:-18px;font-family:Georgia,serif;font-size:78px;color:rgba(111,123,93,.10);transform:rotate(-12deg);pointer-events:none}
      .sleep-mode-head{position:relative;z-index:1;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.sleep-mode-kicker{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted,#7d786f);font-weight:800}.sleep-mode-title{margin:3px 0 2px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:500}.sleep-mode-sub{font-size:12px;color:var(--muted,#7d786f);line-height:1.35}.sleep-mode-icon{font-size:26px;color:var(--accent-dark,#6f7b5d);padding-right:8px}
      .sleep-mode-history{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:6px;margin:11px 0 10px}.sleep-mode-chip{border:1px solid rgba(150,145,132,.22);border-radius:999px;background:rgba(255,255,255,.46);padding:5px 8px;font-size:10.5px;color:#6f6a62}.sleep-mode-chip b{font-weight:800;color:#55534e}
      .sleep-mode-actions{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:8px}.sleep-mode-btn{border:1px solid var(--line,#e2d8c9);border-radius:13px;padding:11px 10px;background:#fffaf4;color:var(--ink,#2f2d29);font-weight:800}.sleep-mode-btn.primary{background:var(--accent-dark,#6f7b5d);border-color:var(--accent-dark,#6f7b5d);color:#fff}.sleep-mode-btn.full{grid-column:1/-1}.sleep-mode-btn.tiny{padding:7px 9px;font-size:11px;font-weight:700;background:transparent;color:var(--muted,#7d786f)}
      .sleep-wake-reason{position:relative;z-index:1;margin-top:10px;padding-top:10px;border-top:1px dashed rgba(130,118,101,.25)}.sleep-wake-reason small{display:block;margin-bottom:7px;color:var(--muted,#7d786f);font-size:11px}.sleep-reason-row{display:flex;flex-wrap:wrap;gap:6px}.sleep-reason{border:1px solid var(--line,#e2d8c9);border-radius:999px;background:#fffaf4;padding:7px 9px;font-size:11px;color:#5e5a54}.sleep-reason.active{background:var(--accent-soft,#e8ecdf);border-color:#b8c2a8;color:var(--accent-dark,#6f7b5d);font-weight:800}
      .sleep-type-btn .type-icon{color:var(--accent-dark,#6f7b5d)}.sleep-pulse{animation:sleepPulse .65s ease}@keyframes sleepPulse{50%{transform:scale(1.012);box-shadow:0 0 0 5px rgba(143,154,121,.16),var(--shadow,0 8px 22px rgba(77,64,48,.08))}}
      @media(max-width:390px){.sleep-mode-actions{grid-template-columns:1fr}.sleep-mode-btn.full{grid-column:auto}.sleep-mode-title{font-size:20px}}
    `;document.head.appendChild(style);
  }

  function injectTypeButton(){
    const grid=document.querySelector('#typeDialog .type-grid');if(!grid)return;
    let btn=document.querySelector('#sleepTypeButton');
    if(!btn){
      btn=document.createElement('button');btn.type='button';btn.id='sleepTypeButton';btn.className='type-btn sleep-type-btn';
      btn.innerHTML='<span class="type-icon">☾</span><b>Schlaf</b><small id="sleepTypeHint">Schlafen gehen</small>';
      btn.addEventListener('click',()=>activeSession()?focusCard():startSleep());grid.appendChild(btn);
    }
    const hint=btn.querySelector('#sleepTypeHint'),session=activeSession(),last=lastEvent(session);
    if(hint)hint.textContent=!session?'Schlafen gehen':last?.type==='wake'?'Aufgewacht · Schlafkarte öffnen':'Schlaf läuft · Schlafkarte öffnen';
  }

  function injectCard(){
    if(document.querySelector('#sleepModeCard'))return;
    const today=document.querySelector('#todayView');if(!today)return;
    const card=document.createElement('section');card.id='sleepModeCard';card.className='sleep-mode-card';card.hidden=true;
    card.innerHTML=`
      <div class="sleep-mode-head"><div><div class="sleep-mode-kicker">Schlaf läuft</div><h3 id="sleepModeTitle" class="sleep-mode-title">Schlafen</h3><div id="sleepModeSub" class="sleep-mode-sub"></div></div><div class="sleep-mode-icon">☾</div></div>
      <div id="sleepModeHistory" class="sleep-mode-history"></div>
      <div id="sleepModeActions" class="sleep-mode-actions"></div>
      <div id="sleepWakeReason" class="sleep-wake-reason" hidden><small>Wie bist du aufgewacht?</small><div class="sleep-reason-row"><button type="button" class="sleep-reason" data-sleep-reason="alarm">Wecker</button><button type="button" class="sleep-reason" data-sleep-reason="self">von selbst</button><button type="button" class="sleep-reason" data-sleep-reason="other">andere Ursache</button></div></div>`;
    const week=document.querySelector('#weekStrip');
    if(week&&week.parentElement===today)week.insertAdjacentElement('afterend',card);else today.prepend(card);
    card.querySelectorAll('[data-sleep-reason]').forEach(b=>b.addEventListener('click',()=>setWakeReason(b.dataset.sleepReason)));
  }

  function eventChip(e){
    const labels={sleep:'eingeschlafen',wake:'aufgewacht',up:'aufgestanden'};
    return `<span class="sleep-mode-chip"><b>${labels[e.type]||e.type}</b> ${timeLabel(e.at)}</span>`;
  }

  function render(){
    injectStyle();injectTypeButton();injectCard();
    const version=document.querySelector('.version');if(version&&/v\d+/i.test(version.textContent||''))version.textContent='v'+VERSION;
    const card=document.querySelector('#sleepModeCard');if(!card)return;
    const session=activeSession();
    if(!session){card.hidden=true;injectTypeButton();return}
    card.hidden=false;
    const last=lastEvent(session),title=document.querySelector('#sleepModeTitle'),sub=document.querySelector('#sleepModeSub'),history=document.querySelector('#sleepModeHistory'),actions=document.querySelector('#sleepModeActions'),reasonBox=document.querySelector('#sleepWakeReason');
    const sleeping=last?.type==='sleep';
    const awake=last?.type==='wake';
    const lastWake=[...(session.events||[])].reverse().find(e=>e.type==='wake');
    if(title)title.textContent=sleeping?`Schlaf läuft seit ${timeLabel(last.at)}`:`Aufgewacht um ${timeLabel(last?.at)}`;
    if(sub)sub.textContent=`Begonnen um ${timeLabel(session.startedAt)} · bisher ${durationLabel(session.startedAt)}`;
    if(history)history.innerHTML=(session.events||[]).slice(-5).map(eventChip).join('');
    if(actions){
      actions.innerHTML=sleeping
        ?'<button type="button" class="sleep-mode-btn primary" data-sleep-action="wake">Aufgewacht</button><button type="button" class="sleep-mode-btn" data-sleep-action="up">Aufgestanden</button><button type="button" class="sleep-mode-btn tiny full" data-sleep-action="undo">Letzten Schritt zurück</button>'
        :'<button type="button" class="sleep-mode-btn primary" data-sleep-action="resleep">Wieder eingeschlafen</button><button type="button" class="sleep-mode-btn" data-sleep-action="up">Aufgestanden</button><button type="button" class="sleep-mode-btn tiny full" data-sleep-action="undo">Letzten Schritt zurück</button>';
      actions.querySelectorAll('[data-sleep-action]').forEach(b=>b.addEventListener('click',()=>{
        const a=b.dataset.sleepAction;if(a==='wake')markWake();else if(a==='resleep')markResleep();else if(a==='up')markUp();else if(a==='undo')undoLast();
      }));
    }
    if(reasonBox){reasonBox.hidden=!awake;reasonBox.querySelectorAll('[data-sleep-reason]').forEach(b=>b.classList.toggle('active',b.dataset.sleepReason===(lastWake?.reason||'')))}
    injectTypeButton();
  }

  function init(){
    injectStyle();injectTypeButton();injectCard();render();
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
    window.addEventListener('pageshow',render);
    setInterval(()=>{if(activeSession())render()},60000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
