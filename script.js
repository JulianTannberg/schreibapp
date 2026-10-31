
const KEY="essenTracker.v01";
const CELEBRATION_KEY="essenTracker.celebrations.v1";
const DEFAULT={
  entries:[],
  settings:{
    waterLabel:"Wasser",waterMl:700,beerStart:"2026-09-10",
    freeDays:{label:"Bierfreie Tage",start:"2026-09-10",mode:"beer"},
    freeGoals:[{id:"beer-free",label:"Bierfreie Tage",start:"2026-09-10",categoryId:"beer",enabled:true}],
    homeVisibility:{moon:true,weight:true,water:true,freeDays:true,calendarSpecial:true,quick:true,wellbeing:true,sticky:true},
    customEntryCategories:[],
    calendar:{dailyQuotes:true,moon:true,seasons:true,holidays:true,wheel:true,rauhnacht:true,farmers:true,schoolHolidays:true,customQuotes:[]},todoItems:[{id:"walk",label:"Spaziergang",enabled:true},{id:"move",label:"Bewegung",enabled:true},{id:"rest",label:"Ruhepause",enabled:true},{id:"evening",label:"Abendroutine",enabled:true}]},
  wellbeingDone:{},quoteChoices:{},itemTagMemory:{},mealPhotos:{},
  quick:[
    {label:"Wasser",sub:"700 ml",type:"drink",value:"Wasser",tag:"water",amountMl:700},
    {label:"Bauchschmerzen",sub:"jetzt",type:"symptom",value:"Bauchschmerzen"},
    {label:"Durchfall",sub:"jetzt",type:"symptom",value:"Durchfall"},
    {label:"Sodbrennenmittel",sub:"genommen",type:"medicine",value:"Sodbrennenmittel"}
  ]
};
let state=load();
let shownMonth=startMonth(new Date());
let selectedDate=localDate();
let editingIds=[];
let editingDate=null;
let printFilters=["all"];
let entryPhotoData="";
let removeEntryPhoto=false;

function cloneDefault(){return JSON.parse(JSON.stringify(DEFAULT))}
function load(){
  try{
    const x=JSON.parse(localStorage.getItem(KEY));
    if(!x)return cloneDefault();
    const base=cloneDefault();
    const xs=x.settings||{};
    return {...base,...x,
      wellbeingDone:(x.wellbeingDone&&typeof x.wellbeingDone==="object")?x.wellbeingDone:{},
      quoteChoices:(x.quoteChoices&&typeof x.quoteChoices==="object")?x.quoteChoices:{},
      itemTagMemory:(x.itemTagMemory&&typeof x.itemTagMemory==="object")?x.itemTagMemory:{},
      mealPhotos:(x.mealPhotos&&typeof x.mealPhotos==="object")?x.mealPhotos:{},
      settings:{
        ...base.settings,...xs,
        freeDays:{...base.settings.freeDays,...(xs.freeDays||{}),start:(xs.freeDays?.start||xs.beerStart||base.settings.freeDays.start)},
        freeGoals:(Array.isArray(xs.freeGoals)&&xs.freeGoals.length)?xs.freeGoals:[{id:"migrated-free",label:(xs.freeDays?.label||"Bierfreie Tage"),start:(xs.freeDays?.start||xs.beerStart||base.settings.freeDays.start),categoryId:(xs.freeDays?.mode==="alcohol"?"alcohol":"beer"),enabled:true}],
        homeVisibility:{...base.settings.homeVisibility,...(xs.homeVisibility||{})},
        customEntryCategories:Array.isArray(xs.customEntryCategories)?xs.customEntryCategories:base.settings.customEntryCategories,
        calendar:{...base.settings.calendar,...(xs.calendar||{})},
        todoItems:(Array.isArray(xs.todoItems)&&xs.todoItems.length)?xs.todoItems:base.settings.todoItems
      },
      quick:Array.isArray(x.quick)&&x.quick.length?x.quick:base.quick};
  }catch(e){return cloneDefault()}
}
function save(){localStorage.setItem(KEY,JSON.stringify(state));renderAll()}
function pad(n){return String(n).padStart(2,"0")}
function localDate(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function localTime(d=new Date()){return `${pad(d.getHours())}:${pad(d.getMinutes())}`}
function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random()}
function startMonth(d){return new Date(d.getFullYear(),d.getMonth(),1)}
function typeLabel(t){return ({food:"Essen",drink:"Getränk",symptom:"Beschwerde",medicine:"Mittel",weight:"Gewicht",period:"Periode"})[t]||t}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function parseDate(ds){return new Date(ds+"T12:00:00")}
function daysBetween(a,b){return Math.round((parseDate(b)-parseDate(a))/86400000)}
function formatWeightDelta(d){const sign=d>0?"+":"";return `${sign}${d.toFixed(1).replace(".",",")} kg`}
function showToast(msg){const t=document.querySelector("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(showToast._x);showToast._x=setTimeout(()=>t.classList.remove("show"),1800)}


function mealPhoto(mealId){return mealId&&state.mealPhotos?state.mealPhotos[mealId]||"":""}
function setPhotoPreview(data){
  const box=document.querySelector("#entryPhotoPreview");
  if(!box)return;
  if(data){box.innerHTML=`<img src="${data}" alt="Essensfoto">`}
  else {box.textContent="🍽️"}
}
function resetPhotoField(){entryPhotoData="";removeEntryPhoto=false;const inp=document.querySelector("#entryPhotoInput");if(inp)inp.value="";setPhotoPreview("")}
function resizeImageFile(file,max=420,quality=.78){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error("Bild konnte nicht geladen werden"));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("Bild konnte nicht gelesen werden"));
      img.onload=()=>{
        let {width,height}=img;
        const scale=Math.min(1,max/Math.max(width,height));
        width=Math.max(1,Math.round(width*scale));
        height=Math.max(1,Math.round(height*scale));
        const canvas=document.createElement("canvas");
        canvas.width=width; canvas.height=height;
        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,width,height);
        resolve(canvas.toDataURL("image/jpeg",quality));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function addEntry(type,value,opts={}){
  state.entries.push({
    id:uid(),date:opts.date||selectedDate||localDate(),time:opts.time||localTime(),type,
    value:String(value||"").trim(),note:opts.note||"",mealId:opts.mealId||null,createdAt:new Date().toISOString(),
    tags:opts.tags||[],amountMl:opts.amountMl??null,weightKg:opts.weightKg??null,periodFlow:opts.periodFlow||""
  });
}
const BUILTIN_ENTRY_CATEGORIES=[
  {id:"beer",label:"Bier"},
  {id:"alcohol",label:"Alkohol"},
  {id:"dairy",label:"Milch / Milchprodukt"},
  {id:"sweets",label:"Süßigkeit"},
  {id:"fatty",label:"Fettig"}
];
function allEntryCategories(){
  const custom=(state.settings.customEntryCategories||[]).map(x=>({id:x.id,label:x.label}));
  return [...BUILTIN_ENTRY_CATEGORIES,...custom]
}
function categoryTag(id){return `cat:${id}`}
function normalizedItem(s){return String(s||"").trim().toLocaleLowerCase("de-DE")}
function entryHasCategory(e,id){
  const tags=Array.isArray(e.tags)?e.tags:[];
  if(tags.includes(categoryTag(id)))return true;
  const value=normalizedItem(e.value);
  // Kompatibilität mit alten Einträgen: exakt "Bier" zählt weiterhin als Bier und Alkohol.
  if(value==="bier"&&(id==="beer"||id==="alcohol"))return true;
  if(id==="alcohol"&&tags.includes(categoryTag("beer")))return true;
  return false
}
function freeGoalsSettings(){
  let goals=Array.isArray(state.settings.freeGoals)?state.settings.freeGoals:[];
  if(!goals.length){
    const old=state.settings.freeDays||DEFAULT.settings.freeDays;
    goals=[{id:"migrated-free",label:old.label||"Bierfreie Tage",start:old.start||state.settings.beerStart||localDate(),categoryId:old.mode==="alcohol"?"alcohol":"beer",enabled:true}];
    state.settings.freeGoals=goals;
  }
  return goals.map(g=>({id:g.id||uid(),label:(g.label||"Freie Tage").trim()||"Freie Tage",start:g.start||localDate(),categoryId:g.categoryId||"beer",enabled:g.enabled!==false}))
}
function freeDaysSettings(){
  const g=freeGoalsSettings()[0]||{label:"Freie Tage",start:localDate(),categoryId:"beer"};
  return {label:g.label,start:g.start,mode:g.categoryId}
}
function hasFreeBreakerOnGoal(goal,ds){return state.entries.some(e=>e.date===ds&&entryHasCategory(e,goal.categoryId))}
function freeGoalStreakInfo(goal,endDate=selectedDate){
  const today=localDate(),target=endDate>today?today:endDate;
  if(!goal.start||goal.start>target)return {days:0,start:goal.start,lastBreak:null};
  let lastBreak=null;
  state.entries.filter(e=>entryHasCategory(e,goal.categoryId)&&e.date>=goal.start&&e.date<=target)
    .sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>lastBreak=e.date);
  const streakStart=lastBreak?addDays(lastBreak,1):goal.start;
  const days=streakStart>target?0:daysBetween(streakStart,target)+1;
  return {days,start:streakStart,lastBreak,target}
}
function freeStreakInfo(endDate=selectedDate){
  const g=freeGoalsSettings().find(x=>x.enabled!==false)||freeGoalsSettings()[0];
  return g?{...freeGoalStreakInfo(g,endDate),label:g.label,mode:g.categoryId}:{days:0,start:null}
}
function isFreeDay(ds){
  if(ds>localDate())return false;
  const started=freeGoalsSettings().filter(g=>g.enabled!==false&&g.start&&ds>=g.start);
  return started.length>0&&started.every(g=>!hasFreeBreakerOnGoal(g,ds))
}
function isBeerFreeDay(ds){return isFreeDay(ds)}
function beerStreakInfo(){return freeStreakInfo(selectedDate)} // Kompatibilität
function periodOn(ds){return state.entries.some(e=>e.date===ds&&e.type==="period")}
function weightEntriesSorted(){
  return state.entries.filter(e=>e.type==="weight"&&Number.isFinite(Number(e.weightKg))).slice().sort((a,b)=>(a.date+"T"+a.time).localeCompare(b.date+"T"+b.time));
}
function todayEntries(){return state.entries.filter(e=>e.date===selectedDate).sort((a,b)=>a.time.localeCompare(b.time))}
function knownItems(){const m=new Map();state.entries.filter(e=>!["weight","period"].includes(e.type)).forEach(e=>m.set(e.value,(m.get(e.value)||0)+1));return [...m.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]).slice(0,80)}



const DAILY_QUOTES=["Heute darfst du es ein bisschen ruhiger angehen. ♡","Kleine Schritte sind auch Schritte. Mehr muss daraus nicht werden.","Ein freundlicher Gedanke an dich selbst zählt. Einfach, weil es schön sein darf.","Heute schon gelächelt? Das reicht für heute.","Du musst heute nicht alles schaffen. Lass es leicht sein.","Ein ruhiger Moment darf dazugehören. Vielleicht genau jetzt.","Mach heute etwas, das dir gut tut. Und wenn nicht, ist morgen auch noch ein Tag.","Auch ein ganz normaler Tag kann schön sein. Ohne daraus eine Aufgabe zu machen.","Nimm dir heute einen kleinen Moment nur für dich. Nur für dich.","Du darfst stolz auf kleine Dinge sein. Nimm dir dafür ruhig Zeit.","Heute ist ein guter Tag für ein bisschen Leichtigkeit. Ganz ohne Druck.","Ein bisschen frische Luft kann der Stimmung guttun. Ein kleiner Moment genügt.","Du darfst Pausen machen, bevor du sie unbedingt brauchst. ♡","Manchmal reicht es, einfach anzufangen. Mehr muss daraus nicht werden.","Gönn dir heute etwas Freundlichkeit. Einfach, weil es schön sein darf.","Ein langsamer Tag ist kein verlorener Tag. Das reicht für heute.","Heute zählt nicht Perfektion, sondern dass du bei dir bleibst. Lass es leicht sein.","Vielleicht wartet heute irgendwo ein schöner kleiner Moment. Vielleicht genau jetzt.","Du darfst deinen eigenen Rhythmus haben. Und wenn nicht, ist morgen auch noch ein Tag.","Etwas Schönes muss nicht groß sein. Ohne daraus eine Aufgabe zu machen.","Ein paar bewusste Minuten können den ganzen Tag verändern. Nur für dich.","Heute darf auch Platz für Unsinn und Lachen sein. Nimm dir dafür ruhig Zeit.","Du musst nicht produktiv sein, um einen guten Tag zu haben. Ganz ohne Druck.","Hör heute einmal darauf, was dir wirklich gut tut. Ein kleiner Moment genügt.","Ein kleiner Spaziergang kann auch eine kleine Auszeit sein. ♡","Heute ist ein guter Tag, um freundlich mit dir zu sprechen. Mehr muss daraus nicht werden.","Du darfst Dinge langsam machen. Einfach, weil es schön sein darf.","Es ist völlig in Ordnung, zwischendurch einfach nichts zu tun. Das reicht für heute.","Ein gemütlicher Moment zählt genauso wie ein erledigter Punkt. Lass es leicht sein.","Vielleicht kannst du heute etwas bewusst genießen. Vielleicht genau jetzt.","Nimm wahr, was heute schon gut läuft. Und wenn nicht, ist morgen auch noch ein Tag.","Heute darfst du auch einfach zufrieden sein. Ohne daraus eine Aufgabe zu machen.","Ein kurzer Moment draußen kann schon reichen. Nur für dich.","Mach es dir heute irgendwo ein bisschen schön. Nimm dir dafür ruhig Zeit.","Du darfst einen Plan ändern, wenn er heute nicht passt. Ganz ohne Druck.","Heute muss nicht spektakulär sein, um gut zu sein. Ein kleiner Moment genügt.","Ein tiefer Atemzug und weiter geht’s. ♡","Vielleicht ist heute ein guter Tag für etwas, das du gern machst. Mehr muss daraus nicht werden.","Nimm dir einen Moment, um dich umzusehen. Einfach, weil es schön sein darf.","Du darfst heute auf dein Tempo achten. Das reicht für heute.","Heute zählt auch das, was niemand sonst sieht. Lass es leicht sein.","Manchmal ist weniger genau richtig. Vielleicht genau jetzt.","Ein bisschen Bewegung darf sich gut anfühlen, nicht wie eine Pflicht. Und wenn nicht, ist morgen auch noch ein Tag.","Heute darfst du dir selbst etwas Nettes sagen. Ohne daraus eine Aufgabe zu machen.","Ein freundlicher Gedanke kann ein guter Anfang sein. Nur für dich.","Du darfst heute etwas liegen lassen. Nimm dir dafür ruhig Zeit.","Vielleicht ist heute ein guter Tag für Musik. Ganz ohne Druck.","Ein Moment Ruhe ist nicht verschwendete Zeit. Ein kleiner Moment genügt.","Heute darfst du neugierig auf den Tag sein. ♡","Kleine Routinen können sich richtig gemütlich anfühlen. Mehr muss daraus nicht werden.","Nimm heute etwas Schönes bewusst wahr. Einfach, weil es schön sein darf.","Du darfst dich über Kleinigkeiten freuen. Das reicht für heute.","Heute ist genug, was heute möglich ist. Lass es leicht sein.","Ein guter Tag braucht keine perfekte To-do-Liste. Vielleicht genau jetzt.","Vielleicht findest du heute einen Moment zum Durchatmen. Und wenn nicht, ist morgen auch noch ein Tag.","Du darfst dich auch über dich selbst freuen. Ohne daraus eine Aufgabe zu machen.","Ein bisschen Tageslicht tut oft gut. Nur für dich.","Heute darfst du einen Gang zurückschalten. Nimm dir dafür ruhig Zeit.","Ein ruhiger Abend darf schon tagsüber beginnen. Ganz ohne Druck.","Mach heute wenigstens eine Sache nur, weil sie dir Freude macht. Ein kleiner Moment genügt.","Heute ist ein guter Tag für einen kleinen Neuanfang. ♡","Du darfst freundlich mit deinem Körper umgehen. Mehr muss daraus nicht werden.","Ein kurzer Spaziergang ist mehr als gar keiner. Einfach, weil es schön sein darf.","Heute darfst du dich von etwas Schönem ablenken lassen. Das reicht für heute.","Ein kleiner Haken auf deiner Liste reicht völlig. Lass es leicht sein.","Du musst nicht jedem Gedanken hinterherlaufen. Vielleicht genau jetzt.","Heute darfst du dir einen gemütlichen Platz suchen. Und wenn nicht, ist morgen auch noch ein Tag.","Vielleicht tut dir heute ein bisschen Grün gut. Ohne daraus eine Aufgabe zu machen.","Du darfst dich freuen, auch ohne besonderen Grund. Nur für dich.","Ein schöner Gedanke darf bleiben. Nimm dir dafür ruhig Zeit.","Heute darfst du deinen Feierabend ernst nehmen. Ganz ohne Druck.","Nimm dir heute Zeit für etwas, das dich beruhigt. Ein kleiner Moment genügt.","Ein bisschen Bewegung kann auch Spielen sein. ♡","Du darfst heute einfach mal zufrieden mit genug sein. Mehr muss daraus nicht werden.","Vielleicht ist heute ein guter Tag für eine Tasse Ruhe. Einfach, weil es schön sein darf.","Heute darf etwas leicht sein. Das reicht für heute.","Ein kleiner Schritt Richtung Wohlfühlen ist genug. Lass es leicht sein.","Du darfst deinen Tag auch spontan schöner machen. Vielleicht genau jetzt.","Heute ist ein guter Tag, um einen netten Gedanken festzuhalten. Und wenn nicht, ist morgen auch noch ein Tag.","Vielleicht bemerkst du heute etwas, das sonst untergeht. Ohne daraus eine Aufgabe zu machen.","Du darfst heute freundlich Nein sagen. Nur für dich.","Ein bisschen Ruhe kann genauso wichtig sein wie Bewegung. Nimm dir dafür ruhig Zeit.","Heute darfst du dir selbst zuhören. Ganz ohne Druck.","Ein entspannter Moment muss nicht verdient werden. Ein kleiner Moment genügt.","Vielleicht hilft heute ein kleiner Tapetenwechsel. ♡","Du darfst dich auf etwas Kleines freuen. Mehr muss daraus nicht werden.","Heute kann ein guter Tag für Gemütlichkeit sein. Einfach, weil es schön sein darf.","Ein paar Minuten draußen zählen auch. Das reicht für heute.","Du darfst heute das Tempo rausnehmen. Lass es leicht sein.","Vielleicht brauchst du heute weniger Plan und mehr Gefühl. Vielleicht genau jetzt.","Ein Tag darf auch einfach vorbeiziehen. Und wenn nicht, ist morgen auch noch ein Tag.","Heute ist ein guter Tag für etwas Frisches, Schönes oder Lustiges. Ohne daraus eine Aufgabe zu machen.","Heute darfst du es ein bisschen ruhiger angehen. Mehr muss daraus nicht werden.","Kleine Schritte sind auch Schritte. Einfach, weil es schön sein darf.","Ein freundlicher Gedanke an dich selbst zählt. Das reicht für heute.","Heute schon gelächelt? Lass es leicht sein.","Du musst heute nicht alles schaffen. Vielleicht genau jetzt.","Ein ruhiger Moment darf dazugehören. Und wenn nicht, ist morgen auch noch ein Tag.","Mach heute etwas, das dir gut tut. Ohne daraus eine Aufgabe zu machen.","Auch ein ganz normaler Tag kann schön sein. Nur für dich.","Nimm dir heute einen kleinen Moment nur für dich. Nimm dir dafür ruhig Zeit.","Du darfst stolz auf kleine Dinge sein. Ganz ohne Druck.","Heute ist ein guter Tag für ein bisschen Leichtigkeit. Ein kleiner Moment genügt.","Ein bisschen frische Luft kann der Stimmung guttun. ♡","Du darfst Pausen machen, bevor du sie unbedingt brauchst. Mehr muss daraus nicht werden.","Manchmal reicht es, einfach anzufangen. Einfach, weil es schön sein darf.","Gönn dir heute etwas Freundlichkeit. Das reicht für heute.","Ein langsamer Tag ist kein verlorener Tag. Lass es leicht sein.","Heute zählt nicht Perfektion, sondern dass du bei dir bleibst. Vielleicht genau jetzt.","Vielleicht wartet heute irgendwo ein schöner kleiner Moment. Und wenn nicht, ist morgen auch noch ein Tag.","Du darfst deinen eigenen Rhythmus haben. Ohne daraus eine Aufgabe zu machen.","Etwas Schönes muss nicht groß sein. Nur für dich.","Ein paar bewusste Minuten können den ganzen Tag verändern. Nimm dir dafür ruhig Zeit.","Heute darf auch Platz für Unsinn und Lachen sein. Ganz ohne Druck.","Du musst nicht produktiv sein, um einen guten Tag zu haben. Ein kleiner Moment genügt.","Hör heute einmal darauf, was dir wirklich gut tut. ♡","Ein kleiner Spaziergang kann auch eine kleine Auszeit sein. Mehr muss daraus nicht werden.","Heute ist ein guter Tag, um freundlich mit dir zu sprechen. Einfach, weil es schön sein darf.","Du darfst Dinge langsam machen. Das reicht für heute.","Es ist völlig in Ordnung, zwischendurch einfach nichts zu tun. Lass es leicht sein.","Ein gemütlicher Moment zählt genauso wie ein erledigter Punkt. Vielleicht genau jetzt.","Vielleicht kannst du heute etwas bewusst genießen. Und wenn nicht, ist morgen auch noch ein Tag.","Nimm wahr, was heute schon gut läuft. Ohne daraus eine Aufgabe zu machen.","Heute darfst du auch einfach zufrieden sein. Nur für dich.","Ein kurzer Moment draußen kann schon reichen. Nimm dir dafür ruhig Zeit.","Mach es dir heute irgendwo ein bisschen schön. Ganz ohne Druck.","Du darfst einen Plan ändern, wenn er heute nicht passt. Ein kleiner Moment genügt.","Heute muss nicht spektakulär sein, um gut zu sein. ♡","Ein tiefer Atemzug und weiter geht’s. Mehr muss daraus nicht werden.","Vielleicht ist heute ein guter Tag für etwas, das du gern machst. Einfach, weil es schön sein darf.","Nimm dir einen Moment, um dich umzusehen. Das reicht für heute.","Du darfst heute auf dein Tempo achten. Lass es leicht sein.","Heute zählt auch das, was niemand sonst sieht. Vielleicht genau jetzt.","Manchmal ist weniger genau richtig. Und wenn nicht, ist morgen auch noch ein Tag.","Ein bisschen Bewegung darf sich gut anfühlen, nicht wie eine Pflicht. Ohne daraus eine Aufgabe zu machen.","Heute darfst du dir selbst etwas Nettes sagen. Nur für dich.","Ein freundlicher Gedanke kann ein guter Anfang sein. Nimm dir dafür ruhig Zeit.","Du darfst heute etwas liegen lassen. Ganz ohne Druck.","Vielleicht ist heute ein guter Tag für Musik. Ein kleiner Moment genügt.","Ein Moment Ruhe ist nicht verschwendete Zeit. ♡","Heute darfst du neugierig auf den Tag sein. Mehr muss daraus nicht werden.","Kleine Routinen können sich richtig gemütlich anfühlen. Einfach, weil es schön sein darf.","Nimm heute etwas Schönes bewusst wahr. Das reicht für heute.","Du darfst dich über Kleinigkeiten freuen. Lass es leicht sein.","Heute ist genug, was heute möglich ist. Vielleicht genau jetzt.","Ein guter Tag braucht keine perfekte To-do-Liste. Und wenn nicht, ist morgen auch noch ein Tag.","Vielleicht findest du heute einen Moment zum Durchatmen. Ohne daraus eine Aufgabe zu machen.","Du darfst dich auch über dich selbst freuen. Nur für dich.","Ein bisschen Tageslicht tut oft gut. Nimm dir dafür ruhig Zeit.","Heute darfst du einen Gang zurückschalten. Ganz ohne Druck.","Ein ruhiger Abend darf schon tagsüber beginnen. Ein kleiner Moment genügt.","Mach heute wenigstens eine Sache nur, weil sie dir Freude macht. ♡","Heute ist ein guter Tag für einen kleinen Neuanfang. Mehr muss daraus nicht werden.","Du darfst freundlich mit deinem Körper umgehen. Einfach, weil es schön sein darf.","Ein kurzer Spaziergang ist mehr als gar keiner. Das reicht für heute.","Heute darfst du dich von etwas Schönem ablenken lassen. Lass es leicht sein.","Ein kleiner Haken auf deiner Liste reicht völlig. Vielleicht genau jetzt.","Du musst nicht jedem Gedanken hinterherlaufen. Und wenn nicht, ist morgen auch noch ein Tag.","Heute darfst du dir einen gemütlichen Platz suchen. Ohne daraus eine Aufgabe zu machen.","Vielleicht tut dir heute ein bisschen Grün gut. Nur für dich.","Du darfst dich freuen, auch ohne besonderen Grund. Nimm dir dafür ruhig Zeit.","Ein schöner Gedanke darf bleiben. Ganz ohne Druck.","Heute darfst du deinen Feierabend ernst nehmen. Ein kleiner Moment genügt.","Nimm dir heute Zeit für etwas, das dich beruhigt. ♡","Ein bisschen Bewegung kann auch Spielen sein. Mehr muss daraus nicht werden.","Du darfst heute einfach mal zufrieden mit genug sein. Einfach, weil es schön sein darf.","Vielleicht ist heute ein guter Tag für eine Tasse Ruhe. Das reicht für heute.","Heute darf etwas leicht sein. Lass es leicht sein.","Ein kleiner Schritt Richtung Wohlfühlen ist genug. Vielleicht genau jetzt.","Du darfst deinen Tag auch spontan schöner machen. Und wenn nicht, ist morgen auch noch ein Tag.","Heute ist ein guter Tag, um einen netten Gedanken festzuhalten. Ohne daraus eine Aufgabe zu machen.","Vielleicht bemerkst du heute etwas, das sonst untergeht. Nur für dich.","Du darfst heute freundlich Nein sagen. Nimm dir dafür ruhig Zeit.","Ein bisschen Ruhe kann genauso wichtig sein wie Bewegung. Ganz ohne Druck.","Heute darfst du dir selbst zuhören. Ein kleiner Moment genügt.","Ein entspannter Moment muss nicht verdient werden. ♡","Vielleicht hilft heute ein kleiner Tapetenwechsel. Mehr muss daraus nicht werden.","Du darfst dich auf etwas Kleines freuen. Einfach, weil es schön sein darf.","Heute kann ein guter Tag für Gemütlichkeit sein. Das reicht für heute.","Ein paar Minuten draußen zählen auch. Lass es leicht sein.","Du darfst heute das Tempo rausnehmen. Vielleicht genau jetzt.","Vielleicht brauchst du heute weniger Plan und mehr Gefühl. Und wenn nicht, ist morgen auch noch ein Tag.","Ein Tag darf auch einfach vorbeiziehen. Ohne daraus eine Aufgabe zu machen.","Heute ist ein guter Tag für etwas Frisches, Schönes oder Lustiges. Nur für dich.","Heute darfst du es ein bisschen ruhiger angehen. Einfach, weil es schön sein darf.","Kleine Schritte sind auch Schritte. Das reicht für heute.","Ein freundlicher Gedanke an dich selbst zählt. Lass es leicht sein.","Heute schon gelächelt? Vielleicht genau jetzt.","Du musst heute nicht alles schaffen. Und wenn nicht, ist morgen auch noch ein Tag.","Ein ruhiger Moment darf dazugehören. Ohne daraus eine Aufgabe zu machen.","Mach heute etwas, das dir gut tut. Nur für dich.","Auch ein ganz normaler Tag kann schön sein. Nimm dir dafür ruhig Zeit.","Nimm dir heute einen kleinen Moment nur für dich. Ganz ohne Druck.","Du darfst stolz auf kleine Dinge sein. Ein kleiner Moment genügt.","Heute ist ein guter Tag für ein bisschen Leichtigkeit. ♡","Ein bisschen frische Luft kann der Stimmung guttun. Mehr muss daraus nicht werden.","Du darfst Pausen machen, bevor du sie unbedingt brauchst. Einfach, weil es schön sein darf.","Manchmal reicht es, einfach anzufangen. Das reicht für heute.","Gönn dir heute etwas Freundlichkeit. Lass es leicht sein.","Ein langsamer Tag ist kein verlorener Tag. Vielleicht genau jetzt.","Heute zählt nicht Perfektion, sondern dass du bei dir bleibst. Und wenn nicht, ist morgen auch noch ein Tag.","Vielleicht wartet heute irgendwo ein schöner kleiner Moment. Ohne daraus eine Aufgabe zu machen.","Du darfst deinen eigenen Rhythmus haben. Nur für dich.","Etwas Schönes muss nicht groß sein. Nimm dir dafür ruhig Zeit.","Ein paar bewusste Minuten können den ganzen Tag verändern. Ganz ohne Druck.","Heute darf auch Platz für Unsinn und Lachen sein. Ein kleiner Moment genügt.","Du musst nicht produktiv sein, um einen guten Tag zu haben. ♡","Hör heute einmal darauf, was dir wirklich gut tut. Mehr muss daraus nicht werden.","Ein kleiner Spaziergang kann auch eine kleine Auszeit sein. Einfach, weil es schön sein darf.","Heute ist ein guter Tag, um freundlich mit dir zu sprechen. Das reicht für heute.","Du darfst Dinge langsam machen. Lass es leicht sein.","Es ist völlig in Ordnung, zwischendurch einfach nichts zu tun. Vielleicht genau jetzt.","Ein gemütlicher Moment zählt genauso wie ein erledigter Punkt. Und wenn nicht, ist morgen auch noch ein Tag.","Vielleicht kannst du heute etwas bewusst genießen. Ohne daraus eine Aufgabe zu machen.","Nimm wahr, was heute schon gut läuft. Nur für dich.","Heute darfst du auch einfach zufrieden sein. Nimm dir dafür ruhig Zeit.","Ein kurzer Moment draußen kann schon reichen. Ganz ohne Druck.","Mach es dir heute irgendwo ein bisschen schön. Ein kleiner Moment genügt.","Du darfst einen Plan ändern, wenn er heute nicht passt. ♡","Heute muss nicht spektakulär sein, um gut zu sein. Mehr muss daraus nicht werden.","Ein tiefer Atemzug und weiter geht’s. Einfach, weil es schön sein darf.","Vielleicht ist heute ein guter Tag für etwas, das du gern machst. Das reicht für heute.","Nimm dir einen Moment, um dich umzusehen. Lass es leicht sein.","Du darfst heute auf dein Tempo achten. Vielleicht genau jetzt.","Heute zählt auch das, was niemand sonst sieht. Und wenn nicht, ist morgen auch noch ein Tag.","Manchmal ist weniger genau richtig. Ohne daraus eine Aufgabe zu machen.","Ein bisschen Bewegung darf sich gut anfühlen, nicht wie eine Pflicht. Nur für dich.","Heute darfst du dir selbst etwas Nettes sagen. Nimm dir dafür ruhig Zeit.","Ein freundlicher Gedanke kann ein guter Anfang sein. Ganz ohne Druck.","Du darfst heute etwas liegen lassen. Ein kleiner Moment genügt.","Vielleicht ist heute ein guter Tag für Musik. ♡","Ein Moment Ruhe ist nicht verschwendete Zeit. Mehr muss daraus nicht werden.","Heute darfst du neugierig auf den Tag sein. Einfach, weil es schön sein darf.","Kleine Routinen können sich richtig gemütlich anfühlen. Das reicht für heute.","Nimm heute etwas Schönes bewusst wahr. Lass es leicht sein.","Du darfst dich über Kleinigkeiten freuen. Vielleicht genau jetzt.","Heute ist genug, was heute möglich ist. Und wenn nicht, ist morgen auch noch ein Tag.","Ein guter Tag braucht keine perfekte To-do-Liste. Ohne daraus eine Aufgabe zu machen.","Vielleicht findest du heute einen Moment zum Durchatmen. Nur für dich.","Du darfst dich auch über dich selbst freuen. Nimm dir dafür ruhig Zeit.","Ein bisschen Tageslicht tut oft gut. Ganz ohne Druck.","Heute darfst du einen Gang zurückschalten. Ein kleiner Moment genügt.","Ein ruhiger Abend darf schon tagsüber beginnen. ♡","Mach heute wenigstens eine Sache nur, weil sie dir Freude macht. Mehr muss daraus nicht werden.","Heute ist ein guter Tag für einen kleinen Neuanfang. Einfach, weil es schön sein darf.","Du darfst freundlich mit deinem Körper umgehen. Das reicht für heute.","Ein kurzer Spaziergang ist mehr als gar keiner. Lass es leicht sein.","Heute darfst du dich von etwas Schönem ablenken lassen. Vielleicht genau jetzt.","Ein kleiner Haken auf deiner Liste reicht völlig. Und wenn nicht, ist morgen auch noch ein Tag.","Du musst nicht jedem Gedanken hinterherlaufen. Ohne daraus eine Aufgabe zu machen.","Heute darfst du dir einen gemütlichen Platz suchen. Nur für dich.","Vielleicht tut dir heute ein bisschen Grün gut. Nimm dir dafür ruhig Zeit.","Du darfst dich freuen, auch ohne besonderen Grund. Ganz ohne Druck.","Ein schöner Gedanke darf bleiben. Ein kleiner Moment genügt.","Heute darfst du deinen Feierabend ernst nehmen. ♡","Nimm dir heute Zeit für etwas, das dich beruhigt. Mehr muss daraus nicht werden.","Ein bisschen Bewegung kann auch Spielen sein. Einfach, weil es schön sein darf.","Du darfst heute einfach mal zufrieden mit genug sein. Das reicht für heute.","Vielleicht ist heute ein guter Tag für eine Tasse Ruhe. Lass es leicht sein.","Heute darf etwas leicht sein. Vielleicht genau jetzt.","Ein kleiner Schritt Richtung Wohlfühlen ist genug. Und wenn nicht, ist morgen auch noch ein Tag.","Du darfst deinen Tag auch spontan schöner machen. Ohne daraus eine Aufgabe zu machen.","Heute ist ein guter Tag, um einen netten Gedanken festzuhalten. Nur für dich.","Vielleicht bemerkst du heute etwas, das sonst untergeht. Nimm dir dafür ruhig Zeit.","Du darfst heute freundlich Nein sagen. Ganz ohne Druck.","Ein bisschen Ruhe kann genauso wichtig sein wie Bewegung. Ein kleiner Moment genügt.","Heute darfst du dir selbst zuhören. ♡","Ein entspannter Moment muss nicht verdient werden. Mehr muss daraus nicht werden.","Vielleicht hilft heute ein kleiner Tapetenwechsel. Einfach, weil es schön sein darf.","Du darfst dich auf etwas Kleines freuen. Das reicht für heute.","Heute kann ein guter Tag für Gemütlichkeit sein. Lass es leicht sein.","Ein paar Minuten draußen zählen auch. Vielleicht genau jetzt.","Du darfst heute das Tempo rausnehmen. Und wenn nicht, ist morgen auch noch ein Tag.","Vielleicht brauchst du heute weniger Plan und mehr Gefühl. Ohne daraus eine Aufgabe zu machen.","Ein Tag darf auch einfach vorbeiziehen. Nur für dich.","Heute ist ein guter Tag für etwas Frisches, Schönes oder Lustiges. Nimm dir dafür ruhig Zeit.","Heute darfst du es ein bisschen ruhiger angehen. Das reicht für heute.","Kleine Schritte sind auch Schritte. Lass es leicht sein.","Ein freundlicher Gedanke an dich selbst zählt. Vielleicht genau jetzt.","Heute schon gelächelt? Und wenn nicht, ist morgen auch noch ein Tag.","Du musst heute nicht alles schaffen. Ohne daraus eine Aufgabe zu machen.","Ein ruhiger Moment darf dazugehören. Nur für dich.","Mach heute etwas, das dir gut tut. Nimm dir dafür ruhig Zeit.","Auch ein ganz normaler Tag kann schön sein. Ganz ohne Druck.","Nimm dir heute einen kleinen Moment nur für dich. Ein kleiner Moment genügt.","Du darfst stolz auf kleine Dinge sein. ♡","Heute ist ein guter Tag für ein bisschen Leichtigkeit. Mehr muss daraus nicht werden.","Ein bisschen frische Luft kann der Stimmung guttun. Einfach, weil es schön sein darf.","Du darfst Pausen machen, bevor du sie unbedingt brauchst. Das reicht für heute.","Manchmal reicht es, einfach anzufangen. Lass es leicht sein.","Gönn dir heute etwas Freundlichkeit. Vielleicht genau jetzt.","Ein langsamer Tag ist kein verlorener Tag. Und wenn nicht, ist morgen auch noch ein Tag.","Heute zählt nicht Perfektion, sondern dass du bei dir bleibst. Ohne daraus eine Aufgabe zu machen.","Vielleicht wartet heute irgendwo ein schöner kleiner Moment. Nur für dich.","Du darfst deinen eigenen Rhythmus haben. Nimm dir dafür ruhig Zeit.","Etwas Schönes muss nicht groß sein. Ganz ohne Druck.","Ein paar bewusste Minuten können den ganzen Tag verändern. Ein kleiner Moment genügt.","Heute darf auch Platz für Unsinn und Lachen sein. ♡","Du musst nicht produktiv sein, um einen guten Tag zu haben. Mehr muss daraus nicht werden.","Hör heute einmal darauf, was dir wirklich gut tut. Einfach, weil es schön sein darf.","Ein kleiner Spaziergang kann auch eine kleine Auszeit sein. Das reicht für heute.","Heute ist ein guter Tag, um freundlich mit dir zu sprechen. Lass es leicht sein.","Du darfst Dinge langsam machen. Vielleicht genau jetzt.","Es ist völlig in Ordnung, zwischendurch einfach nichts zu tun. Und wenn nicht, ist morgen auch noch ein Tag.","Ein gemütlicher Moment zählt genauso wie ein erledigter Punkt. Ohne daraus eine Aufgabe zu machen.","Vielleicht kannst du heute etwas bewusst genießen. Nur für dich.","Nimm wahr, was heute schon gut läuft. Nimm dir dafür ruhig Zeit.","Heute darfst du auch einfach zufrieden sein. Ganz ohne Druck.","Ein kurzer Moment draußen kann schon reichen. Ein kleiner Moment genügt.","Mach es dir heute irgendwo ein bisschen schön. ♡","Du darfst einen Plan ändern, wenn er heute nicht passt. Mehr muss daraus nicht werden.","Heute muss nicht spektakulär sein, um gut zu sein. Einfach, weil es schön sein darf.","Ein tiefer Atemzug und weiter geht’s. Das reicht für heute.","Vielleicht ist heute ein guter Tag für etwas, das du gern machst. Lass es leicht sein.","Nimm dir einen Moment, um dich umzusehen. Vielleicht genau jetzt.","Du darfst heute auf dein Tempo achten. Und wenn nicht, ist morgen auch noch ein Tag.","Heute zählt auch das, was niemand sonst sieht. Ohne daraus eine Aufgabe zu machen.","Manchmal ist weniger genau richtig. Nur für dich.","Ein bisschen Bewegung darf sich gut anfühlen, nicht wie eine Pflicht. Nimm dir dafür ruhig Zeit.","Heute darfst du dir selbst etwas Nettes sagen. Ganz ohne Druck.","Ein freundlicher Gedanke kann ein guter Anfang sein. Ein kleiner Moment genügt.","Du darfst heute etwas liegen lassen. ♡","Vielleicht ist heute ein guter Tag für Musik. Mehr muss daraus nicht werden.","Ein Moment Ruhe ist nicht verschwendete Zeit. Einfach, weil es schön sein darf.","Heute darfst du neugierig auf den Tag sein. Das reicht für heute.","Kleine Routinen können sich richtig gemütlich anfühlen. Lass es leicht sein.","Nimm heute etwas Schönes bewusst wahr. Vielleicht genau jetzt.","Du darfst dich über Kleinigkeiten freuen. Und wenn nicht, ist morgen auch noch ein Tag.","Heute ist genug, was heute möglich ist. Ohne daraus eine Aufgabe zu machen.","Ein guter Tag braucht keine perfekte To-do-Liste. Nur für dich.","Vielleicht findest du heute einen Moment zum Durchatmen. Nimm dir dafür ruhig Zeit.","Du darfst dich auch über dich selbst freuen. Ganz ohne Druck.","Ein bisschen Tageslicht tut oft gut. Ein kleiner Moment genügt.","Heute darfst du einen Gang zurückschalten. ♡","Ein ruhiger Abend darf schon tagsüber beginnen. Mehr muss daraus nicht werden.","Mach heute wenigstens eine Sache nur, weil sie dir Freude macht. Einfach, weil es schön sein darf.","Heute ist ein guter Tag für einen kleinen Neuanfang. Das reicht für heute.","Du darfst freundlich mit deinem Körper umgehen. Lass es leicht sein.","Ein kurzer Spaziergang ist mehr als gar keiner. Vielleicht genau jetzt.","Heute darfst du dich von etwas Schönem ablenken lassen. Und wenn nicht, ist morgen auch noch ein Tag.","Ein kleiner Haken auf deiner Liste reicht völlig. Ohne daraus eine Aufgabe zu machen.","Du musst nicht jedem Gedanken hinterherlaufen. Nur für dich.","Heute darfst du dir einen gemütlichen Platz suchen. Nimm dir dafür ruhig Zeit.","Vielleicht tut dir heute ein bisschen Grün gut. Ganz ohne Druck.","Du darfst dich freuen, auch ohne besonderen Grund. Ein kleiner Moment genügt.","Ein schöner Gedanke darf bleiben. ♡","Heute darfst du deinen Feierabend ernst nehmen. Mehr muss daraus nicht werden.","Nimm dir heute Zeit für etwas, das dich beruhigt. Einfach, weil es schön sein darf.","Ein bisschen Bewegung kann auch Spielen sein. Das reicht für heute.","Du darfst heute einfach mal zufrieden mit genug sein. Lass es leicht sein.","Vielleicht ist heute ein guter Tag für eine Tasse Ruhe. Vielleicht genau jetzt.","Heute darf etwas leicht sein. Und wenn nicht, ist morgen auch noch ein Tag.","Ein kleiner Schritt Richtung Wohlfühlen ist genug. Ohne daraus eine Aufgabe zu machen.","Du darfst deinen Tag auch spontan schöner machen. Nur für dich.","Heute ist ein guter Tag, um einen netten Gedanken festzuhalten. Nimm dir dafür ruhig Zeit.","Vielleicht bemerkst du heute etwas, das sonst untergeht. Ganz ohne Druck.","Du darfst heute freundlich Nein sagen. Ein kleiner Moment genügt.","Ein bisschen Ruhe kann genauso wichtig sein wie Bewegung. ♡","Heute darfst du dir selbst zuhören. Mehr muss daraus nicht werden.","Ein entspannter Moment muss nicht verdient werden. Einfach, weil es schön sein darf.","Vielleicht hilft heute ein kleiner Tapetenwechsel. Das reicht für heute.","Du darfst dich auf etwas Kleines freuen. Lass es leicht sein.","Heute kann ein guter Tag für Gemütlichkeit sein. Vielleicht genau jetzt.","Ein paar Minuten draußen zählen auch. Und wenn nicht, ist morgen auch noch ein Tag.","Du darfst heute das Tempo rausnehmen. Ohne daraus eine Aufgabe zu machen.","Vielleicht brauchst du heute weniger Plan und mehr Gefühl. Nur für dich."];
const SCHOOL_HOLIDAYS_NI=[
  {name:"Sommerferien",start:"2026-07-02",end:"2026-08-12"},{name:"Herbstferien",start:"2026-10-12",end:"2026-10-24"},{name:"Weihnachtsferien",start:"2026-12-23",end:"2027-01-09"},
  {name:"Halbjahresferien",start:"2027-02-01",end:"2027-02-02"},{name:"Osterferien",start:"2027-03-22",end:"2027-04-03"},{name:"Tag nach Himmelfahrt",start:"2027-05-07",end:"2027-05-07"},{name:"Pfingstferien",start:"2027-05-18",end:"2027-05-18"},{name:"Sommerferien",start:"2027-07-08",end:"2027-08-18"},{name:"Herbstferien",start:"2027-10-16",end:"2027-10-30"},{name:"Weihnachtsferien",start:"2027-12-23",end:"2028-01-08"},
  {name:"Halbjahresferien",start:"2028-01-31",end:"2028-02-01"},{name:"Osterferien",start:"2028-04-10",end:"2028-04-22"},{name:"Tag nach Himmelfahrt",start:"2028-05-26",end:"2028-05-26"},{name:"Pfingstferien",start:"2028-06-06",end:"2028-06-06"},{name:"Sommerferien",start:"2028-07-20",end:"2028-08-30"},{name:"Tag vor dem 3. Oktober",start:"2028-10-02",end:"2028-10-02"},{name:"Herbstferien",start:"2028-10-23",end:"2028-11-04"},{name:"Weihnachtsferien",start:"2028-12-27",end:"2029-01-06"},
  {name:"Halbjahresferien",start:"2029-02-01",end:"2029-02-02"},{name:"Osterferien",start:"2029-03-19",end:"2029-04-03"},{name:"Tag vor dem 1. Mai",start:"2029-04-30",end:"2029-04-30"},{name:"Tag nach Himmelfahrt",start:"2029-05-11",end:"2029-05-11"},{name:"Pfingstferien",start:"2029-05-22",end:"2029-05-22"},{name:"Sommerferien",start:"2029-07-19",end:"2029-08-29"},{name:"Tage nach dem 3. Oktober",start:"2029-10-04",end:"2029-10-05"},{name:"Herbstferien",start:"2029-10-22",end:"2029-11-02"},{name:"Weihnachtsferien",start:"2029-12-21",end:"2030-01-05"},
  {name:"Halbjahresferien",start:"2030-01-31",end:"2030-02-01"},{name:"Osterferien",start:"2030-04-08",end:"2030-04-23"},{name:"Tag nach Himmelfahrt",start:"2030-05-31",end:"2030-05-31"},{name:"Pfingstferien",start:"2030-06-11",end:"2030-06-11"}
];
const FARMERS_RULES={
  "01-06":"Ist bis Dreikönig kein Winter, folgt oft keiner mehr dahinter.",
  "02-02":"Ist's an Lichtmess hell und rein, wird's ein langer Winter sein.",
  "02-24":"Mattheis bricht's Eis; hat er keins, so macht er eins.",
  "03-19":"Ist's am Josefstag klar, folgt ein gutes Jahr – so sagt die alte Regel.",
  "04-25":"Vor Markus soll man die Bohnen nicht verstecken – ein alter Hinweis auf späte Kälte.",
  "05-11":"Mamertus ist der erste der Eisheiligen – traditionell wird noch mit Kälte gerechnet.",
  "05-12":"Pankratius zählt zu den Eisheiligen: Spätfrost blieb früher besonders im Blick.",
  "05-13":"Servatius ist einer der Eisheiligen – Gärtner warteten oft noch mit Empfindlichem.",
  "05-14":"Bonifatius gehört zu den Eisheiligen und erinnert an mögliche späte Kälte.",
  "05-15":"Die kalte Sophie beschließt traditionell die Eisheiligen.",
  "06-24":"Vor Johanni bitt um Regen, nachher kommt er ungelegen – eine alte Ernte-Regel.",
  "06-27":"Der Siebenschläfertag galt als Lostag für die Wetterlage der nächsten Wochen.",
  "08-24":"Wie Bartholomäus sich hält, so ist der ganze Herbst bestellt – sagt die Überlieferung.",
  "09-29":"Um Michaelis in der Tat gedeiht die beste Wintersaat – eine alte Bauernregel.",
  "11-11":"Ist Martini klar und rein, bricht bald ein kalter Winter ein – so lautet eine traditionelle Regel.",
  "11-25":"Wie das Wetter um Kathrein, wird's den ganzen Winter sein – eine überlieferte Bauernregel.",
  "12-04":"Knospen an St. Barbara, sind zum Christfest Blüten da – daher stammen die Barbarazweige."
};
const ZODIAC=["Widder","Stier","Zwillinge","Krebs","Löwe","Jungfrau","Waage","Skorpion","Schütze","Steinbock","Wassermann","Fische"];
const ZODIAC_NOTES={Widder:"Tatkraft, Anfang und Direktheit",Stier:"Ruhe, Genuss und Beständigkeit",Zwillinge:"Neugier, Austausch und Beweglichkeit",Krebs:"Geborgenheit, Gefühl und Zuhause",Löwe:"Ausdruck, Wärme und Kreativität",Jungfrau:"Ordnung, Alltag und Sorgfalt",Waage:"Ausgleich, Begegnung und Schönheit",Skorpion:"Tiefe, Wandel und Intensität",Schütze:"Weite, Lernen und Zuversicht",Steinbock:"Struktur, Ausdauer und Verantwortung",Wassermann:"Freiheit, Ideen und Eigenständigkeit",Fische:"Fantasie, Mitgefühl und Rückzug"};
function mod(n,m){return ((n%m)+m)%m}
function deg2rad(x){return x*Math.PI/180}
function normDeg(x){return mod(x,360)}
function dayOfYear(ds){const d=parseDate(ds),s=new Date(d.getFullYear(),0,0,12);return Math.floor((d-s)/86400000)}
function easterDate(y){let a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return new Date(y,month-1,day,12)}
function dateOffset(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return localDate(x)}
function nthSundayBeforeAdvent(y){const x=new Date(y,11,25,12);while(x.getDay()!==0)x.setDate(x.getDate()-1);x.setDate(x.getDate()-21);return x}
function holidayFor(ds){
  const d=parseDate(ds),y=d.getFullYear(),md=ds.slice(5),e=easterDate(y),mov={};
  mov[dateOffset(e,-2)]="Karfreitag";mov[dateOffset(e,1)]="Ostermontag";mov[dateOffset(e,39)]="Christi Himmelfahrt";mov[dateOffset(e,50)]="Pfingstmontag";
  const fixed={"01-01":"Neujahr","05-01":"Tag der Arbeit","10-03":"Tag der Deutschen Einheit","10-31":"Reformationstag","12-25":"1. Weihnachtstag","12-26":"2. Weihnachtstag"};
  return mov[ds]||fixed[md]||null
}
function seasonDates(y){
  const T=(y-2000)/1000,T2=T*T,T3=T2*T,T4=T3*T;
  const vals={
    spring:2451623.80984+365242.37404*T+0.05169*T2-0.00411*T3-0.00057*T4,
    summer:2451716.56767+365241.62603*T+0.00325*T2+0.00888*T3-0.00030*T4,
    autumn:2451810.21715+365242.01767*T-0.11575*T2+0.00337*T3+0.00078*T4,
    winter:2451900.05952+365242.74049*T-0.06223*T2-0.00823*T3+0.00032*T4
  };
  const toLocal=jd=>localDate(new Date((jd-2440587.5)*86400000));
  return {spring:toLocal(vals.spring),summer:toLocal(vals.summer),autumn:toLocal(vals.autumn),winter:toLocal(vals.winter)}
}
function seasonEvents(ds){
  const d=parseDate(ds),y=d.getFullYear(),out=[],s=seasonDates(y);
  const eventMap={};
  eventMap[s.spring]=["Frühlings-Tagundnachtgleiche","Ab jetzt gewinnt das Licht wieder deutlich an Raum."];
  eventMap[s.summer]=["Sommersonnenwende","Der längste Tag des Jahres – ein schöner Moment für draußen."];
  eventMap[s.autumn]=["Herbst-Tagundnachtgleiche","Licht und Dunkel sind ungefähr im Gleichgewicht."];
  eventMap[s.winter]=["Wintersonnenwende","Von nun an werden die Tage langsam wieder länger."];
  if(eventMap[ds])out.push({kind:"Natur",title:eventMap[ds][0],text:eventMap[ds][1]});
  const firstAdvent=nthSundayBeforeAdvent(y);for(let i=0;i<4;i++){const a=new Date(firstAdvent);a.setDate(firstAdvent.getDate()+7*i);if(localDate(a)===ds)out.push({kind:"Jahreszeit",title:`${i+1}. Advent`,text:"Vielleicht darf heute ein bisschen Licht und Gemütlichkeit einziehen."})}
  const customs={"12-06":["Nikolaustag","Vielleicht findet heute eine kleine Freude ihren Weg zu dir."],"12-24":["Heiligabend","Heute darf es gemütlich werden – auf deine Art."],"12-31":["Silvester","Du musst das Jahr nicht bewerten. Ein kurzer Blick auf Schönes reicht."],"02-14":["Valentinstag","Auch Freundlichkeit zu dir selbst darf heute dazugehören."]};
  if(customs[ds.slice(5)])out.push({kind:"Kalender",title:customs[ds.slice(5)][0],text:customs[ds.slice(5)][1]});
  return out
}
function wheelEvent(ds){
  const y=parseDate(ds).getFullYear(),s=seasonDates(y),map={
    [`${y}-02-01`]:["Imbolc","Im modernen Jahreskreis steht Imbolc für erstes Licht, Reinigung und beginnenden Frühling."],
    [s.spring]:["Ostara","Im modernen Jahreskreis wird Ostara mit der Frühlings-Tagundnachtgleiche verbunden."],
    [`${y}-05-01`]:["Beltane","Beltane wird im Jahreskreis mit Lebendigkeit, Wachstum und dem beginnenden Sommerhalbjahr verbunden."],
    [s.summer]:["Litha","Litha bezeichnet im modernen Jahreskreis die Sommersonnenwende und die Fülle des Lichts."],
    [`${y}-08-01`]:["Lughnasadh","Lughnasadh wird im Jahreskreis mit Erntebeginn, Dankbarkeit und dem Wandel des Sommers verbunden."],
    [s.autumn]:["Mabon","Mabon ist ein moderner Name für das Jahreskreisfest um die Herbst-Tagundnachtgleiche – Zeit für Ausgleich und Ernte."],
    [`${y}-10-31`]:["Samhain","Samhain markiert in verschiedenen neuheidnischen Traditionen den Übergang in die dunklere Jahreshälfte."],
    [s.winter]:["Yule","Yule wird im modernen Jahreskreis mit der Wintersonnenwende und der Rückkehr des Lichts verbunden."]
  };return map[ds]?{kind:"Jahreskreis",title:map[ds][0],text:map[ds][1]}:null
}
function rauhnachtEvent(ds){
  const picks={"12-25":[1,"Die erste Rauhnacht – vielleicht ein stiller Moment für das, was beginnen darf."],"12-28":[4,"Rauhnachtszeit – ein guter Abend, um etwas langsamer zu werden."],"12-31":[7,"Zwischen den Jahren: Was darf im alten Jahr bleiben?"],"01-03":[10,"Rauhnachtszeit – vielleicht heute einmal bewusst auf kleine Zeichen und Gedanken achten."],"01-05":[12,"Die Rauhnächte gehen zu Ende. Was möchtest du mit ins neue Jahr nehmen?"]};
  const v=picks[ds.slice(5)];return v?{kind:"Rauhnacht",title:`${v[0]}. Rauhnacht`,text:v[1]}:null
}
function schoolHolidayFor(ds){return SCHOOL_HOLIDAYS_NI.find(h=>ds>=h.start&&ds<=h.end)||null}
function schoolHolidayOccasion(ds,h){if(!h)return false;const n=daysBetween(h.start,ds),len=daysBetween(h.start,h.end);return n===0||n===len||n===Math.floor(len/2)||(n>0&&n<len&&n%7===3)}
function moonInfo(ds){
  const d=parseDate(ds),utc=Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),12),syn=29.530588853,ref=Date.UTC(2000,0,6,18,14),age=mod((utc-ref)/86400000,syn),frac=age/syn,stage=Math.round(frac*16)%16;
  const names=["Neumond","zunehmende Sichel","zunehmende Sichel","erstes Viertel","erstes Viertel","zunehmender Mond","zunehmender Mond","fast Vollmond","Vollmond","abnehmender Mond","abnehmender Mond","letztes Viertel","letztes Viertel","abnehmende Sichel","abnehmende Sichel","fast Neumond"];
  const phaseName=names[stage],fullDist=Math.abs(age-syn/2),newDist=Math.min(age,syn-age);
  let jd=utc/86400000+2440587.5,dj=jd-2451543.5,N=normDeg(125.1228-0.0529538083*dj),i=5.1454,w=normDeg(318.0634+0.1643573223*dj),a=60.2666,e=.0549,M=normDeg(115.3654+13.0649929509*dj),Mr=deg2rad(M),E=deg2rad(M+e*(180/Math.PI)*Math.sin(Mr)*(1+e*Math.cos(Mr))),xv=a*(Math.cos(E)-e),yv=a*Math.sqrt(1-e*e)*Math.sin(E),v=Math.atan2(yv,xv)*180/Math.PI,r=Math.sqrt(xv*xv+yv*yv),vw=deg2rad(v+w),Nr=deg2rad(N),ir=deg2rad(i),xh=r*(Math.cos(Nr)*Math.cos(vw)-Math.sin(Nr)*Math.sin(vw)*Math.cos(ir)),yh=r*(Math.sin(Nr)*Math.cos(vw)+Math.cos(Nr)*Math.sin(vw)*Math.cos(ir)),lon=normDeg(Math.atan2(yh,xh)*180/Math.PI),Lm=normDeg(N+w+M),ws=normDeg(282.9404+4.70935e-5*dj),Ms=normDeg(356.0470+0.9856002585*dj),Ls=normDeg(ws+Ms),D=deg2rad(normDeg(Lm-Ls)),F=deg2rad(normDeg(Lm-N));
  lon=normDeg(lon-1.274*Math.sin(deg2rad(M)-2*D)+0.658*Math.sin(2*D)-0.186*Math.sin(deg2rad(Ms))-0.059*Math.sin(2*deg2rad(M)-2*D)-0.057*Math.sin(deg2rad(M)-2*D+deg2rad(Ms))+0.053*Math.sin(deg2rad(M)+2*D)+0.046*Math.sin(2*D-deg2rad(Ms))+0.041*Math.sin(deg2rad(M)-deg2rad(Ms))-0.035*Math.sin(D)-0.031*Math.sin(deg2rad(M)+deg2rad(Ms))-0.015*Math.sin(2*F-2*D)+0.011*Math.sin(deg2rad(M)-4*D));
  const sign=ZODIAC[Math.floor(lon/30)%12];return {age,frac,stage,phaseName,sign,longitude:lon,isFull:fullDist<0.72,isNew:newDist<0.72}
}
function drawMoon(canvas,info){
  if(!canvas||!info)return;
  const ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height,r=Math.min(w,h)*.41,cx=w/2,cy=h/2,
    psi=2*Math.PI*info.frac,img=ctx.createImageData(w,h),data=img.data;
  const light=[231,220,196], dark=[58,59,56];
  for(let py=0;py<h;py++)for(let px=0;px<w;px++){
    const nx=(px-cx)/r,ny=(py-cy)/r,rr=nx*nx+ny*ny,idx=(py*w+px)*4;
    if(rr<=1){
      const z=Math.sqrt(Math.max(0,1-rr));
      const lit=nx*Math.sin(psi)+z*(-Math.cos(psi))>0;
      const edge=Math.max(0,Math.min(1,(1-rr)*10));
      const c=lit?light:dark;
      data[idx]=c[0];data[idx+1]=c[1];data[idx+2]=c[2];data[idx+3]=Math.round(255*edge);
    }
  }
  ctx.clearRect(0,0,w,h);
  ctx.putImageData(img,0,0);
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.strokeStyle="#555650";ctx.lineWidth=Math.max(1.4,w/46);ctx.stroke();
}

const FULL_MOON_NAMES={1:"Wolfsmond",2:"Schneemond",3:"Wurmmond",4:"Rosa Mond",5:"Blumenmond",6:"Erdbeermond",7:"Bockmond",8:"Störmond",9:"Erntemond",10:"Jägermond",11:"Bibermond",12:"Julmond"};
const METEOR_SHOWERS=[
  {name:"Quadrantiden",peak:"01-03",window:["01-02","01-04"],text:"In diesen Nächten sind oft besonders viele Sternschnuppen der Quadrantiden zu sehen – falls der Himmel klar ist."},
  {name:"Lyriden",peak:"04-22",window:["04-21","04-23"],text:"Rund um diese Nacht lohnt sich ein Blick in den Himmel: Die Lyriden bringen oft schöne Sternschnuppen."},
  {name:"Eta-Aquariiden",peak:"05-05",window:["05-04","05-06"],text:"Eine Sternschnuppen-Nacht: Die Eta-Aquariiden sind aktiv. Vielleicht heute Abend einmal nach oben schauen."},
  {name:"Perseiden",peak:"08-12",window:["08-11","08-13"],text:"Perseiden-Nächte – oft die bekanntesten Sternschnuppen des Jahres. Vielleicht magst du heute Abend kurz nach draußen gehen."},
  {name:"Orioniden",peak:"10-21",window:["10-20","10-22"],text:"Rund um diese Nacht ziehen die Orioniden über den Himmel. Ein schöner Anlass für einen kleinen Wunsch."},
  {name:"Leoniden",peak:"11-17",window:["11-16","11-18"],text:"Leoniden-Nächte – vielleicht huscht heute eine Sternschnuppe über den Himmel."},
  {name:"Geminiden",peak:"12-14",window:["12-13","12-15"],text:"Die Geminiden gelten oft als besonders eindrucksvoll. Vielleicht ist heute eine gute Sternschnuppen-Nacht."}
];
const BLOOD_MOON_DATES={
  "2026-03-03":"Heute ist eine totale Mondfinsternis – oft auch Blutmond genannt. Falls der Himmel klar ist, lohnt sich heute ein Blick nach draußen.",
  "2028-12-31":"In dieser Nacht steht eine totale Mondfinsternis an – ein Blutmond. Vielleicht magst du, wenn der Himmel klar ist, kurz hinausgehen."
};
function meteorShowerEvent(ds){
  const md=ds.slice(5);
  for(const m of METEOR_SHOWERS){
    if(md===m.peak)return {kind:"Sternschnuppen",title:`${m.name} · Höhepunkt`,text:m.text};
    if(m.window.includes(md))return {kind:"Sternschnuppen",title:`${m.name} · aktive Nächte`,text:m.text};
  }
  return null
}

function specialEventsFor(ds){
  const cfg=state.settings.calendar||DEFAULT.settings.calendar,out=[],holiday=holidayFor(ds),mi=moonInfo(ds);
  if(cfg.holidays&&holiday)out.push({kind:"Feiertag",title:holiday,text:{"Neujahr":"Ein neues Jahr darf ganz leise anfangen.","Karfreitag":"Ein stiller Feiertag – vielleicht ist heute weniger genau richtig.","Ostermontag":"Ein Feiertag für einen ruhigen oder schönen zusätzlichen Tag.","Tag der Arbeit":"Heute darf auch das Nicht-Arbeiten seinen Platz haben.","Christi Himmelfahrt":"Ein Feiertag – vielleicht ein guter Tag für etwas Zeit draußen.","Pfingstmontag":"Ein freier Montag darf sich auch wirklich frei anfühlen.","Tag der Deutschen Einheit":"Heute ist bundesweiter Feiertag.","Reformationstag":"Heute ist in Niedersachsen Feiertag.","1. Weihnachtstag":"Heute darf Gemütlichkeit wichtiger sein als irgendeine Liste.","2. Weihnachtstag":"Noch ein Feiertag – du musst heute nichts nachholen."}[holiday]||"Heute ist Feiertag."});
  if(cfg.seasons)out.push(...seasonEvents(ds));
  if(cfg.wheel){const w=wheelEvent(ds);if(w)out.push(w)}
  if(cfg.rauhnacht){const r=rauhnachtEvent(ds);if(r)out.push(r)}
  if(cfg.farmers){const rule=FARMERS_RULES[ds.slice(5)];if(rule)out.push({kind:"Bauernregel",title:"Alter Lostag",text:rule})}
  const hol=schoolHolidayFor(ds);
  if(cfg.schoolHolidays&&hol&&schoolHolidayOccasion(ds,hol))out.push({kind:"Ferien",title:`${hol.name} · Niedersachsen`,text:ds===hol.start?"Die Ferien beginnen. Versuch, sie dir auch wirklich ein bisschen zu erlauben. ♡":ds===hol.end?"Letzter Ferientag – vielleicht noch einmal bewusst langsam machen.":"Du hast Ferien. Nicht jeder freie Tag braucht einen Plan."});

  return out
}

function skyQuoteEventFor(ds){
  const cfg=state.settings.calendar||DEFAULT.settings.calendar;
  if(!cfg.moon&&!cfg.seasons)return null;
  if(cfg.moon&&BLOOD_MOON_DATES[ds])return {kind:"Besonderer Mond",title:"Blutmond · totale Mondfinsternis",text:BLOOD_MOON_DATES[ds]};
  if(cfg.moon){
    const mi=moonInfo(ds);
    if(mi.isFull){
      const moonName=FULL_MOON_NAMES[parseDate(ds).getMonth()+1];
      return {kind:"Mond",title:`Vollmond · ${moonName}`,text:`${moonName} – vielleicht heute Abend einmal nach draußen schauen. ♡`};
    }
    if(mi.isNew)return {kind:"Mond",title:"Neumond",text:"Neumond – vielleicht ein schöner Abend für einen ruhigen Gedanken an etwas, das neu beginnen darf. ♡"};
  }
  if(cfg.seasons){
    const meteor=meteorShowerEvent(ds);
    if(meteor)return meteor;
  }
  return null
}

function quoteForDate(ds){
  const cfg=state.settings.calendar||DEFAULT.settings.calendar,custom=Array.isArray(cfg.customQuotes)?cfg.customQuotes.filter(Boolean):[],choice=state.quoteChoices?.[ds];
  if(Number.isInteger(choice)){const pool=[...DAILY_QUOTES,...custom];return {text:pool[mod(choice,pool.length)]||DAILY_QUOTES[0],context:"Für diesen Tag von dir gewechselt"}}
  const events=specialEventsFor(ds);
  if(events.length){const e=events[0];return {text:e.text,context:`${e.kind} · ${e.title}`}}
  const sky=skyQuoteEventFor(ds);if(sky)return {text:sky.text,context:`${sky.kind} · ${sky.title}`};
  if(!cfg.dailyQuotes)return {text:"",context:""};
  const pool=[...DAILY_QUOTES,...custom],idx=(dayOfYear(ds)-1)%pool.length;return {text:pool[idx],context:"Tagesgedanke"}
}
function rerollDailyQuote(){
  const cfg=state.settings.calendar||DEFAULT.settings.calendar,pool=[...DAILY_QUOTES,...((cfg.customQuotes||[]).filter(Boolean))];let current=state.quoteChoices?.[selectedDate];if(!Number.isInteger(current))current=(dayOfYear(selectedDate)-1)%pool.length;state.quoteChoices=state.quoteChoices||{};state.quoteChoices[selectedDate]=(current+17)%pool.length;save();showToast("Anderer Spruch für diesen Tag")
}
function renderMoon(){
  const cfg=state.settings.calendar||DEFAULT.settings.calendar,
    chip=document.querySelector("#moonChip"),
    show=cfg.moon&&homeVisibility().moon&&document.querySelector("#todayView")?.classList.contains("active");
  if(!chip)return;
  chip.style.display=show?"flex":"none";
  if(!show)return;
  try{
    const info=moonInfo(selectedDate);
    document.querySelector("#moonPhaseName").textContent=info.phaseName;
    document.querySelector("#moonSignName").textContent=`Mond im ${info.sign}`;
    drawMoon(document.querySelector("#moonCanvas"),info);
    drawMoon(document.querySelector("#moonDialogCanvas"),info);
    document.querySelector("#moonDialogPhase").textContent=info.phaseName;
    document.querySelector("#moonDialogSign").textContent=`Mond im ${info.sign} · ca. ${info.age.toFixed(1).replace(".",",")} Tage alt`;
    document.querySelector("#moonDialogText").innerHTML=`<b>Traditionelle astrologische Deutung:</b> ${ZODIAC_NOTES[info.sign]}.<br><br><b>Astronomisch:</b> Die Zeichnung zeigt die berechnete Beleuchtung für den gewählten Tag.`;
  }catch(e){
    document.querySelector("#moonPhaseName").textContent="Mond";
    document.querySelector("#moonSignName").textContent="Phase konnte nicht geladen werden";
  }
}
function renderCalendarSpecial(){return}
function renderDailyQuote(){const q=quoteForDate(selectedDate),el=document.querySelector("#dailyQuote"),ctx=document.querySelector("#stickyContext");if(el)el.textContent=q.text||"Heute darf der Zettel einfach leer bleiben. ♡";if(ctx)ctx.textContent=q.context||""}
function enabledTodoItems(){
  let items=Array.isArray(state.settings.todoItems)?state.settings.todoItems:[];
  if(!items.length)items=DEFAULT.settings.todoItems;
  return items.filter(x=>x.enabled&&x.label)
}
function wellbeingStreak(id,ds=selectedDate){
  let cur=ds,count=0;
  while(state.wellbeingDone?.[cur]?.[id]){count++;cur=addDays(cur,-1)}
  return count
}
function renderWellbeing(){
  const box=document.querySelector("#wellbeingList");if(!box)return;
  const items=enabledTodoItems(),done=state.wellbeingDone?.[selectedDate]||{};
  box.innerHTML=items.length?items.map(x=>{const streak=wellbeingStreak(x.id,selectedDate);return `<button class="wellbeing-item${done[x.id]?" done":""}" data-todo="${escapeHtml(x.id)}" type="button"><span class="wellbeing-check">${done[x.id]?"✓":""}</span><span class="wellbeing-label">${escapeHtml(x.label)}</span><span class="wellbeing-streak">${streak} ${streak===1?"Tag":"Tage"}</span></button>`}).join(""):'<div class="wellbeing-empty">Hier erscheinen deine kleinen Ziele wie Spaziergang, Bewegung, Ruhepause oder Abendroutine. Falls nichts angezeigt wird, kannst du sie in den Einstellungen wieder aktivieren.</div>';
  box.querySelectorAll("[data-todo]").forEach(b=>b.onclick=()=>{state.wellbeingDone=state.wellbeingDone||{};state.wellbeingDone[selectedDate]=state.wellbeingDone[selectedDate]||{};const id=b.dataset.todo;state.wellbeingDone[selectedDate][id]=!state.wellbeingDone[selectedDate][id];save()})
}
function renderTodoSettings(){
  const box=document.querySelector("#todoSettings");if(!box)return;box.innerHTML=(state.settings.todoItems||[]).map((x,i)=>`<div class="todo-setting-row"><input type="checkbox" data-todo-enable="${i}" ${x.enabled?"checked":""}><input type="text" data-todo-label="${i}" value="${escapeHtml(x.label)}"><button class="todo-delete" type="button" data-todo-delete="${i}">×</button></div>`).join("");box.querySelectorAll("[data-todo-delete]").forEach(b=>b.onclick=()=>{state.settings.todoItems.splice(Number(b.dataset.todoDelete),1);renderTodoSettings()})
}
function collectTodoSettings(){const items=state.settings.todoItems||[];document.querySelectorAll("[data-todo-enable]").forEach(x=>{const i=Number(x.dataset.todoEnable);if(items[i])items[i].enabled=x.checked});document.querySelectorAll("[data-todo-label]").forEach(x=>{const i=Number(x.dataset.todoLabel);if(items[i])items[i].label=x.value.trim()});state.settings.todoItems=items.filter(x=>x.label)}

function addDays(ds,n){
  const d=parseDate(ds);d.setDate(d.getDate()+n);return localDate(d)
}
function renderWeekStrip(){
  const box=document.querySelector("#weekStrip");if(!box)return;
  const center=parseDate(selectedDate),dow=(center.getDay()+6)%7,start=new Date(center);start.setDate(center.getDate()-dow);
  const days=[];
  for(let i=0;i<7;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const ds=localDate(d),active=ds===selectedDate;
    days.push(`<button class="week-day${active?" active":""}" data-date="${ds}" aria-label="${d.toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"2-digit"})}"><b>${["MO","DI","MI","DO","FR","SA","SO"][i]}</b><span>${d.getDate()}</span></button>`);
  }
  box.innerHTML=`<button class="week-arrow" data-shift="-7" aria-label="Vorherige Woche">‹</button>${days.join("")}<button class="week-arrow" data-shift="7" aria-label="Nächste Woche">›</button>`;
  box.querySelectorAll("[data-date]").forEach(b=>b.onclick=()=>{selectedDate=b.dataset.date;renderAll()});
  box.querySelectorAll("[data-shift]").forEach(b=>b.onclick=()=>{selectedDate=addDays(selectedDate,Number(b.dataset.shift));renderAll()});
}

function renderHeader(){
  const title=document.querySelector("#pageTitle"),
    line=document.querySelector("#dateLine"),
    actual=document.querySelector("#todayActualDate"),
    isToday=selectedDate===localDate();

  title.classList.toggle("selected-date-title",!isToday);

  if(isToday){
    const d=parseDate(selectedDate);
    title.textContent="Heute";
    line.textContent="Kleine Schritte, große Veränderung";
    if(actual){
      actual.textContent=d.toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"long"});
      actual.style.display="block";
    }
  }else{
    const d=parseDate(selectedDate);
    title.textContent=d.toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit"});
    line.textContent=d.toLocaleDateString("de-DE",{weekday:"long",day:"2-digit",month:"long"});
    if(actual)actual.style.display="none";
  }

  renderWeekStrip();
  renderCalendarSpecial();
  renderDailyQuote();
  renderWellbeing();
  renderMoon();
}

function homeVisibility(){return {...DEFAULT.settings.homeVisibility,...(state.settings.homeVisibility||{})}}
function renderHomeVisibility(){
  const v=homeVisibility();
  const water=document.querySelector("#waterTodayCard"),free=document.querySelector("#freeDaysTodayCard"),summary=document.querySelector("#todaySummary");
  if(water)water.style.display=v.water?"block":"none";
  if(free)free.style.display=v.freeDays?"block":"none";
  if(summary){
    summary.style.display=(v.water||v.freeDays)?"grid":"none";
    summary.style.gridTemplateColumns=(v.water&&v.freeDays)?"1.1fr .9fr":"1fr";
  }
  const weight=document.querySelector("#weightTodayCard");
  if(weight&&!v.weight)weight.style.display="none";
  const qTitle=document.querySelector("#quickSectionTitle"),qGrid=document.querySelector("#quickGrid");
  if(qTitle)qTitle.style.display=v.quick?"flex":"none";if(qGrid)qGrid.style.display=v.quick?"grid":"none";
  const wb=document.querySelector("#wellbeingCard");if(wb)wb.style.display=v.wellbeing?"block":"none";
  const st=document.querySelector("#dailySticky");if(st)st.style.display=v.sticky?"block":"none";
  const top=document.querySelector("#todayTopGrid");if(top)top.style.display=(v.wellbeing||v.sticky)?"grid":"none";
  const cs=document.querySelector("#calendarSpecial");if(cs&&!v.calendarSpecial)cs.classList.remove("show");
}

function renderSummary(){
  const list=todayEntries();
  const waters=list.filter(e=>e.tags?.includes("water")||(e.type==="drink"&&String(e.value).toLowerCase()==="wasser"));
  const totalMl=waters.reduce((s,e)=>s+(Number(e.amountMl)||Number(state.settings.waterMl)||0),0),liters=totalMl/1000;
  document.querySelector("#waterCount").textContent=`${liters.toFixed(1).replace(".",",")} / 3,0 L`;
  document.querySelector("#waterSub").textContent=totalMl?`${waters.length} Wasser-Eintrag${waters.length===1?"":"e"}`:"Noch nichts eingetragen";
  const bar=document.querySelector("#waterProgressBar");if(bar)bar.style.width=`${Math.min(100,(totalMl/3000)*100)}%`;
  const goalBox=document.querySelector("#freeGoalsTodayList"),goals=freeGoalsSettings().filter(g=>g.enabled!==false);
  if(goalBox)goalBox.innerHTML=goals.length?goals.map(g=>{const info=freeGoalStreakInfo(g,selectedDate);return `<div class="free-goal-today"><span>${escapeHtml(g.label)}</span><strong>${info.days}</strong><small>${info.days===1?"Tag":"Tage"} am Stück</small></div>`}).join(""):'<div class="free-goal-empty">Noch keine Serie angelegt.</div>';
  const legend=document.querySelector("#calendarFreeLegend");if(legend)legend.textContent="freie Ziele";
  if(selectedDate===localDate())goals.forEach(g=>maybeCelebrateFreeGoal(g,freeGoalStreakInfo(g,selectedDate).days));
  renderHomeVisibility();
}
function renderWeightToday(){
  const all=weightEntriesSorted(),card=document.querySelector("#weightTodayCard");if(!homeVisibility().weight){card.style.display="none";return}
  const upto=all.filter(e=>e.date<=selectedDate);
  if(!upto.length){card.style.display="none";return}
  const latest=upto[upto.length-1],latestKey=latest.date+"T"+latest.time;
  const prev=[...upto].reverse().find(e=>(e.date+"T"+e.time)<latestKey),first=upto[0];
  card.style.display="block";
  document.querySelector("#weightTodayValue").textContent=`${Number(latest.weightKg).toFixed(1).replace(".",",")} kg`;
  document.querySelector("#weightTodayTime").textContent=`${parseDate(latest.date).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"})} · ${latest.time}`;
  document.querySelector("#weightTodayDelta").textContent=prev?formatWeightDelta(Number(latest.weightKg)-Number(prev.weightKg)):"–";
  document.querySelector("#weightTodayDeltaFirst").textContent=first?formatWeightDelta(Number(latest.weightKg)-Number(first.weightKg)):"–";
}
function celebrationState(){try{return JSON.parse(localStorage.getItem(CELEBRATION_KEY))||{beer:[],freeDays:[],weight:[]}}catch(e){return {beer:[],freeDays:[],weight:[]}}}
function maybeCelebrateFreeGoal(goal,days){
  const milestones=[];for(let d=7;d<=28;d+=7)milestones.push(d);for(let d=30;d<=720;d+=30)milestones.push(d);
  const reached=milestones.filter(m=>m<=days).sort((a,b)=>b-a)[0];if(!reached)return;
  const c=celebrationState(),key=`${goal.id}:${reached}`;c.freeDays=c.freeDays||[];
  if(c.freeDays.includes(key))return;c.freeDays.push(key);localStorage.setItem(CELEBRATION_KEY,JSON.stringify(c));
  setTimeout(()=>{confetti(reached%30===0?70:34);showToast(`${goal.label}: ${reached} Tage – ${reached%30===0?"Monatsmeilenstein!":"volle Woche!"}`)},350);
}
function confetti(count){
  const colors=["#2f6555","#c9a75e","#d57575","#8caf9c","#e1cfae"];
  for(let i=0;i<count;i++){
    const el=document.createElement("i");el.className="confetti-piece";el.style.left=Math.random()*100+"vw";el.style.background=colors[i%colors.length];el.style.setProperty("--dur",(2.4+Math.random()*2.4)+"s");el.style.setProperty("--rot",Math.random()*360+"deg");el.style.setProperty("--drift",(-80+Math.random()*160)+"px");el.style.animationDelay=(Math.random()*.5)+"s";document.body.appendChild(el);setTimeout(()=>el.remove(),5200);
  }
}
function renderQuick(){
  const g=document.querySelector("#quickGrid");g.innerHTML="";
  const qs=[
    {label:state.settings.waterLabel||"Wasser",sub:`${state.settings.waterMl||700} ml`,type:"drink",value:"Wasser",tag:"water",amountMl:Number(state.settings.waterMl)||700},
    {label:"Bauchschmerzen",sub:"jetzt",type:"symptom",value:"Bauchschmerzen"},
    {label:"Durchfall",sub:"jetzt",type:"symptom",value:"Durchfall"},
    {label:"Sodbrennenmittel",sub:"genommen",type:"medicine",value:"Sodbrennenmittel"}
  ];
  qs.forEach(q=>{const b=document.createElement("button");b.className="quick-btn";b.innerHTML=`${escapeHtml(q.label)}<small>${escapeHtml(q.sub)}</small>`;b.onclick=()=>{addEntry(q.type,q.value,{tags:q.tag?[q.tag]:[],amountMl:q.amountMl||null});save();showToast(`${q.label} gespeichert`)};g.appendChild(b)});
}
function renderTimeline(){
  renderHeader();const list=todayEntries(),box=document.querySelector("#timeline");
  document.querySelector("#timelineDayLabel").textContent=selectedDate===localDate()?"heute":parseDate(selectedDate).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
  if(!list.length){box.innerHTML='<div class="empty">Für diesen Tag ist noch nichts eingetragen.</div>';return}
  const groups=[];
  for(const e of list){let last=groups[groups.length-1];if(e.mealId&&last?.mealId===e.mealId)last.items.push(e);else groups.push({mealId:e.mealId,time:e.time,items:[e]})}
  box.innerHTML=groups.map(g=>{
    const first=g.items[0], isMeal=first.type==="food" && g.items.length>=1;
    const notes=g.items.map(e=>e.note).filter(Boolean).join(" · ");
    const catLabels=categoryLabelsFromEntries(g.items);
    if(isMeal){
      const values=g.items.map(e=>escapeHtml(e.value)).join(", ");
      const photo=mealPhoto(g.mealId);
      return `<div class="meal-card editable" data-edit-id="${first.id}" role="button" tabindex="0">
        <div class="meal-thumb${photo?"":" empty"}">${photo?`<img src="${photo}" alt="Essensfoto">`:"🍽️"}</div>
        <div class="meal-content">
          <div class="meal-head"><div class="meal-title">Mahlzeit</div><div class="meal-time">${g.time} Uhr</div></div>
          <div class="meal-desc">${values}</div>
          ${(notes||catLabels.length)?`<div class="meal-note">${notes?escapeHtml(notes):""}${notes&&catLabels.length?" · ":""}${catLabels.map(escapeHtml).join(" · ")}</div>`:""}
        </div>
        <div class="meal-actions"><span class="meal-photo-badge">📷</span></div>
      </div>`;
    }
    const vals=g.items.map(e=>e.type==="period"?`Periode${e.periodFlow?" · "+e.periodFlow:""}`:escapeHtml(e.value)).join(g.items.length>1?" · ":"");
    const meta=[...new Set(g.items.map(e=>typeLabel(e.type)))].join(", ");
    return `<div class="meal-card compact editable" data-edit-id="${first.id}" role="button" tabindex="0">
      <div class="meal-time">${g.time} Uhr</div>
      <div class="meal-content">
        <div class="entry-compact-title">${vals}</div>
        <div class="entry-compact-meta">${meta}${notes?" · "+escapeHtml(notes):""}${catLabels.length?" · "+catLabels.map(escapeHtml).join(" · "):""}</div>
      </div>
    </div>`;
  }).join("");
  box.querySelectorAll("[data-edit-id]").forEach(card=>{const open=()=>openEditDialog(card.dataset.editId);card.onclick=open;card.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}}});
}
function renderKnown(){document.querySelector("#knownItems").innerHTML=knownItems().map(x=>`<option value="${escapeHtml(x)}"></option>`).join("")}

const TYPE_UI={
  food:{title:"Essen eintragen",valueLabel:"Was gegessen?",placeholder:"z. B. Kartoffeln, Möhren, Salat",hint:"Mehrere Bestandteile mit Komma trennen – sie werden als eine Mahlzeit zusammengefasst.",amount:false,value:true},
  drink:{title:"Trinken eintragen",valueLabel:"Was getrunken?",placeholder:"z. B. Wasser, Tee",hint:"Die Menge kann in Millilitern ergänzt werden.",amount:true,unit:"ml",amountLabel:"Menge (optional)",chips:[250,330,500,700],value:true},
  weight:{title:"Gewicht eintragen",valueLabel:"",placeholder:"",hint:"Gewicht in Kilogramm.",amount:true,unit:"kg",amountLabel:"Gewicht",chips:[],value:false},
  symptom:{title:"Beschwerde eintragen",valueLabel:"Welche Beschwerde?",placeholder:"z. B. Bauchschmerzen",hint:"",amount:false,value:true},
  medicine:{title:"Mittel eintragen",valueLabel:"Was genommen?",placeholder:"z. B. Sodbrennenmittel",hint:"",amount:false,value:true},
  period:{title:"Periode eintragen",valueLabel:"",placeholder:"",hint:"Der Tag wird im Kalender mit einem roten Punkt markiert.",amount:false,value:false,period:true}
};

function selectedEntryCategoryIds(){
  return [...document.querySelectorAll('#entryCategoryList input[type="checkbox"]:checked')].map(x=>x.value)
}
function renderEntryCategories(type,selected=[]){
  const wrap=document.querySelector("#entryCategoryWrap"),box=document.querySelector("#entryCategoryList");
  if(!wrap||!box)return;
  const allowed=type==="food"||type==="drink";
  wrap.style.display=allowed?"grid":"none";
  if(!allowed){box.innerHTML="";return}
  const selectedSet=new Set(selected);
  box.innerHTML=allEntryCategories().map(c=>`<label class="category-choice"><input type="checkbox" value="${escapeHtml(c.id)}" ${selectedSet.has(c.id)?"checked":""}><span>${escapeHtml(c.label)}</span></label>`).join("");
}
function rememberedCategoriesFor(value){
  return state.itemTagMemory?.[normalizedItem(value)]||[]
}
function rememberCategories(value,ids){
  const key=normalizedItem(value);if(!key)return;
  state.itemTagMemory=state.itemTagMemory||{};
  if(ids.length)state.itemTagMemory[key]=[...new Set(ids)];
  else delete state.itemTagMemory[key];
}
function autoCategoryIds(type,value){
  if(!(type==="food"||type==="drink"))return [];
  const ids=[...rememberedCategoriesFor(value)];
  if(normalizedItem(value)==="bier"){
    if(!ids.includes("beer"))ids.push("beer");
    if(!ids.includes("alcohol"))ids.push("alcohol");
  }
  return ids
}
function refreshEntryCategoriesFromValue(){
  const type=document.querySelector("#entryType").value,value=document.querySelector("#entryValue").value;
  if(editingIds.length)return;
  renderEntryCategories(type,autoCategoryIds(type,value));
}
function categoryLabelsFromEntries(items){
  const ids=new Set();
  items.forEach(e=>(e.tags||[]).forEach(t=>{if(String(t).startsWith("cat:"))ids.add(String(t).slice(4))}));
  if(items.some(e=>normalizedItem(e.value)==="bier"))ids.add("beer");
  const map=new Map(allEntryCategories().map(c=>[c.id,c.label]));
  return [...ids].map(id=>map.get(id)).filter(Boolean)
}

function clearEditing(){editingIds=[];editingDate=null;document.querySelector("#deleteEntry").style.display="none"}
function openTypeDialog(){document.querySelector("#typeDialog").showModal()}
function configureEntryForm(type){
  const cfg=TYPE_UI[type]||TYPE_UI.food;document.querySelector("#entryType").value=type;document.querySelector("#entryDialogTitle").textContent=cfg.title;
  const vw=document.querySelector("#entryValueWrap"),aw=document.querySelector("#entryAmountWrap"),pw=document.querySelector("#periodFlowWrap"),ph=document.querySelector("#entryPhotoWrap");
  vw.style.display=cfg.value?"grid":"none";aw.style.display=cfg.amount?"grid":"none";pw.style.display=cfg.period?"grid":"none";
  if(ph)ph.classList.toggle("show",type==="food");
  document.querySelector("#entryValueText").textContent=cfg.valueLabel||"Was?";document.querySelector("#entryValue").placeholder=cfg.placeholder||"";
  document.querySelector("#entryAmountText").textContent=cfg.amountLabel||"Menge";document.querySelector("#entryUnit").textContent=cfg.unit||"";document.querySelector("#entryAmount").step=type==="weight"?"0.1":"1";document.querySelector("#entryAmount").min=type==="weight"?"1":"0";
  document.querySelector("#entryHint").textContent=cfg.hint||"";
  const chips=document.querySelector("#amountChips");chips.innerHTML=(cfg.chips||[]).map(n=>`<button type="button" class="chip" data-amount="${n}">${n} ${cfg.unit}</button>`).join("");chips.querySelectorAll("[data-amount]").forEach(b=>b.onclick=()=>document.querySelector("#entryAmount").value=b.dataset.amount);
  renderEntryCategories(type,[]);
}
function openNewEntry(type){
  clearEditing();document.querySelector("#typeDialog").close();configureEntryForm(type);document.querySelector("#entryTime").value=localTime();document.querySelector("#entryValue").value="";document.querySelector("#entryAmount").value="";document.querySelector("#periodFlow").value="";document.querySelector("#entryNote").value="";resetPhotoField();renderEntryCategories(type,[]);document.querySelector("#entryDialog").showModal();
}
function openEditDialog(id){
  const first=state.entries.find(e=>e.id===id);if(!first)return;const items=first.mealId?state.entries.filter(e=>e.mealId===first.mealId&&e.date===first.date):[first];editingIds=items.map(e=>e.id);editingDate=first.date;configureEntryForm(first.type);document.querySelector("#entryDialogTitle").textContent=items.length>1?"Mahlzeit ändern":TYPE_UI[first.type]?.title||"Eintrag ändern";document.querySelector("#entryTime").value=first.time;document.querySelector("#entryValue").value=first.type==="food"&&items.length>1?items.map(e=>e.value).join(", "):first.value||"";document.querySelector("#entryAmount").value=first.type==="weight"?first.weightKg??"":first.type==="drink"?first.amountMl??"":"";document.querySelector("#periodFlow").value=first.periodFlow||"";document.querySelector("#entryNote").value=first.note||"";resetPhotoField();if(first.type==="food"){entryPhotoData=mealPhoto(first.mealId);setPhotoPreview(entryPhotoData)}const editCats=new Set();items.forEach(e=>(e.tags||[]).forEach(t=>{if(String(t).startsWith("cat:"))editCats.add(String(t).slice(4))}));if(items.some(e=>normalizedItem(e.value)==="bier"))editCats.add("beer");renderEntryCategories(first.type,[...editCats]);document.querySelector("#deleteEntry").style.display="block";document.querySelector("#entryDialog").showModal();
}
function saveDialog(ev){
  ev.preventDefault();
  const type=document.querySelector("#entryType").value,time=document.querySelector("#entryTime").value||localTime(),
    raw=document.querySelector("#entryValue").value.trim(),note=document.querySelector("#entryNote").value.trim(),
    amountRaw=document.querySelector("#entryAmount").value.trim(),flow=document.querySelector("#periodFlow").value;
  const date=editingIds.length?(editingDate||selectedDate):selectedDate,
    oldItems=editingIds.length?state.entries.filter(e=>editingIds.includes(e.id)):[],
    oldMealId=oldItems.find(e=>e.mealId)?.mealId||null,
    preservedTags=oldItems.length===1?(oldItems[0].tags||[]):[];
  if(type==="food"&&!raw)return showToast("Bitte Essen eintragen");
  if(["drink","symptom","medicine"].includes(type)&&!raw)return showToast("Bitte etwas eintragen");
  let amount=null,weight=null;
  if(type==="drink"&&amountRaw){amount=Number(amountRaw);if(!Number.isFinite(amount)||amount<=0)return showToast("Bitte eine gültige Menge in ml eingeben")}
  if(type==="weight"){weight=Number(String(amountRaw).replace(",","."));if(!Number.isFinite(weight)||weight<=0)return showToast("Bitte Gewicht in kg eingeben")}
  const categoryIds=(type==="food"||type==="drink")?selectedEntryCategoryIds():[];
  if(normalizedItem(raw)==="bier"){
    if(!categoryIds.includes("beer"))categoryIds.push("beer");
    if(!categoryIds.includes("alcohol"))categoryIds.push("alcohol");
  }
  const catTags=categoryIds.map(categoryTag);
  if(editingIds.length)state.entries=state.entries.filter(e=>!editingIds.includes(e.id));
  if(type==="food"){
    const mealId=oldMealId||uid(),parts=raw.split(",").map(x=>x.trim()).filter(Boolean);
    parts.forEach(v=>{addEntry("food",v,{date,time,note,mealId,tags:catTags});rememberCategories(v,categoryIds)});
    state.mealPhotos=state.mealPhotos||{};
    if(removeEntryPhoto) delete state.mealPhotos[mealId];
    else if(entryPhotoData) state.mealPhotos[mealId]=entryPhotoData;
  }else if(type==="drink"){
    const baseTags=preservedTags.filter(t=>!String(t).startsWith("cat:"));
    if(raw.toLowerCase()==="wasser"&&!baseTags.includes("water"))baseTags.push("water");
    addEntry("drink",raw,{date,time,note,amountMl:amount,tags:[...new Set([...baseTags,...catTags])]});
    rememberCategories(raw,categoryIds);
  }else if(type==="weight")addEntry("weight",`${weight.toFixed(1).replace(".",",")} kg`,{date,time,note,weightKg:weight});
  else if(type==="period")addEntry("period","Periode",{date,time,note,periodFlow:flow});
  else addEntry(type,raw,{date,time,note,tags:preservedTags});
  clearEditing();resetPhotoField();document.querySelector("#entryDialog").close();save();showToast("Gespeichert");
}
function deleteCurrentEntry(){if(!editingIds.length)return;const many=editingIds.length>1;if(!confirm(many?"Diese ganze Mahlzeit wirklich löschen?":"Diesen Eintrag wirklich löschen?"))return;const oldItems=state.entries.filter(e=>editingIds.includes(e.id));const oldMealId=oldItems.find(e=>e.mealId)?.mealId||null;state.entries=state.entries.filter(e=>!editingIds.includes(e.id));if(oldMealId&&state.mealPhotos)delete state.mealPhotos[oldMealId];clearEditing();resetPhotoField();document.querySelector("#entryDialog").close();save();showToast("Gelöscht")}

function setView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.view===id));
  document.querySelector("#fab").style.display=id==="todayView"?"block":"none";
  const topbar=document.querySelector(".topbar");
  if(topbar)topbar.style.display=id==="todayView"?"block":"none";
  if(id==="todayView"){
    renderHeader();renderTimeline();
  }else{
    const chip=document.querySelector("#moonChip");if(chip)chip.style.display="none";
  }
  if(id==="monthView")renderMonth();
  if(id==="analysisView")renderPatterns();
  if(id==="settingsView")renderSettings();
}
function monthEntries(){const y=shownMonth.getFullYear(),m=shownMonth.getMonth();return state.entries.filter(e=>{const d=parseDate(e.date);return d.getFullYear()===y&&d.getMonth()===m})}
function buildFilter(){
  const s=document.querySelector("#monthFilter"),prev=s.value||"all";const opts=[["all","Alles"],["type:food","Essen"],["type:drink","Trinken"],["type:symptom","Beschwerden"],["type:medicine","Mittel"],["type:weight","Gewicht"],["type:period","Periode"],["drink:Bier","Bier"],["drink:Wasser","Wasser"]];allEntryCategories().forEach(c=>opts.push(["category:"+c.id,"Kategorie: "+c.label]));
  const seen=new Set();knownItems().forEach(v=>opts.push(["value:"+v,v]));s.innerHTML=opts.filter(([v])=>!seen.has(v)&&seen.add(v)).map(([v,l])=>`<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join("");if([...s.options].some(o=>o.value===prev))s.value=prev;
}
function matchesFilter(e,f){if(f==="all")return true;if(f.startsWith("value:"))return e.value===f.slice(6);if(f.startsWith("type:"))return e.type===f.slice(5);if(f.startsWith("category:"))return entryHasCategory(e,f.slice(9));const i=f.indexOf(":");return e.type===f.slice(0,i)&&e.value===f.slice(i+1)}
function monthWeightEntries(){
  const y=shownMonth.getFullYear(),m=shownMonth.getMonth();const morning=weightEntriesSorted().filter(e=>{const d=parseDate(e.date);return d.getFullYear()===y&&d.getMonth()===m&&e.time<"12:00"});const firstPerDay=new Map();morning.forEach(e=>{if(!firstPerDay.has(e.date))firstPerDay.set(e.date,e)});return [...firstPerDay.values()];
}
function drawWeightChart(canvas,pts,height=175){
  if(!canvas)return;const ctx=canvas.getContext("2d"),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=Math.max(220,rect.width||canvas.parentElement.clientWidth||280),h=height;canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.height=h+"px";ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  if(!pts.length){ctx.font="12px system-ui";ctx.fillStyle="#777";ctx.fillText("Noch keine Morgenmessungen",12,30);return}
  const vals=pts.map(p=>Number(p.weightKg)),min=Math.min(...vals),max=Math.max(...vals),padY=Math.max(.5,(max-min)*.25),lo=min-padY,hi=max+padY,left=38,right=10,top=12,bottom=24,cw=w-left-right,ch=h-top-bottom,y=v=>top+(hi-v)/(hi-lo||1)*ch,x=i=>pts.length===1?left+cw/2:left+i*cw/(pts.length-1);
  ctx.strokeStyle="#e4ddd2";ctx.lineWidth=1;ctx.font="10px system-ui";ctx.fillStyle="#777";for(let i=0;i<4;i++){const yy=top+i*ch/3,val=hi-i*(hi-lo)/3;ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke();ctx.fillText(val.toFixed(1).replace(".",","),1,yy+3)}
  ctx.strokeStyle="#2f6555";ctx.lineWidth=2.4;ctx.beginPath();pts.forEach((p,i)=>{i?ctx.lineTo(x(i),y(p.weightKg)):ctx.moveTo(x(i),y(p.weightKg))});ctx.stroke();ctx.fillStyle="#2f6555";pts.forEach((p,i)=>{ctx.beginPath();ctx.arc(x(i),y(p.weightKg),3.2,0,Math.PI*2);ctx.fill()});
  ctx.fillStyle="#777";ctx.font="10px system-ui";const fd=parseDate(pts[0].date).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}),ld=parseDate(pts[pts.length-1].date).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});ctx.fillText(fd,left,h-6);const tw=ctx.measureText(ld).width;ctx.fillText(ld,w-right-tw,h-6);
}
function renderWeightChart(){
  const pts=monthWeightEntries(),summary=document.querySelector("#weightMonthSummary");if(!pts.length)summary.textContent="Noch keine Morgenmessungen (vor 12:00 Uhr) in diesem Monat.";else{const vals=pts.map(p=>Number(p.weightKg)),delta=vals[vals.length-1]-vals[0];summary.textContent=`${pts.length} Morgenmessung${pts.length===1?"":"en"} · erste → letzte: ${formatWeightDelta(delta)}`};drawWeightChart(document.querySelector("#weightChart"),pts,175)
}
function renderMonth(){
  buildFilter();const y=shownMonth.getFullYear(),m=shownMonth.getMonth(),filter=document.querySelector("#monthFilter").value||"all";document.querySelector("#monthLabel").textContent=shownMonth.toLocaleDateString("de-DE",{month:"long",year:"numeric"});const first=new Date(y,m,1),shift=(first.getDay()+6)%7,start=new Date(y,m,1-shift),entries=monthEntries(),cal=document.querySelector("#calendar");cal.innerHTML="";
  for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const ds=localDate(d),all=entries.filter(e=>e.date===ds),filtered=all.filter(e=>matchesFilter(e,filter)),outside=d.getMonth()!==m,period=all.some(e=>e.type==="period"),other=all.some(e=>!["period","weight"].includes(e.type));const cell=document.createElement("div");cell.className="day"+(outside?" out":"")+(ds===localDate()?" today":"")+(!outside&&isFreeDay(ds)?" no-beer":"")+(filtered.length&&filter!=="all"?" filtered":"");cell.innerHTML=`<div class="day-num">${d.getDate()}</div><div class="day-count">${filtered.length?filtered.length+" Eintr.":""}</div><div class="day-dot-row">${period?'<i class="dot period"></i>':""}${other?'<i class="dot entry"></i>':""}</div>`;if(!outside){cell.tabIndex=0;cell.setAttribute("role","button");const open=()=>{selectedDate=ds;setView("todayView")};cell.onclick=open;cell.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}}}cal.appendChild(cell)}
  const filtered=entries.filter(e=>matchesFilter(e,filter)).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)),by={};filtered.forEach(e=>(by[e.date]??=[]).push(e));renderWeightChart();document.querySelector("#monthList").innerHTML=Object.keys(by).map(date=>`<div class="month-day"><h3>${parseDate(date).toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit"})}</h3>${by[date].map(e=>`<div class="entry-card ${e.type==="period"?"period-entry":e.type==="weight"?"weight-entry":""}"><b>${e.time}</b> · ${escapeHtml(e.type==="period"?`Periode${e.periodFlow?" · "+e.periodFlow:""}`:e.value)} <span class="entry-meta">${typeLabel(e.type)}</span></div>`).join("")}</div>`).join("")||'<div class="empty">Für diesen Filter keine Einträge.</div>';
}
function renderPatterns(){
  const signals=[{type:"symptom",value:"Bauchschmerzen",label:"Bauchschmerzen"},{type:"symptom",value:"Durchfall",label:"Durchfall"},{type:"medicine",value:"Sodbrennenmittel",label:"Sodbrennenmittel"}],foods=state.entries.filter(e=>e.type==="food"),rows=[];signals.forEach(signal=>{const events=state.entries.filter(e=>e.type===signal.type&&e.value===signal.value),counts=new Map();events.forEach(s=>{const st=new Date(`${s.date}T${s.time}`);foods.forEach(f=>{const ft=new Date(`${f.date}T${f.time}`),h=(st-ft)/36e5;if(h>=0&&h<=8)counts.set(f.value,(counts.get(f.value)||0)+1)})});[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(([food,count])=>rows.push(`<div class="pattern-card"><strong>${escapeHtml(food)}</strong><br><small>${count}× innerhalb von 8 Std. vor „${signal.label}“ erfasst.</small></div>`))});document.querySelector("#patternList").innerHTML=rows.join("")||'<div class="empty">Noch keine passenden Zusammenhänge gefunden.</div>';
}
function freeGoalCategoryOptions(selected){
  const cats=allEntryCategories();
  return cats.map(c=>`<option value="${escapeHtml(c.id)}" ${c.id===selected?"selected":""}>${escapeHtml(c.label)}</option>`).join("")
}
function renderFreeGoalSettings(){
  const box=document.querySelector("#freeGoalSettings"),addSel=document.querySelector("#newFreeGoalCategory"),addStart=document.querySelector("#newFreeGoalStart");if(!box)return;
  const goals=freeGoalsSettings();
  box.innerHTML=goals.map((g,i)=>`<div class="free-goal-setting-row"><input type="checkbox" data-free-enabled="${i}" ${g.enabled!==false?"checked":""} aria-label="Serie anzeigen"><input type="text" data-free-label="${i}" value="${escapeHtml(g.label)}"><select data-free-category="${i}">${freeGoalCategoryOptions(g.categoryId)}</select><input type="date" data-free-start="${i}" value="${escapeHtml(g.start||"")}"><button class="todo-delete" data-free-delete="${i}" type="button">×</button></div>`).join("");
  box.querySelectorAll("[data-free-delete]").forEach(b=>b.onclick=()=>{state.settings.freeGoals.splice(Number(b.dataset.freeDelete),1);renderFreeGoalSettings()});
  if(addSel)addSel.innerHTML=freeGoalCategoryOptions(addSel.value||"sweets");
  if(addStart&&!addStart.value)addStart.value=localDate();
}
function collectFreeGoalSettings(){
  const goals=state.settings.freeGoals||[];
  document.querySelectorAll("[data-free-label]").forEach(x=>{const i=Number(x.dataset.freeLabel);if(goals[i])goals[i].label=x.value.trim()||"Freie Tage"});
  document.querySelectorAll("[data-free-category]").forEach(x=>{const i=Number(x.dataset.freeCategory);if(goals[i])goals[i].categoryId=x.value});
  document.querySelectorAll("[data-free-start]").forEach(x=>{const i=Number(x.dataset.freeStart);if(goals[i])goals[i].start=x.value||localDate()});
  document.querySelectorAll("[data-free-enabled]").forEach(x=>{const i=Number(x.dataset.freeEnabled);if(goals[i])goals[i].enabled=x.checked});
  state.settings.freeGoals=goals;
}
function renderCustomEntryCategorySettings(){
  const box=document.querySelector("#customEntryCategoryList");if(!box)return;
  const rows=state.settings.customEntryCategories||[];
  box.innerHTML=rows.map(c=>`<span class="custom-category-pill">${escapeHtml(c.label)}<button type="button" data-remove-entry-cat="${escapeHtml(c.id)}" aria-label="${escapeHtml(c.label)} entfernen">×</button></span>`).join("")||'<span class="category-note">Noch keine eigenen Kategorien.</span>';
  box.querySelectorAll("[data-remove-entry-cat]").forEach(b=>b.onclick=()=>{state.settings.customEntryCategories=(state.settings.customEntryCategories||[]).filter(c=>c.id!==b.dataset.removeEntryCat);renderCustomEntryCategorySettings()});
}
function renderSettings(){
  document.querySelector("#waterLabel").value=state.settings.waterLabel||"Wasser";
  document.querySelector("#waterMl").value=state.settings.waterMl||700;
  renderFreeGoalSettings();
  const v=homeVisibility();
  [["showMoon","moon"],["showWeight","weight"],["showWater","water"],["showFreeDays","freeDays"],["showCalendarSpecial","calendarSpecial"],["showQuick","quick"],["showWellbeing","wellbeing"],["showSticky","sticky"]]
    .forEach(([id,key])=>{const el=document.querySelector("#"+id);if(el)el.checked=v[key]!==false});
  const c=state.settings.calendar||DEFAULT.settings.calendar;
  [["setDailyQuotes","dailyQuotes"],["setMoon","moon"],["setSeasons","seasons"],["setHolidays","holidays"],["setWheel","wheel"],["setRauhnacht","rauhnacht"],["setFarmers","farmers"],["setSchoolHolidays","schoolHolidays"]]
    .forEach(([id,key])=>{const el=document.querySelector("#"+id);if(el)el.checked=c[key]!==false});
  const cq=document.querySelector("#customQuotes");if(cq)cq.value=(c.customQuotes||[]).join("\n");
  renderTodoSettings();renderCustomEntryCategorySettings();renderFreeGoalSettings();
}

function printFilterOptions(){const opts=[["all","Alles"],["type:food","Essen"],["type:drink","Trinken"],["type:symptom","Beschwerden"],["type:medicine","Mittel"],["type:weight","Gewicht"],["type:period","Periode"],["drink:Bier","Bier"],["drink:Wasser","Wasser"]];allEntryCategories().forEach(c=>opts.push(["category:"+c.id,"Kategorie: "+c.label]));const seen=new Set();knownItems().forEach(v=>opts.push(["value:"+v,v]));return opts.filter(([v])=>!seen.has(v)&&seen.add(v))}
function renderPrintFilterDialog(){const box=document.querySelector("#printFilterList"),opts=printFilterOptions(),fixed=opts.slice(0,9),individual=opts.slice(9);let out='<div class="print-filter-group-title">Auswahl</div>';fixed.forEach(([v,l])=>out+=`<label class="print-filter-option"><input type="checkbox" value="${escapeHtml(v)}" ${printFilters.includes(v)?"checked":""}><span>${escapeHtml(l)}</span></label>`);if(individual.length){out+='<div class="print-filter-group-title">Einzelne Einträge</div>';individual.forEach(([v,l])=>out+=`<label class="print-filter-option"><input type="checkbox" value="${escapeHtml(v)}" ${printFilters.includes(v)?"checked":""}><span>${escapeHtml(l)}</span></label>`)}box.innerHTML=out;const checks=[...box.querySelectorAll('input[type="checkbox"]')];checks.forEach(cb=>cb.onchange=()=>{if(cb.value==="all"&&cb.checked)checks.forEach(x=>{if(x.value!=="all")x.checked=false});else if(cb.checked){const all=checks.find(x=>x.value==="all");if(all)all.checked=false}if(!checks.some(x=>x.checked)){const all=checks.find(x=>x.value==="all");if(all)all.checked=true}})}
function selectedPrintFilters(){const vals=[...document.querySelectorAll('#printFilterList input[type="checkbox"]:checked')].map(x=>x.value);return vals.length?vals:["all"]}
function compactPrintEntries(dayEntries){
  const byTime=new Map();dayEntries.forEach(e=>{if(!byTime.has(e.time))byTime.set(e.time,[]);byTime.get(e.time).push(e)});return [...byTime.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([time,items])=>{const parts=[],foodMeals=new Map(),rest=[];items.forEach(e=>{if(e.type==="food"&&e.mealId){if(!foodMeals.has(e.mealId))foodMeals.set(e.mealId,[]);foodMeals.get(e.mealId).push(e.value)}else rest.push(e)});foodMeals.forEach(v=>parts.push(v.join(", ")));const counts=new Map();rest.forEach(e=>{const key=`${e.type}|${e.value}|${e.periodFlow||""}`;const x=counts.get(key)||{entry:e,count:0};x.count++;counts.set(key,x)});counts.forEach(({entry,count})=>{let value=entry.value;if(entry.type==="weight")value=`Gew. ${entry.value}`;if(entry.type==="period")value=`Periode${entry.periodFlow?" "+entry.periodFlow:""}`;if(entry.type==="drink"&&entry.amountMl)value+=` ${entry.amountMl} ml`;parts.push(value+(count>1?` ×${count}`:""))});return {time,text:parts.join("; ")}})
}
function renderPrintPage(){
  const y=shownMonth.getFullYear(),m=shownMonth.getMonth(),first=new Date(y,m,1),shift=(first.getDay()+6)%7,start=new Date(y,m,1-shift),entries=monthEntries();document.querySelector("#printTitle").textContent=shownMonth.toLocaleDateString("de-DE",{month:"long",year:"numeric"});document.querySelector("#printMeta").textContent="Mein Tracker · Monatsübersicht";let out="";
  for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const ds=localDate(d),outside=d.getMonth()!==m;let dayEntries=entries.filter(e=>e.date===ds);if(!printFilters.includes("all"))dayEntries=dayEntries.filter(e=>printFilters.some(f=>matchesFilter(e,f)));const compact=compactPrintEntries(dayEntries),period=!outside&&periodOn(ds),beer=!outside&&isFreeDay(ds);out+=`<div class="print-day${outside?" out":""}${beer?" no-beer":""}${period?" period-day":""}"><div class="print-date">${d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"})}</div>${compact.length?compact.map(x=>`<div class="print-entry"><span class="print-time">${x.time}</span> ${escapeHtml(x.text)}</div>`).join(""):'<div class="print-empty">–</div>'}</div>`}
  document.querySelector("#printCalendar").innerHTML=out;const weights=weightEntriesSorted(),latest=weights[weights.length-1],firstW=weights[0];document.querySelector("#printWeightLatest").textContent=latest?`${Number(latest.weightKg).toFixed(1).replace(".",",")} kg · ${latest.date}`:"–";document.querySelector("#printWeightDelta").textContent=latest&&firstW?`Seit erster Messung: ${formatWeightDelta(Number(latest.weightKg)-Number(firstW.weightKg))}`:"Noch keine Vergleichswerte";drawWeightChart(document.querySelector("#printWeightChart"),monthWeightEntries(),150);const goals=freeGoalsSettings().filter(g=>g.enabled!==false);document.querySelector("#printFreeDaysTitle").textContent="Freie Tage";document.querySelector("#printBeerStreak").textContent=goals.length?goals.map(g=>`${g.label}: ${freeGoalStreakInfo(g,localDate()).days} Tage`).join(" · "):"–";document.querySelector("#printBeerInfo").textContent=goals.length?goals.map(g=>`Start ${g.label}: ${g.start}`).join(" · "):"Noch keine Serien";const pfl=document.querySelector("#printFreeLegend");if(pfl)pfl.textContent="freie Ziele";
}
function startPrint(){printFilters=selectedPrintFilters();document.querySelector("#printDialog").close();renderPrintPage();setTimeout(()=>window.print(),100)}

function renderAll(){renderSummary();renderWeightToday();renderQuick();renderTimeline();renderKnown();renderSettings();renderHomeVisibility();if(document.querySelector("#monthView").classList.contains("active"))renderMonth()}

document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{if(b.dataset.view==="todayView"){selectedDate=localDate();shownMonth=startMonth(new Date())}setView(b.dataset.view)});
document.querySelector("#fab").onclick=openTypeDialog;document.querySelector("#closeTypeDialog").onclick=()=>document.querySelector("#typeDialog").close();document.querySelectorAll("[data-type-choice]").forEach(b=>b.onclick=()=>openNewEntry(b.dataset.typeChoice));

const entryPhotoInput=document.querySelector("#entryPhotoInput");
if(entryPhotoInput)entryPhotoInput.addEventListener("change",async e=>{
  const file=e.target.files&&e.target.files[0];
  if(!file)return;
  try{
    entryPhotoData=await resizeImageFile(file,420,.78);
    removeEntryPhoto=false;
    setPhotoPreview(entryPhotoData);
  }catch(err){showToast("Foto konnte nicht geladen werden")}
});
const pickPhotoBtn=document.querySelector("#pickPhotoBtn"); if(pickPhotoBtn) pickPhotoBtn.onclick=()=>document.querySelector("#entryPhotoInput").click();
const removePhotoBtn=document.querySelector("#removePhotoBtn"); if(removePhotoBtn) removePhotoBtn.onclick=()=>{removeEntryPhoto=true;entryPhotoData="";const inp=document.querySelector("#entryPhotoInput"); if(inp) inp.value=""; setPhotoPreview("")};

document.querySelector("#entryForm").addEventListener("submit",saveDialog);document.querySelector("#entryValue").addEventListener("change",refreshEntryCategoriesFromValue);document.querySelector("#closeEntryDialog").onclick=()=>{clearEditing();document.querySelector("#entryDialog").close()};document.querySelector("#cancelEntryDialog").onclick=()=>{clearEditing();document.querySelector("#entryDialog").close()};document.querySelector("#deleteEntry").onclick=deleteCurrentEntry;
document.querySelector("#prevMonth").onclick=()=>{shownMonth=new Date(shownMonth.getFullYear(),shownMonth.getMonth()-1,1);renderMonth()};document.querySelector("#nextMonth").onclick=()=>{shownMonth=new Date(shownMonth.getFullYear(),shownMonth.getMonth()+1,1);renderMonth()};document.querySelector("#monthFilter").onchange=renderMonth;
document.querySelector("#printMonth").onclick=()=>{renderPrintFilterDialog();document.querySelector("#printDialog").showModal()};document.querySelector("#closePrintDialog").onclick=()=>document.querySelector("#printDialog").close();document.querySelector("#cancelPrintDialog").onclick=()=>document.querySelector("#printDialog").close();document.querySelector("#startPrint").onclick=startPrint;
document.querySelector("#saveSettings").onclick=()=>{state.settings.waterLabel=document.querySelector("#waterLabel").value.trim()||"Wasser";state.settings.waterMl=Number(document.querySelector("#waterMl").value)||700;save();showToast("Wasser-Einstellung gespeichert")};
document.querySelector("#saveFreeGoals").onclick=()=>{collectFreeGoalSettings();save();showToast("Freie Tage gespeichert")};
document.querySelector("#addFreeGoal").onclick=()=>{collectFreeGoalSettings();const label=document.querySelector("#newFreeGoalLabel").value.trim(),categoryId=document.querySelector("#newFreeGoalCategory").value,start=document.querySelector("#newFreeGoalStart").value||localDate();if(!label)return showToast("Bitte einen Namen eingeben");state.settings.freeGoals=state.settings.freeGoals||[];state.settings.freeGoals.push({id:"free-"+uid(),label,start,categoryId,enabled:true});document.querySelector("#newFreeGoalLabel").value="";renderFreeGoalSettings();showToast("Serie hinzugefügt")};
document.querySelector("#saveHomeSettings").onclick=()=>{const v=state.settings.homeVisibility||{};[["showMoon","moon"],["showWeight","weight"],["showWater","water"],["showFreeDays","freeDays"],["showCalendarSpecial","calendarSpecial"],["showQuick","quick"],["showWellbeing","wellbeing"],["showSticky","sticky"]].forEach(([id,key])=>v[key]=document.querySelector("#"+id).checked);state.settings.homeVisibility=v;save();showToast("Startseite gespeichert")};
document.querySelector("#addEntryCategory").onclick=()=>{const input=document.querySelector("#newEntryCategory"),label=input.value.trim();if(!label)return showToast("Bitte einen Namen eingeben");state.settings.customEntryCategories=state.settings.customEntryCategories||[];const id="custom-"+uid();state.settings.customEntryCategories.push({id,label});input.value="";renderCustomEntryCategorySettings();showToast("Kategorie hinzugefügt")};
document.querySelector("#exportData").onclick=()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`essen-tracker-${localDate()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};document.querySelector("#importData").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const x=JSON.parse(await f.text());state={...cloneDefault(),...x,settings:{...DEFAULT.settings,...x.settings}};save();showToast("Sicherung importiert")}catch(err){alert("Datei konnte nicht gelesen werden.")}};

document.querySelector("#moonChip").onclick=()=>{renderMoon();document.querySelector("#moonDialog").showModal()};
document.querySelector("#closeMoonDialog").onclick=()=>document.querySelector("#moonDialog").close();
const rerollQuoteBtn=document.querySelector("#rerollQuote");if(rerollQuoteBtn)rerollQuoteBtn.onclick=rerollDailyQuote;
document.querySelector("#addTodo").onclick=()=>{collectTodoSettings();const input=document.querySelector("#newTodoText"),label=input.value.trim();if(!label)return showToast("Bitte einen Namen eingeben");state.settings.todoItems.push({id:"custom-"+uid(),label,enabled:true});input.value="";renderTodoSettings()};
document.querySelector("#saveTodoSettings").onclick=()=>{collectTodoSettings();save();showToast("Tagesliste gespeichert")};
document.querySelector("#saveCalendarSettings").onclick=()=>{const c=state.settings.calendar||{};c.dailyQuotes=document.querySelector("#setDailyQuotes").checked;c.moon=document.querySelector("#setMoon").checked;c.seasons=document.querySelector("#setSeasons").checked;c.holidays=document.querySelector("#setHolidays").checked;c.wheel=document.querySelector("#setWheel").checked;c.rauhnacht=document.querySelector("#setRauhnacht").checked;c.farmers=document.querySelector("#setFarmers").checked;c.schoolHolidays=document.querySelector("#setSchoolHolidays").checked;c.customQuotes=document.querySelector("#customQuotes").value.split(/\n+/).map(x=>x.trim()).filter(Boolean);state.settings.calendar=c;save();showToast("Kalender-Einstellungen gespeichert")};

window.addEventListener("resize",()=>{if(document.querySelector("#monthView")?.classList.contains("active"))renderWeightChart();renderMoon()});

async function initServiceWorker(){
  if(!("serviceWorker" in navigator))return;try{const reg=await navigator.serviceWorker.register("./sw.js?v=35");await reg.update()}catch(e){}
}
async function requestPersistentStorage(){try{if(navigator.storage&&navigator.storage.persist)await navigator.storage.persist()}catch(e){}}
renderAll();initServiceWorker();requestPersistentStorage();


function applyTodayTopPairLayout(){
  const todayView = document.getElementById('todayView');
  const sticky = document.getElementById('dailySticky');
  const wellbeing = document.getElementById('wellbeingCard');
  const summary = document.getElementById('todaySummary');
  if(!todayView || !sticky || !wellbeing || !summary) return;

  let row = document.getElementById('todayTopPair');
  if(!row){
    row = document.createElement('div');
    row.id = 'todayTopPair';
  }
  if(row.parentElement !== todayView || row.nextElementSibling !== summary){
    todayView.insertBefore(row, summary);
  }
  if(wellbeing.parentElement !== row || sticky.parentElement !== row){
    row.innerHTML = '';
    row.appendChild(wellbeing);
    row.appendChild(sticky);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(applyTodayTopPairLayout, 80);
  setTimeout(applyTodayTopPairLayout, 400);
});
window.addEventListener('load', () => setTimeout(applyTodayTopPairLayout, 120));

