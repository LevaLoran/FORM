/* FORM. v0.17 — совместные задания с друзьями:
   - Создание общих заданий и приглашение друзей (при создании или в существующие задания)
   - Отображение участников, общего прогресса и индивидуального статуса (кто выполнил / в процессе / ещё нет)
   - Синхронизация прогресса между участниками через Supabase RPC + Realtime + опрос
   - Уведомления об изменениях прогресса и завершении
   - Начисление базового XP + командного бонуса за совместное выполнение без дублирования */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let sb=null,uid=null,started=false,chan=null,pollTm=null,syncTm=null;
const T={tasks:[],invites:[],activity:[],loading:false,err:null};

const CATS=[
  ['INTELLIGENCE','Интеллект'],
  ['DISCIPLINE','Дисциплина'],
  ['CREATIVITY','Творчество'],
  ['FITNESS','Физическая форма'],
  ['TECHNICAL','Техника'],
  ['SOCIAL','Социальное']
];

const FS=()=>window.FormSocial||{};
const esc=s=>typeof window.esc==='function'?window.esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tr=(s,p)=>typeof window.i18==='function'?window.i18(s,p):String(s);

async function rpc(fn,args){
  if(!sb)throw new Error('no_client');
  const r=await sb.rpc(fn,args||{});
  if(r.error)throw r.error;
  return r.data;
}

function human(e){
  if(FS().human)return FS().human(e);
  return tr('Не удалось выполнить действие. Попробуйте ещё раз.');
}

/* ---------- начисление XP за совместное выполнение (идемпотентно) ---------- */
function grantSharedReward(task){
  if(!task||!task.id||typeof state==='undefined')return;
  const key='shared:'+task.id;
  if(state.completed.some(c=>c.id===key))return; // уже начислено на этом аккаунте
  const baseXp=Math.max(10,Math.min(500,+task.xp||50));
  const bonusPct=Math.max(0,+task.bonus_pct||25);
  const totalXp=Math.round(baseXp*(1+bonusPct/100));
  const cat=task.category||'SOCIAL';
  const today=typeof fmt==='function'?fmt(new Date()):new Date().toISOString().slice(0,10);

  state.xp=(state.xp||0)+totalXp;
  state.completed.push({
    id:key,
    title:task.title,
    category:cat,
    xp:totalXp,
    date:today,
    shared:true
  });
  if(typeof skillMap!=='undefined'&&state.skills){
    const sk=skillMap[cat]||'SOCIAL';
    state.skills[sk]=(state.skills[sk]||0)+1;
  }
  if(!state.days)state.days={};
  if(!state.days[today])state.days[today]={p:0};
  state.days[today].p=Math.min(50,(state.days[today].p||0)+1);

  if(typeof save==='function')save();
  if(typeof render==='function')render();
  if(typeof fxSound==='function')fxSound('win');
  toast(tr('Совместное задание выполнено! +{xp} XP (включая командный бонус)',{xp:totalXp}));
}

function checkCompletedRewards(){
  (T.tasks||[]).forEach(t=>{
    if(t.status==='completed'&&t.my_status==='accepted'){
      grantSharedReward(t);
    }
  });
}

/* ---------- загрузка и синхронизация ---------- */
async function refresh(quiet){
  if(!started||!sb)return;
  if(!quiet){T.loading=true;renderContainer()}
  try{
    const data=await rpc('shared_tasks_overview');
    T.tasks=(data&&data.tasks)||[];
    T.invites=(data&&data.invites)||[];
    T.activity=(data&&data.activity)||[];
    T.err=null;
    checkCompletedRewards();
  }catch(e){
    T.err=e;
  }
  T.loading=false;
  renderContainer();
  const feedEl=$('friendsSharedFeed');
  if(feedEl)renderFriendsFeed(feedEl);
}

function scheduleRefresh(){
  clearTimeout(syncTm);
  syncTm=setTimeout(()=>refresh(true),450);
}

function subscribeRealtime(){
  try{
    chan=sb.channel('form-shared-'+uid)
      .on('postgres_changes',{event:'*',schema:'public',table:'shared_tasks'},scheduleRefresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'shared_task_members'},scheduleRefresh)
      .subscribe();
  }catch(_){}
}

/* ---------- контейнер на главном экране (dashboard) ---------- */
function ensureContainer(){
  let box=$('sharedTasksSection');
  if(box)return box;
  const host=$('dashboard')||document.querySelector('#dashboard .panel')||document.querySelector('main');
  if(!host)return null;
  box=document.createElement('section');
  box.id='sharedTasksSection';
  box.className='st-wrap';
  host.appendChild(box);
  return box;
}

function calcOverallProgress(task){
  const active=(task.members||[]).filter(m=>m.status==='accepted');
  if(!active.length)return 0;
  const sum=active.reduce((s,m)=>s+Math.max(0,Math.min(100,+m.progress||0)),0);
  return Math.round(sum/active.length);
}

function renderTaskCard(t){
  const members=t.members||[];
  const active=members.filter(m=>m.status==='accepted');
  const invited=members.filter(m=>m.status==='invited');
  const pct=calcOverallProgress(t);
  const me=active.find(m=>m.is_me)||active.find(m=>m.user_id===uid);
  const myProg=me?Math.max(0,Math.min(100,+me.progress||0)):0;
  const isDone=t.status==='completed'||pct>=100;
  const baseXp=+t.xp||50;
  const bonusPct=+t.bonus_pct||25;
  const totalXp=Math.round(baseXp*(1+bonusPct/100));

  const memHtml=members.map(m=>{
    const p=Math.max(0,Math.min(100,+m.progress||0));
    let pill='';
    if(m.status==='invited'){
      pill='<span class="st-pill pend">'+esc(tr('Приглашён'))+'</span>';
    }else if(p>=100||m.done){
      pill='<span class="st-pill done">✓ '+esc(tr('Выполнил'))+'</span>';
    }else if(p>0){
      pill='<span class="st-pill prog">'+p+'%</span>';
    }else{
      pill='<span class="st-pill pend">'+esc(tr('Не начал'))+'</span>';
    }
    const av=FS().avHTML?FS().avHTML(m,26,{noDot:true}):'';
    const nm=FS().dispName?FS().dispName(m):(m.display_name||m.username||'Участник');
    return '<div class="st-mem"><div class="st-mem-info">'+av+'<span class="st-mem-name" data-nt>'+esc(nm)+(m.is_me?' ('+esc(tr('Вы'))+')':'')+'</span></div><div class="st-mem-stat">'+pill+'</div></div>';
  }).join('');

  let controls='';
  if(!isDone&&me){
    controls='<div class="st-ctrl"><input type="range" class="st-range" min="0" max="100" step="5" value="'+myProg+'" data-st-range="'+esc(t.id)+'" aria-label="'+esc(tr('Мой прогресс'))+'"><span class="tiny" style="min-width:34px;text-align:right">'+myProg+'%</span></div>';
  }

  let actions='';
  if(!isDone){
    if(me&&myProg<100){
      actions+='<button type="button" class="btn small primary" data-st-act="complete_mine" data-tid="'+esc(t.id)+'">'+esc(tr('Выполнить'))+'</button>';
    }else if(me&&myProg>=100){
      actions+='<button type="button" class="btn small ghost" data-st-act="reset_mine" data-tid="'+esc(t.id)+'">'+esc(tr('Отменить'))+'</button>';
    }
    actions+='<button type="button" class="btn small secondary" data-st-act="invite_more" data-tid="'+esc(t.id)+'">+ '+esc(tr('Друг'))+'</button>';
  }
  actions+='<button type="button" class="btn small ghost" data-st-act="leave" data-tid="'+esc(t.id)+'">'+esc(tr(t.is_creator?'Удалить':'Выйти'))+'</button>';

  return '<article class="st-card'+(isDone?' done':'')+'">'+
    '<div class="st-top"><div><h4 class="st-title" data-nt>'+esc(t.title)+'</h4>'+(t.description?'<p class="st-desc" data-nt>'+esc(t.description)+'</p>':'')+'</div>'+
    '<span class="tag">'+esc(tr(isDone?'Завершено':'Активно'))+'</span></div>'+
    '<div class="st-badges"><span class="st-xp">'+baseXp+' XP</span><span class="st-xp bonus">+'+bonusPct+'% '+esc(tr('командный бонус'))+' → '+totalXp+' XP</span><span class="tiny">'+esc(tr('Участников: {n}',{n:active.length}))+(invited.length?' · '+esc(tr('ожидают: {n}',{n:invited.length})):'')+'</span></div>'+
    '<div class="st-prog-wrap"><div class="st-prog-meta"><span>'+esc(tr('Общий прогресс'))+'</span><b>'+pct+'%</b></div><div class="st-prog-bar"><i style="width:'+pct+'%"></i></div></div>'+
    '<div class="st-members">'+memHtml+'</div>'+
    '<div class="st-foot">'+controls+'<div class="st-act">'+actions+'</div></div>'+
  '</article>';
}

function renderContainer(){
  const box=ensureContainer();
  if(!box)return;
  if(!started){box.innerHTML='';return}

  let invHtml='';
  if(T.invites.length){
    invHtml='<div class="st-inv-box"><div class="st-inv-title">'+esc(tr('Приглашения в совместные задания ({n})',{n:T.invites.length}))+'</div>'+
      T.invites.map(inv=>{
        const from=inv.inviter_name||'@'+inv.inviter_username||'Друг';
        return '<div class="st-inv-row"><div><b data-nt>'+esc(inv.title)+'</b><div class="tiny" data-nt>'+esc(tr('От: {n} · +{xp} XP',{n:from,xp:inv.xp||50}))+'</div></div>'+
          '<div class="fract"><button type="button" class="btn small primary" data-st-act="accept_invite" data-tid="'+esc(inv.task_id)+'">'+esc(tr('Принять'))+'</button><button type="button" class="btn small ghost" data-st-act="decline_invite" data-tid="'+esc(inv.task_id)+'">'+esc(tr('Отклонить'))+'</button></div></div>';
      }).join('')+'</div>';
  }

  let listHtml='';
  if(T.loading&&!T.tasks.length){
    listHtml='<div class="empty">'+esc(tr('Загружаю совместные задания…'))+'</div>';
  }else if(T.err&&!T.tasks.length){
    listHtml='<div class="empty">'+esc(human(T.err))+'</div>';
  }else if(!T.tasks.length){
    listHtml='<div class="empty">'+esc(tr('Пока нет совместных заданий. Создайте общее задание и пригласите друзей, чтобы получать бонусный XP.'))+'</div>';
  }else{
    listHtml=T.tasks.map(renderTaskCard).join('');
  }

  box.innerHTML='<div class="st-head"><div class="sectiontitle"><span>'+esc(tr('Совместные задания'))+'</span><span>'+T.tasks.length+'</span></div>'+
    '<button type="button" class="btn small primary" data-st-act="open_create">+ '+esc(tr('Создать'))+'</button></div>'+
    invHtml+listHtml;
}

/* ---------- лента совместной активности ---------- */
function activityLine(item){
  const nm=esc(item.actor_name||'@'+item.actor_username||'Пользователь');
  const title=esc(item.task_title||'Задание');
  if(item.kind==='created')return '<b>'+nm+'</b> '+esc(tr('создал(а) совместное задание'))+' «<b data-nt>'+title+'</b>»';
  if(item.kind==='joined')return '<b>'+nm+'</b> '+esc(tr('присоединился(ась) к заданию'))+' «<b data-nt>'+title+'</b>»';
  if(item.kind==='done')return '<b>'+nm+'</b> '+esc(tr('выполнил(а) свою часть в'))+' «<b data-nt>'+title+'</b>»';
  if(item.kind==='completed')return esc(tr('Команда завершила совместное задание'))+' «<b data-nt>'+title+'</b>» (+'+(+item.xp||0)+' XP)';
  return '<b>'+nm+'</b> '+esc(tr('обновил(а) прогресс'))+' ('+(+item.progress||0)+'%) '+esc(tr('в'))+' «<b data-nt>'+title+'</b>»';
}

function renderFriendsFeed(el){
  if(!el)return;
  if(!T.activity.length){
    el.innerHTML='<div class="sectiontitle"><span>'+esc(tr('Совместная активность'))+'</span><span>0</span></div><div class="empty">'+esc(tr('Здесь появится активность по общим заданиям с друзьями.'))+'</div>';
    return;
  }
  el.innerHTML='<div class="sectiontitle"><span>'+esc(tr('Совместная активность'))+'</span><span>'+T.activity.length+'</span></div><div class="st-feed">'+
    T.activity.slice(0,15).map(it=>{
      const av=FS().avHTML?FS().avHTML({display_name:it.actor_name,avatar_thumb:it.actor_avatar,color:it.actor_color,frame:it.actor_frame},32,{noDot:true}):'';
      const tm=FS().ago?FS().ago(it.created_at):'';
      return '<div class="st-feed-item">'+av+'<div class="st-feed-body"><div>'+activityLine(it)+'</div><div class="tiny">'+esc(tm)+'</div></div></div>';
    }).join('')+'</div>';
}

function renderUserSharedActivity(el,profile){
  if(!el||!profile)return;
  const shared=(T.tasks||[]).filter(t=>(t.members||[]).some(m=>m.id===profile.id||m.form_id===profile.id));
  if(!shared.length){
    el.innerHTML='<div class="pc-sec"><div class="tiny">'+esc(tr('Общие задания'))+'</div><p class="sub">'+esc(tr('У вас пока нет совместных заданий с этим пользователем.'))+'</p></div>';
    return;
  }
  el.innerHTML='<div class="pc-sec"><div class="row tiny"><span>'+esc(tr('Общие задания'))+'</span><span>'+shared.length+'</span></div><div style="margin-top:10px">'+
    shared.map(t=>{
      const pct=calcOverallProgress(t);
      return '<div class="srow"><div><b data-nt>'+esc(t.title)+'</b><div class="tiny">'+esc(tr('Общий прогресс: {p}% · +{xp} XP',{p:pct,xp:t.xp||50}))+'</div></div><span class="tag">'+(pct>=100?esc(tr('Готово')):pct+'%')+'</span></div>';
    }).join('')+'</div></div>';
}

/* ---------- модальные окна: создание, приглашение друзей ---------- */
function openCreateModal(preselectFriendId){
  const friends=FS().friends||[];
  const fList=friends.length?friends.map(f=>{
    const checked=preselectFriendId&&f.id===preselectFriendId?' checked':'';
    const nm=FS().dispName?FS().dispName(f):(f.display_name||f.username);
    return '<label class="st-fopt" style="margin:0;text-transform:none;letter-spacing:0;color:var(--ink)"><span style="display:flex;align-items:center;gap:8px">'+
      (FS().avHTML?FS().avHTML(f,28,{noDot:true}):'')+'<span data-nt><b>'+esc(nm)+'</b> <span class="tiny">@'+esc(f.username)+'</span></span></span>'+
      '<input type="checkbox" name="stFriend" value="'+esc(f.id)+'"'+checked+'></label>';
  }).join(''):'<div class="tiny">'+esc(tr('У вас пока нет друзей для приглашения. Вы сможете пригласить их позже.'))+'</div>';

  $('modal').innerHTML='<h3>'+esc(tr('Новое совместное задание'))+'</h3>'+
    '<form id="stCreateForm" autocomplete="off">'+
      '<label for="stTitle" style="margin-top:0">'+esc(tr('Название задания'))+'</label>'+
      '<input class="field" id="stTitle" maxlength="80" required placeholder="'+esc(tr('Например: Пробежать 10 км за неделю'))+'">'+
      '<label for="stDesc">'+esc(tr('Описание (необязательно)'))+'</label>'+
      '<input class="field" id="stDesc" maxlength="180" placeholder="'+esc(tr('Условия или цель для команды'))+'">'+
      '<div class="row" style="gap:10px">'+
        '<div style="flex:1"><label for="stCat">'+esc(tr('Категория'))+'</label><select class="field" id="stCat">'+CATS.map(c=>'<option value="'+c[0]+'">'+esc(tr(c[1]))+'</option>').join('')+'</select></div>'+
        '<div style="width:120px"><label for="stXp">'+esc(tr('Награда XP'))+'</label><input class="field" id="stXp" type="number" min="10" max="500" step="10" value="60"></div>'+
      '</div>'+
      '<div class="tiny hint">'+esc(tr('За совместное выполнение начисляется +25% командного бонуса XP каждому участнику.'))+'</div>'+
      '<label>'+esc(tr('Пригласить друзей'))+'</label>'+
      '<div class="st-fpick">'+fList+'</div>'+
      '<div class="row" style="margin-top:18px"><button type="button" class="btn ghost" onclick="closeModal()">'+esc(tr('Отмена'))+'</button><button type="submit" class="btn primary">'+esc(tr('Создать задание'))+'</button></div>'+
    '</form>';
  showModal();
}

function openInviteMoreModal(taskId){
  const task=T.tasks.find(t=>t.id===taskId);
  if(!task)return;
  const existing=new Set((task.members||[]).map(m=>m.id||m.form_id));
  const avail=(FS().friends||[]).filter(f=>!existing.has(f.id));
  if(!avail.length)return toast(tr('Все ваши друзья уже добавлены в это задание'));

  $('modal').innerHTML='<h3>'+esc(tr('Пригласить друзей'))+'</h3><p class="sub" data-nt>'+esc(task.title)+'</p>'+
    '<form id="stInviteMoreForm" data-tid="'+esc(taskId)+'">'+
      '<div class="st-fpick">'+avail.map(f=>{
        const nm=FS().dispName?FS().dispName(f):(f.display_name||f.username);
        return '<label class="st-fopt" style="margin:0;text-transform:none;letter-spacing:0;color:var(--ink)"><span style="display:flex;align-items:center;gap:8px">'+
          (FS().avHTML?FS().avHTML(f,28,{noDot:true}):'')+'<span data-nt><b>'+esc(nm)+'</b> <span class="tiny">@'+esc(f.username)+'</span></span></span>'+
          '<input type="checkbox" name="stInvFriend" value="'+esc(f.id)+'"></label>';
      }).join('')+'</div>'+
      '<div class="row" style="margin-top:18px"><button type="button" class="btn ghost" onclick="closeModal()">'+esc(tr('Отмена'))+'</button><button type="submit" class="btn primary">'+esc(tr('Отправить приглашения'))+'</button></div>'+
    '</form>';
  showModal();
}

function openInviteFriendModal(friendId,friendName){
  const activeTasks=T.tasks.filter(t=>t.status!=='completed'&&!(t.members||[]).some(m=>m.id===friendId||m.form_id===friendId));
  if(!activeTasks.length){
    return openCreateModal(friendId);
  }
  $('modal').innerHTML='<h3>'+esc(tr('Пригласить в задание'))+'</h3><p class="sub" data-nt>'+esc(friendName)+'</p>'+
    '<div class="ddm">'+
      activeTasks.map(t=>'<button type="button" data-st-act="send_single_invite" data-tid="'+esc(t.id)+'" data-fid="'+esc(friendId)+'" data-nt>'+esc(t.title)+' ('+calcOverallProgress(t)+'%)</button>').join('')+
      '<button type="button" class="btn secondary" data-st-act="open_create_for" data-fid="'+esc(friendId)+'">+ '+esc(tr('Создать новое совместное задание'))+'</button>'+
    '</div>'+
    '<div class="row" style="margin-top:14px"><button type="button" class="btn ghost" onclick="closeModal()">'+esc(tr('Закрыть'))+'</button></div>';
  showModal();
}

/* ---------- обработчики действий ---------- */
async function updateProgress(taskId,pct){
  pct=Math.max(0,Math.min(100,Math.round(+pct||0)));
  try{
    await rpc('update_shared_task_progress',{p_task_id:taskId,p_progress:pct});
    toast(pct>=100?tr('Ваша часть задания выполнена!'):tr('Прогресс обновлён: {p}%',{p:pct}));
    await refresh(true);
  }catch(e){toast(human(e))}
}

document.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-st-act]');
  if(!btn)return;
  const act=btn.dataset.stAct,tid=btn.dataset.tid,fid=btn.dataset.fid;
  try{
    if(act==='open_create')return openCreateModal();
    if(act==='open_create_for'){closeModal();return openCreateModal(fid)}
    if(act==='invite_more')return openInviteMoreModal(tid);
    if(act==='complete_mine')return updateProgress(tid,100);
    if(act==='reset_mine')return updateProgress(tid,0);
    if(act==='accept_invite'){
      await rpc('respond_shared_task_invite',{p_task_id:tid,p_accept:true});
      toast(tr('Вы присоединились к совместному заданию'));
      await refresh(true);
      if(FS().refreshUnread)FS().refreshUnread();
    }else if(act==='decline_invite'){
      await rpc('respond_shared_task_invite',{p_task_id:tid,p_accept:false});
      toast(tr('Приглашение отклонено'));
      await refresh(true);
      if(FS().refreshUnread)FS().refreshUnread();
    }else if(act==='send_single_invite'){
      closeModal();
      await rpc('invite_to_shared_task',{p_task_id:tid,p_friend_ids:[fid]});
      toast(tr('Приглашение отправлено'));
      await refresh(true);
    }else if(act==='leave'){
      await rpc('leave_shared_task',{p_task_id:tid});
      toast(tr('Задание удалено из вашего списка'));
      await refresh(true);
    }
  }catch(err){toast(human(err))}
});

document.addEventListener('change',e=>{
  const r=e.target.closest('[data-st-range]');
  if(r)updateProgress(r.dataset.stRange,r.value);
});

document.addEventListener('submit',async e=>{
  if(e.target.id==='stCreateForm'){
    e.preventDefault();
    const title=($('stTitle')||{}).value||'';
    const desc=($('stDesc')||{}).value||'';
    const cat=($('stCat')||{}).value||'SOCIAL';
    const xp=Math.max(10,Math.min(500,+($('stXp')||{}).value||60));
    const friendIds=[...e.target.querySelectorAll('input[name="stFriend"]:checked')].map(i=>i.value);
    if(!title.trim())return toast(tr('Введите название задания'));
    try{
      await rpc('create_shared_task',{
        p_title:title.trim(),
        p_description:desc.trim(),
        p_category:cat,
        p_xp:xp,
        p_friend_ids:friendIds
      });
      closeModal();
      toast(tr('Совместное задание создано'));
      await refresh(true);
    }catch(err){toast(human(err))}
  }else if(e.target.id==='stInviteMoreForm'){
    e.preventDefault();
    const tid=e.target.dataset.tid;
    const friendIds=[...e.target.querySelectorAll('input[name="stInvFriend"]:checked')].map(i=>i.value);
    if(!friendIds.length)return toast(tr('Выберите хотя бы одного друга'));
    try{
      await rpc('invite_to_shared_task',{p_task_id:tid,p_friend_ids:friendIds});
      closeModal();
      toast(tr('Приглашения отправлены'));
      await refresh(true);
    }catch(err){toast(human(err))}
  }
});

async function start(client,user){
  if(started)return;
  sb=client;uid=user.id;started=true;
  ensureContainer();
  subscribeRealtime();
  pollTm=setInterval(()=>{if(!document.hidden&&navigator.onLine)refresh(true)},30000);
  await refresh(false);
}

window.FormSharedTasks={
  start,
  refresh,
  renderFriendsFeed,
  renderUserSharedActivity,
  openCreateModal,
  openInviteFriendModal,
  hasPendingInvite:tid=>T.invites.some(i=>i.task_id===tid)
};
})();
