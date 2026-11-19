/* FORM. v0.18 — уведомления и напоминания.
   - Запрос разрешения с объяснением (без тихих запросов)
   - Внутриприложенческие уведомления (колокольчик + тосты)
   - Системные Web Notifications при наличии разрешения
   - Напоминания о невыполненных задачах (вечер / по расписанию)
   - Настройки в экране «Настройки» */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const KEY='formNotifPrefs';
const DEFAULTS={
  enabled:false,          // системные push разрешены пользователем
  asked:false,            // уже показывали объяснение
  taskReminders:true,     // напоминания о невыполненных задачах
  sharedTasks:true,       // совместные задания
  friends:true,           // заявки в друзья
  dailySummary:true,      // краткий итог дня
  remindHour:20,          // час локального напоминания (0–23)
  lastRemind:'',          // YYYY-MM-DD когда уже напоминали
  lastDaily:''
};

let prefs={...DEFAULTS};
let started=false,tickTm=null,inbox=[];

function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(KEY)||'null');
    if(raw&&typeof raw==='object')prefs={...DEFAULTS,...raw};
  }catch(_){}
}
function savePrefs(){
  try{localStorage.setItem(KEY,JSON.stringify(prefs))}catch(_){}
}

const tr=(s,p)=>typeof window.i18==='function'?window.i18(s,p):String(s);
const esc=s=>typeof window.esc==='function'?window.esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function perm(){
  if(!('Notification' in window))return 'unsupported';
  return Notification.permission; // granted | denied | default
}

function canSystem(){
  return prefs.enabled&&perm()==='granted';
}

/* ---------- объяснение и запрос разрешения ---------- */
function explainAndAsk(){
  if(perm()==='granted'){
    const was=prefs.enabled;
    prefs.enabled=true;prefs.asked=true;savePrefs();renderSettingsPanel();
    if(!was)welcomeNotify();
    else toast(tr('Уведомления уже разрешены'));
    return;
  }
  if(perm()==='denied'){
    prefs.enabled=false;prefs.asked=true;savePrefs();renderSettingsPanel();
    toast(tr('Разрешение отклонено в настройках браузера. Включите уведомления для этого сайта вручную.'));
    return;
  }
  const html='<h3>'+esc(tr('Уведомления'))+'</h3>'+
    '<p class="sub">'+esc(tr('FORM. может напоминать о незавершённых задачах, совместных заданиях и важных событиях. Уведомления приходят только с вашего согласия и их можно отключить в любой момент.'))+'</p>'+
    '<ul class="sub" style="margin:10px 0 14px;padding-left:18px;line-height:1.55">'+
      '<li>'+esc(tr('Напоминания о задачах, которые вы ещё не отметили'))+'</li>'+
      '<li>'+esc(tr('Приглашения в совместные задания и ответы друзей'))+'</li>'+
      '<li>'+esc(tr('Краткий итог дня — если остались незакрытые дела'))+'</li>'+
    '</ul>'+
    '<p class="tiny muted">'+esc(tr('Без разрешения уведомления не отправляются. Системные уведомления работают, когда приложение свёрнуто.'))+'</p>'+
    '<div class="row" style="margin-top:16px;gap:8px;flex-wrap:wrap">'+
      '<button class="btn ghost" type="button" id="nfLater">'+esc(tr('Не сейчас'))+'</button>'+
      '<button class="btn primary" type="button" id="nfAllow">'+esc(tr('Разрешить уведомления'))+'</button>'+
    '</div>';
  if(typeof showModal==='function'){
    $('modal').innerHTML=html;showModal();
    $('nfLater').onclick=()=>{prefs.asked=true;savePrefs();closeModal();renderSettingsPanel()};
    $('nfAllow').onclick=async()=>{
      prefs.asked=true;savePrefs();
      try{
        const r=await Notification.requestPermission();
        prefs.enabled=(r==='granted');
        savePrefs();
        closeModal();
        renderSettingsPanel();
        if(r==='granted'){
          scheduleChecks();
          welcomeNotify();
        }else{
          toast(tr('Разрешение не получено'));
        }
      }catch(_){
        closeModal();toast(tr('Не удалось запросить разрешение'));
      }
    };
  }else{
    Notification.requestPermission().then(r=>{prefs.enabled=r==='granted';prefs.asked=true;savePrefs()});
  }
}

/* ---------- показ уведомления ---------- */
function pushSystem(title,body,tag){
  if(!canSystem())return false;
  try{
    const n=new Notification(title,{
      body:body||'',
      tag:tag||'form',
      icon:'./icon-192.png',
      badge:'./icon-192.png',
      silent:false
    });
    n.onclick=()=>{try{window.focus();n.close()}catch(_){}};
    setTimeout(()=>{try{n.close()}catch(_){}},12000);
    return true;
  }catch(_){return false}
}

function pushInApp(title,body,kind){
  inbox.unshift({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),title,body,kind:kind||'sys',at:Date.now(),read:false});
  if(inbox.length>40)inbox.length=40;
  updateBadge();
  if(typeof toast==='function')toast(title+(body?' · '+body:''));
  // social bell integration if present
  try{
    if(window.FormSocial&&FormSocial.noteLocal)FormSocial.noteLocal({title,body,kind});
  }catch(_){}
}

function notify(title,body,opts){
  opts=opts||{};
  const kind=opts.kind||'sys';
  // respect category toggles
  if(kind==='task'&&!prefs.taskReminders)return;
  if(kind==='shared'&&!prefs.sharedTasks)return;
  if(kind==='friend'&&!prefs.friends)return;
  if(kind==='daily'&&!prefs.dailySummary)return;
  pushInApp(title,body,kind);
  if(opts.system!==false)pushSystem(title,body,opts.tag||kind);
}

function updateBadge(){
  const n=inbox.filter(x=>!x.read).length;
  const b=$('bellBadge');
  // не перетираем бейдж социальных уведомлений, если он уже показывает число
  if(b&&!b.dataset.social){
    if(n){b.hidden=false;b.textContent=n>9?'9+':String(n)}
    else if(!b.dataset.social){b.hidden=true;b.textContent=''}
  }
}

/* ---------- логика напоминаний ---------- */
function unfinishedToday(){
  try{
    if(typeof todaysMissions!=='function')return [];
    return todaysMissions().filter(m=>!m.done);
  }catch(_){return []}
}

function todayStr(){
  if(typeof today==='function')return today();
  const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function checkReminders(){
  if(!started)return;
  const t=todayStr();
  const hour=new Date().getHours();
  const left=unfinishedToday();

  // Вечернее напоминание о незакрытых задачах
  if(prefs.taskReminders&&left.length&&hour>=prefs.remindHour&&prefs.lastRemind!==t){
    prefs.lastRemind=t;savePrefs();
    const title=tr('Есть незавершённые задачи');
    const body=left.length===1
      ?tr('«{title}» ещё не отмечена',{title:left[0].title})
      :tr('{n} задач ждут вас сегодня',{n:left.length});
    notify(title,body,{kind:'task',tag:'form-tasks-'+t});
  }

  // Итог дня ближе к ночи, если что-то осталось
  if(prefs.dailySummary&&left.length&&hour>=22&&prefs.lastDaily!==t){
    prefs.lastDaily=t;savePrefs();
    notify(tr('Итог дня'),tr('Осталось задач: {n}. Можно закрыть их или перенести на завтра.',{n:left.length}),{kind:'daily',tag:'form-daily-'+t});
  }
}

function scheduleChecks(){
  clearInterval(tickTm);
  tickTm=setInterval(()=>{
    if(document.hidden&&!canSystem())return;
    checkReminders();
  },60000);
  // быстрая проверка при возврате
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(checkReminders,800)});
}

/* ---------- API для других модулей ---------- */
function onSharedInvite(title){
  if(!prefs.sharedTasks)return;
  notify(tr('Приглашение в совместное задание'),title||tr('Вас пригласили в общее задание'),{kind:'shared',tag:'form-shared'});
}
function onFriendRequest(name){
  if(!prefs.friends)return;
  notify(tr('Новая заявка в друзья'),name||tr('Кто-то хочет добавить вас в друзья'),{kind:'friend',tag:'form-friend'});
}
function onTaskComplete(title,xp){
  // лёгкий локальный отклик без системного шума
  pushInApp(tr('Задача выполнена'),(title||'')+(xp?' · +'+xp+' XP':''),'task');
}


function welcomeNotify(){
  const title=tr('Уведомления включены');
  const body=tr('Теперь FORM. сможет напоминать о задачах и событиях. Отключить можно в Настройки → Уведомления.');
  // системное + in-app
  try{
    if(perm()==='granted'){
      const n=new Notification(title,{body:body,tag:'form-welcome',icon:'./icon-192.png',badge:'./icon-192.png'});
      n.onclick=()=>{try{window.focus();n.close()}catch(_){}};
      setTimeout(()=>{try{n.close()}catch(_){}},14000);
    }
  }catch(_){}
  pushInApp(title,body,'sys');
  toast(title);
}

/* ---------- панель настроек ---------- */
function renderSettingsPanel(){
  const host=$('notifSettings');if(!host)return;
  const p=perm();
  const status=p==='granted'&&prefs.enabled
    ?tr('Разрешены')
    :p==='denied'?tr('Отклонены в браузере')
    :p==='unsupported'?tr('Не поддерживаются')
    :tr('Не включены');

  const row=(title,sub,ctrl)=>'<div class="prow"><div><b>'+esc(title)+'</b>'+(sub?'<div class="tiny">'+esc(sub)+'</div>':'')+'</div>'+ctrl+'</div>';
  const seg=(id,pref,on)=>{
    const attrs=id?' id="'+id+'"':' data-pref="'+pref+'"';
    return '<div class="seg full" role="radiogroup"'+attrs+' style="grid-template-columns:1fr 1fr">'+
      '<button type="button" role="radio" data-v="on"'+(on?' class="on" aria-checked="true"':' aria-checked="false')+'>'+esc(tr('Вкл'))+'</button>'+
      '<button type="button" role="radio" data-v="off"'+(!on?' class="on" aria-checked="true"':' aria-checked="false')+'>'+esc(tr('Выкл'))+'</button></div>';
  };

  let sysCtrl;
  if(p==='granted'){
    sysCtrl=seg('segNotifSys','',prefs.enabled);
  }else if(p==='unsupported'){
    sysCtrl='<div class="tiny muted">'+esc(tr('Не поддерживаются'))+'</div>';
  }else if(p==='denied'){
    sysCtrl='<div class="tiny muted">'+esc(tr('Отклонены в браузере'))+'</div>';
  }else{
    sysCtrl='<button type="button" class="btn small secondary" id="nfAskBtn" style="margin-top:10px">'+esc(tr('Включить'))+'</button>';
  }

  host.innerHTML=
    row(tr('Системные уведомления'),status,sysCtrl)+
    row(tr('Напоминания о задачах'),tr('Вечером, если остались незакрытые дела'),seg('','taskReminders',prefs.taskReminders))+
    row(tr('Совместные задания'),tr('Приглашения и завершение общих задач'),seg('','sharedTasks',prefs.sharedTasks))+
    row(tr('Заявки в друзья'),tr('Новые и принятые заявки'),seg('','friends',prefs.friends))+
    row(tr('Итог дня'),tr('Краткое напоминание ближе к ночи'),seg('','dailySummary',prefs.dailySummary))+
    '<div class="prow"><div><b>'+esc(tr('Час напоминания'))+'</b><div class="tiny">'+esc(tr('Локальное время'))+'</div></div>'+
      '<select class="field" id="nfHour" style="width:auto;min-width:100px;margin-top:10px">'+
        Array.from({length:24},(_,h)=>'<option value="'+h+'"'+(h===prefs.remindHour?' selected':'')+'>'+String(h).padStart(2,'0')+':00</option>').join('')+
      '</select></div>';

  const ask=$('nfAskBtn');if(ask)ask.onclick=explainAndAsk;
  const sys=$('segNotifSys');
  if(sys)sys.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const turnOn=b.dataset.v==='on';
    if(turnOn&&perm()!=='granted'){explainAndAsk();return}
    const was=prefs.enabled;
    prefs.enabled=turnOn;
    savePrefs();renderSettingsPanel();
    if(turnOn&&!was&&perm()==='granted')welcomeNotify();
  });
  host.querySelectorAll('.seg[data-pref]').forEach(segEl=>{
    segEl.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      const key=segEl.dataset.pref;
      prefs[key]=b.dataset.v==='on';
      savePrefs();renderSettingsPanel();
    });
  });
  const hour=$('nfHour');
  if(hour)hour.onchange=()=>{prefs.remindHour=+hour.value||20;savePrefs()};
}


function start(){
  if(started)return;
  started=true;
  load();
  // если разрешение уже есть — синхронизируем флаг
  if(perm()==='granted'&&prefs.asked)prefs.enabled=true;
  if(perm()==='denied')prefs.enabled=false;
  savePrefs();
  scheduleChecks();
  // мягкое предложение один раз после входа (не сразу, чтобы не мешать)
  setTimeout(()=>{
    if(!prefs.asked&&perm()==='default'&&document.documentElement.dataset.auth==='in'){
      // не форсируем: только если пользователь уже пользуется приложением
    }
  },8000);
}

window.FormNotif={
  start,
  explainAndAsk,
  notify,
  onSharedInvite,
  onFriendRequest,
  onTaskComplete,
  renderSettings:renderSettingsPanel,
  prefs:()=>({...prefs}),
  checkReminders
};

// автозапуск настроек при открытии экрана
const _rs=window.renderSettings;
window.renderSettings=function(){
  if(typeof _rs==='function')_rs();
  try{FormNotif.renderSettings()}catch(_){}
};
})();
