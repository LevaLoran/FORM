/* FORM. v0.14 — социальная система: FORM ID, друзья, профили, приватность, уведомления.
   Всё, что касается других людей, идёт через функции Supabase (supabase/setup.sql, часть 3):
   настройки приватности применяет сервер, а не это приложение. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const RM=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);
const SITE=location.origin+location.pathname.replace(/index\.html$/,'');
const DEF_NAME='ПОЛЬЗОВАТЕЛЬ';
const SUB=new Set(['userprofile','privacy','notifs','owner']);
const NAV=[];
let sb=null,uid=null,started=false;
const O={tab:'users',q:'',cur:null};
const S={me:null,friends:[],blocked:[],notifs:[],unread:0,prevUnread:null,tab:'all',viewing:null,preview:null,loadErr:null,results:null,query:'',D:null};

/* ---------- ошибки ---------- */
const ERR={
  username_taken:'Это имя уже занято',
  username_invalid:'Имя пользователя: 3–20 символов, латиница, цифры, _ и точка',
  username_reserved:'Это имя зарезервировано',
  username_cooldown:'Имя пользователя можно менять раз в 7 дней',
  image_invalid:'Изображение не подошло',
  not_found:'Пользователь не найден',
  self:'Это вы',
  unblock_first:'Сначала разблокируйте пользователя',
  unavailable:'Действие недоступно',
  already_friends:'Вы уже друзья',
  already_sent:'Заявка уже отправлена',
  requests_closed:'Пользователь не принимает заявки в друзья',
  too_many_pending:'Слишком много отправленных заявок',
  no_request:'Заявка больше не актуальна',
  auth_required:'Нужно войти в аккаунт',
  forbidden:'Нет доступа',
  role_invalid:'Недопустимая роль',
  self_role:'Свою роль менять нельзя',
  owner_protected:'Роль владельца изменить нельзя',
  tag_invalid:'Тег: от 1 до 24 символов',
  too_many_tags:'У пользователя уже 3 тега',
  item_invalid:'Неизвестный предмет',
  frame_locked:'Эта рамка вам недоступна',
  name_reserved:'Это название совпадает с тегом другого пользователя',
  shared_invites_closed:'Пользователь ограничил приглашения в совместные задания',
  task_not_found:'Совместное задание не найдено',
  not_participant:'Вы не являетесь участником этого задания',
  already_invited:'Пользователь уже приглашён в это задание',
  too_many_participants:'Достигнут лимит участников задания (макс. 10)'
};
function human(e){
  const m=String(e&&e.message||''),c=String(e&&e.code||'');
  if(Object.prototype.hasOwnProperty.call(ERR,m))return i18(ERR[m]);
  if(!navigator.onLine||e&&e.name==='AuthRetryableFetchError'||/failed to fetch|network|load failed/i.test(m))return i18('Нет соединения. Проверьте интернет и повторите.');
  if(c==='PGRST202'||/could not find the function|schema cache/i.test(m))return i18('Социальные функции ещё не настроены на сервере (владельцу: выполнить supabase/setup.sql, часть 3).');
  return i18('Не удалось выполнить действие. Попробуйте ещё раз.');
}
async function rpc(fn,args){
  if(!sb)throw new Error('no_client');
  const r=await sb.rpc(fn,args||{});
  if(r.error)throw r.error;
  return r.data;
}

/* ---------- мелкие помощники ---------- */
const clean=s=>String(s==null?'':s);
const IMG_RE=/^data:image\/(webp|jpeg|png|gif);base64,[A-Za-z0-9+\/=]+$/;
const safeImg=u=>(typeof u==='string'&&u.length<1000000&&IMG_RE.test(u))?u:'';
const safeUrl=u=>(typeof u==='string'&&/^https?:\/\/[^\s<>"']+$/i.test(u)&&u.length<=200)?u:'';
const hex=c=>/^#[0-9a-f]{6}$/i.test(c||'')?c:'#2f5bea';
const pad2=n=>String(n).padStart(2,'0');
const myName=()=>state.callsign&&state.callsign!==DEF_NAME?state.callsign:'';
const dispName=u=>u&&(u.display_name||u.username)||'';
function ago(ts){
  const s=(Date.now()-new Date(ts).getTime())/1000;
  if(!isFinite(s))return '';
  if(s<90)return i18('только что');
  try{
    const rt=new Intl.RelativeTimeFormat(loc(),{numeric:'auto'});
    if(s<3600)return rt.format(-Math.round(s/60),'minute');
    if(s<86400)return rt.format(-Math.round(s/3600),'hour');
    return rt.format(-Math.round(s/86400),'day');
  }catch(_){return new Date(ts).toLocaleDateString(loc())}
}
async function copyText(t){
  try{await navigator.clipboard.writeText(t);return true}catch(_){
    const a=document.createElement('textarea');a.value=t;a.setAttribute('readonly','');a.style.cssText='position:fixed;opacity:0;top:0';
    document.body.appendChild(a);a.select();let ok=false;try{ok=document.execCommand('copy')}catch(__){}
    a.remove();return ok;
  }
}
async function copyId(id){toast((await copyText(id))?i18('ID скопирован: {id}',{id}):i18('Не удалось скопировать'))}
async function copyLink(id){toast((await copyText(SITE+'?u='+encodeURIComponent(id.replace(/\D/g,''))))?i18('Ссылка на профиль скопирована'):i18('Не удалось скопировать'))}
function confirmBox(title,text,okLabel,fn){
  $('modal').innerHTML='<h3>'+esc(i18(title))+'</h3><p class="sub">'+esc(i18(text))+'</p><div class="row" style="margin-top:17px"><button class="btn ghost" onclick="closeModal()">'+esc(i18('Отмена'))+'</button><button class="btn" id="cfGo">'+esc(i18(okLabel))+'</button></div>';
  showModal();
  $('cfGo').onclick=async()=>{closeModal();try{await fn()}catch(e){toast(human(e))}};
}
const badgeTxt=n=>n>99?'99+':String(n);
function setBadge(el,n){if(!el)return;el.hidden=!(n>0);el.textContent=n>0?badgeTxt(n):''}

/* ---------- навигация между экранами ---------- */
const cur=()=>{const a=document.querySelector('.screen.active');return a?a.id:'dashboard'};
function go(id){
  const c=cur();
  if(c!==id&&NAV[NAV.length-1]!==c){NAV.push(c);if(NAV.length>12)NAV.shift()}
  showScreen(id);
}
function back(def){
  const p=NAV.pop();
  showScreen(p&&p!==cur()?p:(def||'friends'));
}

/* ---------- картинки ---------- */
function loadImg(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('img'));i.src=src})}
async function decodeFile(f){
  try{return await createImageBitmap(f,{imageOrientation:'from-image'})}catch(_){
    const u=URL.createObjectURL(f);try{return await loadImg(u)}finally{URL.revokeObjectURL(u)}
  }
}
function encode(c,q){
  let u=c.toDataURL('image/webp',q);
  if(u.indexOf('data:image/webp')!==0)u=c.toDataURL('image/jpeg',q);
  return u;
}
async function squareOf(src,size,q){
  const i=await loadImg(src),c=document.createElement('canvas');c.width=c.height=size;
  const s=Math.min(i.width,i.height);
  c.getContext('2d').drawImage(i,(i.width-s)/2,(i.height-s)/2,s,s,0,0,size,size);
  return encode(c,q);
}
/* файл → картинка нужного размера с обрезкой по центру; размер результата ограничен сервером (≈280 КБ) */
async function fileToCover(f,w,h){
  const img=await decodeFile(f),iw=img.width||img.naturalWidth,ih=img.height||img.naturalHeight;
  if(!iw||!ih)throw new Error('img');
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const k=Math.max(w/iw,h/ih),sw=w/k,sh=h/k;
  c.getContext('2d').drawImage(img,(iw-sw)/2,(ih-sh)/2,sw,sh,0,0,w,h);
  for(const q of [.82,.7,.58,.45]){const u=encode(c,q);if(u.length<=250000)return u}
  throw new Error('big');
}

/* ---------- рамки аватара ---------- */
const FRAMES=[['none','Без рамки',0],['ring','Кольцо',0],['dots','Точки',2],['double','Двойная',4],['square','Квадрат',6],['orbit','Орбита',8],['halo','Ореол',10],['aurora','Аврора','x'],['crown','Корона','x'],['void','Пустота','x']];
const myRank=()=>rankIndex(state.xp);
const isOwner=()=>!!(S.me&&S.me.role==='owner'); // только подсказка для интерфейса: права проверяет сервер
const frameOk=f=>{
  const d=FRAMES.find(x=>x[0]===f);if(!d)return false;
  if(isOwner())return true; // владельцу открыто всё
  if(d[2]==='x')return ((S.me&&S.me.unlocked)||[]).includes(f); // эксклюзив: только выданное владельцем
  return myRank()>=d[2];
};
const TAG_STYLES=[['solid','Заливка'],['outline','Контур'],['dotted','Пунктир'],['glow','Свечение'],['plain','Текст']];
const ROLE_L={owner:'Владелец',tester:'Тестировщик',user:'Пользователь'};
function tagsHTML(tags){
  if(!Array.isArray(tags)||!tags.length)return '';
  return '<span class="utags">'+tags.slice(0,3).map(t=>{
    const st=TAG_STYLES.some(x=>x[0]===t.s)?t.s:'outline',c=/^#[0-9a-f]{6}$/i.test(t.c||'')?' style="--tc:'+t.c+'"':'';
    return '<span class="utag t-'+st+'"'+c+' data-nt>'+esc(t.l)+'</span>';
  }).join('')+'</span>';
}
const roleChip=r=>r&&r!=='user'?'<span class="rolechip r-'+esc(r)+'">'+esc(i18(ROLE_L[r]||r))+'</span>':'';
const letter=n=>(String(n||'?').trim().charAt(0)||'?').toUpperCase();
function avHTML(u,size,o){
  o=o||{};
  const img=safeImg(o.big?(u.avatar_anim||u.avatar||u.avatar_thumb):(u.avatar_thumb||u.avatar));
  const fr=FRAMES.some(f=>f[0]===u.frame)?u.frame:'none',name=dispName(u);
  const dot=o.noDot||u.online==null?'':'<i class="odot'+(u.online?' on':'')+'" aria-hidden="true"></i>';
  return '<span class="pav f-'+fr+'" style="--s:'+size+'px;--pc:'+hex(u.color)+'"><span class="av" style="--s:'+size+'px">'+
    (img?'<img alt="" decoding="async" src="'+img+'">':'<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" style="fill:var(--bg2)"/><text x="24" y="32" text-anchor="middle" font-size="22" font-family="ui-monospace,Menlo,monospace" fill="currentColor">'+esc(letter(name))+'</text></svg>')+
    '</span>'+dot+'</span>';
}

/* ---------- мой профиль: кэш, отправка на сервер ---------- */
const CK=()=>'formSocial:'+uid;
function loadCache(){
  try{const c=JSON.parse(localStorage.getItem(CK())||'null');if(c&&c.id&&!S.me)S.me=c}catch(_){}
}
function saveCache(){
  if(!S.me)return;
  try{const c={...S.me};delete c.banner_image;delete c.bg_image;delete c.avatar;delete c.avatar_anim;localStorage.setItem(CK(),JSON.stringify(c))}catch(_){}
}
const avSig=()=>state.avatar?state.avatar.length+':'+state.avatar.slice(-24):'';
let pushTm=null,pushBusy=false,lastSig='';
function sigNow(){return [state.callsign,state.xp,state.completed.length,state.unlocked.length,avSig()].join('|')}
function touch(){
  if(!started||!S.me)return;
  if(cur()==='profile'&&S.D)clearTimeout(prevTm),prevTm=setTimeout(drawPrev,80);
  const s=sigNow();if(s===lastSig)return;
  clearTimeout(pushTm);pushTm=setTimeout(()=>pushMine(false),2500);
}
function statsNow(){
  return {rank:myRank(),xp:state.xp,tasks:state.completed.length,best:bestStreak(state),medals:medalDefs.filter(d=>isOwner()||medalOk(d)).map(d=>d[0])};
}
async function pushMine(first){
  if(pushBusy||!sb||!S.me)return;
  pushBusy=true;
  const sig=sigNow();
  try{
    const p={stats:statsNow()};
    // имя показываем то же, что и в приложении (имя по умолчанию не отправляем: другие увидят @имя)
    const dn=myName();
    if(dn!==(S.me.display_name||''))p.display_name=dn;
    let avKey='';try{avKey=localStorage.getItem('formSocialAv:'+uid)||''}catch(_){}
    const asig=avSig();
    if(asig!==avKey||(first&&!!state.avatar!==!!S.me.avatar&&!S.me.avatar_anim)){
      if(state.avatar){
        try{p.avatar=await squareOf(state.avatar,192,.8);p.avatar_thumb=await squareOf(state.avatar,64,.75)}catch(_){}
      }else if(!S.me.avatar_anim){p.avatar=null;p.avatar_thumb=null}
    }
    const r=await rpc('update_profile',{p});
    S.me=r;saveCache();lastSig=sig;
    if('avatar' in p){try{localStorage.setItem('formSocialAv:'+uid,asig)}catch(_){}}
    renderIdCard();
  }catch(e){console.warn('profile push',e&&e.message)}
  pushBusy=false;
}

/* ---------- карточка с моим FORM ID ---------- */
function idChip(id){return '<button type="button" class="idchip" data-act="copyid" data-id="'+esc(id)+'" aria-label="'+esc(i18('Копировать ID'))+'" data-nt><b>'+esc(id)+'</b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="1.5"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/></svg></button>'}
function renderIdCard(){
  const orow=$('ownerRow');if(orow)orow.hidden=!isOwner();
  const el=$('myIdCard');if(!el)return;
  const m=S.me;
  if(!m){el.innerHTML='<div class="tiny">'+esc(S.loadErr?human(S.loadErr):i18('Загружаю профиль…'))+'</div>';return}
  el.innerHTML='<div class="tiny">'+esc(i18('Ваш FORM ID'))+'</div><div class="idrow">'+idChip(m.id)+'<span class="tiny" data-nt>@'+esc(m.username)+'</span>'+tagsHTML(m.tags)+'</div><div class="tiny idnote">'+esc(i18('ID постоянный и не меняется. Имя пользователя и отображаемое имя можно менять.'))+'</div>';
  const a=$('addMyId');if(a)a.innerHTML=el.innerHTML;
}

/* ---------- публичная карточка профиля ---------- */
function stat(k,v){return '<div class="stat"><div class="tiny">'+esc(i18(k))+'</div><div class="big">'+esc(String(v))+'</div></div>'}
function linkHTML(l){
  const u=safeUrl(l.url);if(!u)return '';
  let label=clean(l.label);
  if(!label){try{label=new URL(u).hostname.replace(/^www\./,'')}catch(_){label=u}}
  return '<a class="plink" data-nt href="'+esc(u)+'" target="_blank" rel="noopener noreferrer nofollow"><span>'+esc(label)+'</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 6H6v12h12v-3M13 5h6v6M19 5l-8 8"/></svg></a>';
}
function badgeHTML(name,on){
  const k=medalDefs.findIndex(d=>d[0]===name);if(k<0)return '';
  return '<div class="pbadge'+(on?' pin':'')+'" title="'+esc(i18(medalDefs[k][1]))+'"><span class="mb">'+medalLab[k]+'</span><b>'+esc(name)+'</b></div>';
}
/* v — профиль в формате сервера; o.actions — HTML кнопок */
function cardHTML(v,o){
  o=o||{};
  const th=v.theme||{},col=hex(th.color),deco=th.deco||'none',c2=/^#[0-9a-f]{6}$/i.test(th.color2||'')?th.color2:'';
  if(v.limited){
    return '<div class="pcard" style="--pc:'+col+'"><div class="pc-banner" data-deco="none"></div><div class="pc-main"><div class="pc-avrow">'+avHTML({...v,color:col,frame:th.frame,online:null},88,{big:true})+'<div class="pc-act">'+(o.actions||'')+'</div></div><div class="pc-nm" style="margin-top:12px"><h2 class="pc-name" data-nt>'+esc(dispName(v))+'</h2>'+tagsHTML(v.tags)+'</div><div class="pc-ids">'+idChip(v.id)+'<span class="tiny" data-nt>@'+esc(v.username)+'</span></div><p class="sub pc-lim">'+esc(i18('Этот пользователь ограничил просмотр профиля.'))+'</p></div></div>';
  }
  const pinned=(v.badges&&v.badges.pinned)||[],medals=(v.badges&&v.badges.medals)||[];
  let h='<div class="pcard" data-bg="'+esc(th.bg||'none')+'" style="--pc:'+col+(c2?';--pc2:'+c2:'')+'"'+(c2?' data-grad="1"':'')+'><div class="pc-banner" data-deco="'+esc(deco)+'" data-img="'+(th.banner==='image'&&safeImg(v.banner_image)?'1':'')+'"></div><div class="pc-main">';
  h+='<div class="pc-avrow">'+avHTML({...v,color:col,frame:th.frame},88,{big:true})+'<div class="pc-act">'+(o.actions||'')+'</div></div>';
  h+='<div class="pc-title"><div class="pc-nm"><h2 class="pc-name" data-nt>'+esc(dispName(v))+'</h2>'+tagsHTML(v.tags)+'</div>'+(v.badges?'<span class="pc-rank" title="'+esc(i18(rankNames[v.badges.rank]||''))+'">'+crest(Math.max(0,Math.min(MAX_RANK,v.badges.rank|0)))+'</span>':'')+'</div>';
  h+='<div class="pc-ids">'+idChip(v.id)+'<span class="tiny" data-nt>@'+esc(v.username)+'</span></div>';
  if(v.online===true)h+='<div class="pc-pres on">'+esc(i18('В сети'))+'</div>';
  else if(v.online===false||v.last_seen)h+='<div class="pc-pres">'+esc(v.last_seen?i18('Был(а) в сети {t}',{t:ago(v.last_seen)}):i18('Не в сети'))+'</div>';
  if(v.status)h+='<div class="pc-status" data-nt>'+esc(v.status)+'</div>';
  if(v.bio)h+='<div class="pc-sec"><div class="tiny">'+esc(i18('О себе'))+'</div><p class="pc-bio" data-nt>'+esc(v.bio)+'</p></div>';
  if(v.badges){
    const all=medals.filter(m=>!pinned.includes(m));
    h+='<div class="pc-sec"><div class="row tiny"><span>'+esc(i18('Достижения'))+'</span><span>'+esc(i18('{n} из {m}',{n:medals.length,m:medalDefs.length}))+'</span></div>';
    h+='<div class="pbadges">'+(pinned.map(n=>badgeHTML(n,true)).join('')+all.map(n=>badgeHTML(n,false)).join('')||'<span class="tiny">'+esc(i18('Пока нет достижений'))+'</span>')+'</div></div>';
  }
  if(v.stats)h+='<div class="pc-sec"><div class="stats">'+stat('XP',v.stats.xp)+stat('Задач',v.stats.tasks)+stat('Лучшая серия',v.stats.best)+'</div></div>';
  const links=(v.links||[]).map(linkHTML).join('');
  if(links)h+='<div class="pc-sec"><div class="tiny">'+esc(i18('Ссылки'))+'</div><div class="plinks">'+links+'</div></div>';
  if(v.registered_at)h+='<div class="pc-sec pc-reg tiny">'+esc(i18('В FORM с {d}',{d:new Date(v.registered_at).toLocaleDateString(loc(),{day:'numeric',month:'long',year:'numeric'})}))+'</div>';
  return h+'</div></div>';
}
/* картинки ставятся через CSSOM после вставки: в атрибуты строки с данными не попадают */
function paintCard(root,v){
  if(!root||!v)return;
  const th=v.theme||{},b=root.querySelector('.pc-banner'),c=root.querySelector('.pcard');
  const bi=th.banner==='image'?safeImg(v.banner_image):'';
  if(b&&bi)b.style.backgroundImage='url("'+bi+'")';
  const bg=th.bg==='image'?safeImg(v.bg_image):'';
  if(c&&bg)c.style.setProperty('--bgimg','url("'+bg+'")');
  if(c&&th.bg==='image'&&!bg)c.dataset.bg='none';
}
function showCard(box,v,o){box.innerHTML=cardHTML(v,o);paintCard(box,v)}

/* ---------- кнопки по отношениям ---------- */
function actionsHTML(d){
  const rel=d.relation,id=d.profile.id,b=(a,t,c)=>'<button type="button" class="btn small '+(c||'')+'" data-act="'+a+'" data-id="'+esc(id)+'">'+esc(i18(t))+'</button>';
  let h='';
  if(d.preview)return '';
  if(d.blocked_by_me)h=b('unblock','Разблокировать','secondary');
  else if(rel==='friend')h='<span class="tag">'+esc(i18('В друзьях'))+'</span>'+(d.can_invite_task!==false?'<button type="button" class="btn small secondary" data-act="invite_task" data-id="'+esc(id)+'">'+esc(i18('Пригласить в задание'))+'</button>':'');
  else if(rel==='incoming')h=b('accept','Принять')+b('decline','Отклонить','ghost');
  else if(rel==='outgoing')h='<span class="tag">'+esc(i18('Заявка отправлена'))+'</span>'+b('cancel','Отменить','ghost');
  else if(d.can_request)h=b('add','Добавить в друзья');
  else h='<span class="tag">'+esc(i18('Заявки отключены'))+'</span>';
  if(rel!=='self')h+='<button type="button" class="iconbtn more" data-act="menu" data-id="'+esc(id)+'" aria-label="'+esc(i18('Ещё'))+'"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>';
  return h;
}
function openMenu(id){
  const d=S.viewing&&S.viewing.data&&S.viewing.data.profile&&S.viewing.data.profile.id===id?S.viewing.data:null;
  const fr=(d&&d.relation==='friend')||S.friends.some(f=>f.id===id&&f.relation==='friend');
  const bl=(d&&d.blocked_by_me)||S.blocked.some(x=>x.id===id);
  const it=[['copyid','Копировать ID'],['copylink','Копировать ссылку на профиль']];
  if(fr)it.push(['remove','Удалить из друзей']);
  it.push(bl?['unblock','Разблокировать']:['block','Заблокировать']);
  $('modal').innerHTML='<h3 data-nt>'+esc(id)+'</h3><div class="ddm menu">'+it.map(x=>'<button type="button" data-act="'+x[0]+'" data-id="'+esc(id)+'">'+esc(i18(x[1]))+'</button>').join('')+'</div>';
  showModal();
}

/* ---------- действия с людьми ---------- */
function nameOf(id){
  const f=S.friends.find(x=>x.id===id)||S.blocked.find(x=>x.id===id)||(S.results||[]).find(x=>x.id===id);
  const d=S.viewing&&S.viewing.data&&S.viewing.data.profile;
  return dispName(f)||(d&&d.id===id?dispName(d):id);
}
async function act(a,id){
  if(!id)return;
  if(a!=='menu')closeModal();
  try{
    if(a==='copyid')return copyId(id);
    if(a==='copylink')return copyLink(id);
    if(a==='menu')return openMenu(id);
    if(a==='open'){closeModal();return openUser(id)}
    if(a==='invite_task'){if(window.FormSharedTasks)window.FormSharedTasks.openInviteFriendModal(id,nameOf(id));return}
    if(a==='add'){const r=await rpc('send_friend_request',{p_form_id:id});toast(r&&r.state==='friend'?i18('Вы теперь друзья'):i18('Заявка отправлена'))}
    else if(a==='accept'){await rpc('respond_friend_request',{p_form_id:id,p_accept:true});toast(i18('Заявка принята'))}
    else if(a==='decline'){await rpc('respond_friend_request',{p_form_id:id,p_accept:false});toast(i18('Заявка отклонена'))}
    else if(a==='cancel'){await rpc('cancel_friend_request',{p_form_id:id});toast(i18('Заявка отменена'))}
    else if(a==='remove'){closeModal();return confirmBox('Удалить из друзей?',i18('{n} исчезнет из вашего списка друзей. Уведомление ему не отправляется.',{n:nameOf(id)}),'Удалить',async()=>{await rpc('remove_friend',{p_form_id:id});toast(i18('Удалён из друзей'));await afterChange(id)})}
    else if(a==='block'){closeModal();return confirmBox('Заблокировать пользователя?',i18('{n} не сможет отправлять вам заявки и взаимодействовать с вами. Дружба и заявки будут удалены.',{n:nameOf(id)}),'Заблокировать',async()=>{await rpc('block_user',{p_form_id:id});toast(i18('Пользователь заблокирован'));await afterChange(id)})}
    else if(a==='unblock'){closeModal();await rpc('unblock_user',{p_form_id:id});toast(i18('Пользователь разблокирован'))}
    await afterChange(id);
  }catch(e){toast(human(e));if(/no_request|already|not_found|unavailable/.test(String(e&&e.message)))afterChange(id)}
}
async function afterChange(id){
  await Promise.all([refreshFriends(),loadBlocked()]);
  if(cur()==='userprofile'&&S.viewing&&!S.preview&&S.viewing.id===id)await loadUser(S.viewing.id,true);
  renderAll();
}

/* ---------- друзья ---------- */
async function refreshFriends(){
  try{S.friends=await rpc('friends_overview')||[];S.loadErr=null}catch(e){S.loadErr=S.loadErr||e}
  badges();
}
async function loadBlocked(){try{S.blocked=await rpc('list_blocked')||[]}catch(_){}}
const incoming=()=>S.friends.filter(f=>f.relation==='incoming');
const outgoing=()=>S.friends.filter(f=>f.relation==='outgoing');
const friendsOnly=()=>S.friends.filter(f=>f.relation==='friend');
function presenceLine(f){
  if(f.status)return clean(f.status);
  if(f.online===true)return i18('В сети');
  if(f.last_seen)return i18('Был(а) в сети {t}',{t:ago(f.last_seen)});
  return '';
}
function rowHTML(u,kind){
  let right='';
  if(kind==='in')right='<button type="button" class="btn small" data-act="accept" data-id="'+esc(u.id)+'">'+esc(i18('Принять'))+'</button><button type="button" class="btn small ghost" data-act="decline" data-id="'+esc(u.id)+'">'+esc(i18('Отклонить'))+'</button>';
  else if(kind==='out')right='<button type="button" class="btn small ghost" data-act="cancel" data-id="'+esc(u.id)+'">'+esc(i18('Отменить'))+'</button>';
  else if(kind==='find'){
    if(u.relation==='none')right='<button type="button" class="btn small" data-act="add" data-id="'+esc(u.id)+'">'+esc(i18('Добавить'))+'</button>';
    else if(u.relation==='friend')right='<span class="tag">'+esc(i18('В друзьях'))+'</span>';
    else if(u.relation==='outgoing')right='<span class="tag">'+esc(i18('Заявка отправлена'))+'</span>';
    else if(u.relation==='incoming')right='<button type="button" class="btn small" data-act="accept" data-id="'+esc(u.id)+'">'+esc(i18('Принять'))+'</button>';
  }
  const sub=kind==='all'||kind==='on'?presenceLine(u):'';
  return '<div class="frow"><button type="button" class="frmain" data-act="open" data-id="'+esc(u.id)+'">'+avHTML(u,44)+'<span class="frtxt"><span class="frname"><b data-nt>'+esc(dispName(u))+'</b>'+tagsHTML(u.tags)+'</span><span class="tiny" data-nt>@'+esc(u.username)+' · '+esc(u.id)+'</span>'+(sub?'<span class="frsub" data-nt>'+esc(sub)+'</span>':'')+'</span></button><span class="fract">'+right+'</span></div>';
}
function tabsHTML(){
  const all=friendsOnly(),on=all.filter(f=>f.online===true),pend=incoming().length+outgoing().length;
  const T=[['all','Все друзья',all.length],['on','В сети',on.length],['pend','Ожидание',pend,incoming().length],['add','Добавить друга',null]];
  return T.map(t=>'<button type="button" role="tab" class="frtab'+(S.tab===t[0]?' on':'')+'" aria-selected="'+(S.tab===t[0])+'" data-tab="'+t[0]+'">'+esc(i18(t[1]))+(t[2]!=null?' <em>'+t[2]+'</em>':'')+(t[3]?'<i class="nbadge sm">'+badgeTxt(t[3])+'</i>':'')+'</button>').join('');
}
function renderFriends(){
  const box=$('frBody'),tabs=$('frTabs');if(!box||!tabs)return;
  tabs.innerHTML=tabsHTML();
  if(!S.me&&S.loadErr){box.innerHTML='<div class="empty">'+esc(human(S.loadErr))+'</div>';return}
  if(S.tab==='all'||S.tab==='on'){
    let l=friendsOnly();if(S.tab==='on')l=l.filter(f=>f.online===true);
    l=l.slice().sort((a,b)=>(b.online===true)-(a.online===true));
    let feedHtml='';
    if(S.tab==='all'&&window.FormSharedTasks){
      feedHtml='<div id="friendsSharedFeed"></div>';
    }
    box.innerHTML=(l.length?'<div class="sectiontitle"><span>'+esc(i18(S.tab==='on'?'В сети':'Все друзья'))+'</span><span>'+l.length+'</span></div>'+l.map(u=>rowHTML(u,S.tab)).join(''):
      '<div class="empty">'+esc(i18(S.tab==='on'?'Сейчас никого из друзей нет в сети.':'Пока нет друзей. Найдите людей по FORM ID или имени.'))+'</div>'+(S.tab==='all'?'<button type="button" class="btn secondary small" data-tab="add">'+esc(i18('Добавить друга'))+'</button>':''))+feedHtml;
    if(S.tab==='all'&&window.FormSharedTasks){
      window.FormSharedTasks.renderFriendsFeed($('friendsSharedFeed'));
    }
  }else if(S.tab==='pend'){
    const i=incoming(),o=outgoing();
    box.innerHTML=(i.length?'<div class="sectiontitle"><span>'+esc(i18('Входящие'))+'</span><span>'+i.length+'</span></div>'+i.map(u=>rowHTML(u,'in')).join(''):'')+
      (o.length?'<div class="sectiontitle"><span>'+esc(i18('Исходящие'))+'</span><span>'+o.length+'</span></div>'+o.map(u=>rowHTML(u,'out')).join(''):'')+
      (!i.length&&!o.length?'<div class="empty">'+esc(i18('Нет ожидающих заявок.'))+'</div>':'');
  }else{
    box.innerHTML='<div class="idcard" id="addMyId"></div><form id="findForm" class="findform" role="search" autocomplete="off"><label for="findQ">'+esc(i18('Найти по FORM ID или имени'))+'</label><div class="row" style="gap:8px"><input class="field" id="findQ" maxlength="40" placeholder="'+esc(i18('FORM#123456, @имя или имя'))+'" autocapitalize="off" spellcheck="false" value="'+esc(S.query)+'"><button class="btn" type="submit">'+esc(i18('Найти'))+'</button></div></form><div id="findRes"></div>';
    const a=$('addMyId');if(a&&S.me)renderIdCard();
    drawResults();
  }
}
function drawResults(){
  const el=$('findRes');if(!el)return;
  if(S.results==null)el.innerHTML='<div class="empty">'+esc(i18('Введите FORM ID, @имя или часть имени (от 2 символов).'))+'</div>';
  else if(!S.results.length)el.innerHTML='<div class="empty">'+esc(i18('Никого не найдено.'))+'</div>';
  else el.innerHTML='<div class="sectiontitle"><span>'+esc(i18('Результаты'))+'</span><span>'+S.results.length+'</span></div>'+S.results.map(u=>rowHTML(u,'find')).join('');
}
let findTm=null,findSeq=0;
async function search(q){
  S.query=q;q=q.trim();
  if(q.replace(/^@/,'').length<2){S.results=null;drawResults();return}
  const seq=++findSeq;
  try{const r=await rpc('search_users',{p_q:q});if(seq!==findSeq)return;S.results=r||[]}catch(e){if(seq!==findSeq)return;S.results=[];toast(human(e))}
  drawResults();
}

/* ---------- профиль другого пользователя ---------- */
async function loadUser(id,quiet){
  const box=$('userBody');if(!box)return;
  if(!quiet)box.innerHTML='<div class="empty">'+esc(i18('Загружаю…'))+'</div>';
  S.viewing={id,data:null};
  let d=null;
  try{d=await rpc('get_profile',{p_form_id:id})}catch(e){box.innerHTML='<div class="empty">'+esc(human(e))+'</div>';return}
  if(!S.viewing||S.viewing.id!==id)return;
  if(d&&d.relation==='self'){NAV.pop();showScreen('profile');return}
  S.viewing.data=d;
  drawUser();
}
function drawUser(){
  const box=$('userBody'),V=S.viewing,d=V&&V.data;if(!box)return;
  if(!d||d.error){box.innerHTML='<div class="empty">'+esc(i18('Профиль недоступен или не существует.'))+'</div>';return}
  box.innerHTML='<div id="userCard"></div><div id="userSharedActivity"></div>';
  showCard($('userCard'),d.profile,{actions:actionsHTML(d)});
  if(window.FormSharedTasks&&d.relation==='friend'&&!d.preview){
    window.FormSharedTasks.renderUserSharedActivity($('userSharedActivity'),d.profile);
  }
}
function openUser(id){
  id=clean(id).toUpperCase().trim();
  if(!/^FORM#\d{6}$/.test(id)){const m=id.match(/\d{6}/);if(m)id='FORM#'+m[0];else return toast(i18('Пользователь не найден'))}
  S.preview=null;$('userHead').textContent=i18('Профиль');
  $('userPrev').hidden=true;
  go('userprofile');
  loadUser(id);
}

/* ---------- предпросмотр: как видят другие ---------- */
async function openPreview(as){
  S.preview={as:as||'stranger'};
  if(cur()!=='userprofile')go('userprofile');
  $('userHead').textContent=i18('Как видят другие');
  const pv=$('userPrev');pv.hidden=false;
  pv.querySelectorAll('button[data-as]').forEach(b=>{const on=b.dataset.as===S.preview.as;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});
  const box=$('userBody');box.innerHTML='<div class="empty">'+esc(i18('Загружаю…'))+'</div>';
  try{
    await pushMine(false);
    const d=await rpc('preview_profile',{p_as:S.preview.as});
    S.viewing={id:S.me&&S.me.id,data:d};
    // собственная картинка аватара в предпросмотре — локальная, сервер отдаёт то, что уже загружено
    drawUser();
    const n=document.createElement('p');n.className='tiny pvnote';n.textContent=S.preview.as==='friend'?i18('Так ваш профиль видит друг, с учётом настроек приватности.'):i18('Так ваш профиль видит любой другой пользователь, с учётом настроек приватности.');
    box.appendChild(n);
  }catch(e){box.innerHTML='<div class="empty">'+esc(human(e))+'</div>'}
}

/* ---------- уведомления ---------- */
function badges(){
  const inc=incoming().length;
  setBadge($('bellBadge'),S.unread);setBadge($('navFrBadge'),inc);
  const b=$('bellBtn');if(b)b.setAttribute('aria-label',S.unread?i18('Уведомления: {n}',{n:S.unread}):i18('Уведомления'));
}
async function refreshUnread(){
  try{
    const n=await rpc('notif_unread');
    const grew=S.prevUnread!=null&&n>S.prevUnread;
    S.unread=n|0;S.prevUnread=S.unread;badges();
    if(grew&&cur()!=='notifs')announce();
    if(cur()==='notifs')loadNotifs(true);
  }catch(_){}
}
async function announce(){
  try{
    const l=await rpc('notif_list',{p_limit:5});
    const n=(l||[]).find(x=>!x.read);if(n)toast(notifLine(n,true));
  }catch(_){}
}
function notifLine(n,plain){
  const a=n.actor,nm=a?dispName(a):'';
  if(n.type==='friend_request')return i18('{n} хочет добавить вас в друзья',{n:nm});
  if(n.type==='friend_accepted')return i18('{n} принял(а) вашу заявку в друзья',{n:nm});
  if(n.type==='shared_task_invite')return i18('{n} пригласил(а) вас в совместное задание «{t}»',{n:nm,t:clean(n.data&&n.data.title)});
  if(n.type==='shared_task_progress')return i18('{n} обновил(а) прогресс в задании «{t}» ({p}%)',{n:nm,t:clean(n.data&&n.data.title),p:Math.round(+(n.data&&n.data.pct)||0)});
  if(n.type==='shared_task_done')return i18('{n} выполнил(а) свою часть задания «{t}»',{n:nm,t:clean(n.data&&n.data.title)});
  if(n.type==='shared_task_completed')return i18('Совместное задание «{t}» полностью выполнено!',{t:clean(n.data&&n.data.title)});
  if(n.type==='shared_task_cancelled')return i18('Совместное задание «{t}» отменено',{t:clean(n.data&&n.data.title)});
  if(n.data&&n.data.k==='username_reset')return i18('Из соображений приватности ваше имя пользователя заменено: раньше оно было похоже на адрес почты. Новое имя можно выбрать в редакторе профиля.');
  const k=n.data&&n.data.k;
  if(k==='welcome')return plain?i18('Добро пожаловать в FORM'):i18('Добро пожаловать в FORM. У вас появился собственный FORM ID: найдите друзей, оформите профиль и настройте приватность.');
  return clean(n.data&&(n.data.title||n.data.body))||i18('Системное уведомление');
}
async function loadNotifs(quiet){
  const box=$('notifBody');if(!box)return;
  if(!quiet)box.innerHTML='<div class="empty">'+esc(i18('Загружаю…'))+'</div>';
  try{S.notifs=await rpc('notif_list',{p_limit:50})||[]}catch(e){box.innerHTML='<div class="empty">'+esc(human(e))+'</div>';return}
  drawNotifs();
  // открытие экрана = прочитано; непрочитанные остаются подсвеченными, пока экран открыт
  if(S.notifs.some(n=>!n.read)){
    try{await rpc('notif_mark_read',{});S.unread=0;S.prevUnread=0;badges()}catch(_){}
  }
}
function drawNotifs(){
  const box=$('notifBody');if(!box)return;
  if(!S.notifs.length){box.innerHTML='<div class="empty">'+esc(i18('Уведомлений нет.'))+'</div>';return}
  box.innerHTML=S.notifs.map(n=>{
    const a=n.actor,pending=n.type==='friend_request'&&a&&incoming().some(f=>f.id===a.id);
    const taskInv=n.type==='shared_task_invite'&&n.data&&n.data.task_id&&window.FormSharedTasks&&window.FormSharedTasks.hasPendingInvite(n.data.task_id);
    const ico=n.type==='system'?'<span class="av nsys" style="--s:40px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16.5v.01"/></svg></span>':avHTML(a||{display_name:'?'},40,{noDot:true});
    return '<div class="nrow'+(n.read?'':' unread')+'">'+(n.read?'':'<i class="udot" aria-hidden="true"></i>')+
      '<button type="button" class="nmain"'+(a?' data-act="open" data-id="'+esc(a.id)+'"':'')+'>'+ico+'<span class="ntxt"><span data-nt>'+esc(notifLine(n))+'</span><span class="tiny">'+esc(ago(n.created_at))+'</span></span></button>'+
      (pending?'<span class="fract"><button type="button" class="btn small" data-act="accept" data-id="'+esc(a.id)+'">'+esc(i18('Принять'))+'</button><button type="button" class="btn small ghost" data-act="decline" data-id="'+esc(a.id)+'">'+esc(i18('Отклонить'))+'</button></span>':'')+
      (taskInv?'<span class="fract"><button type="button" class="btn small" data-st-act="accept_invite" data-tid="'+esc(n.data.task_id)+'">'+esc(i18('Вступить'))+'</button><button type="button" class="btn small ghost" data-st-act="decline_invite" data-tid="'+esc(n.data.task_id)+'">'+esc(i18('Отклонить'))+'</button></span>':'')+'</div>';
  }).join('');
}

async function clearNotifs(){
  try{await rpc('notif_clear');S.notifs=[];S.unread=0;S.prevUnread=0;drawNotifs();badges()}catch(e){toast(human(e))}
}

/* ---------- приватность ---------- */
const PRIV=[
  ['requests','Заявки в друзья','Кто может отправлять вам заявки',[['everyone','Все'],['nobody','Никто']]],
  ['online','Онлайн-статус','Кто видит, что вы сейчас в сети',[['everyone','Все'],['friends','Друзья'],['nobody','Никто']]],
  ['last_seen','Последняя активность','Кто видит, когда вы были в сети',[['everyone','Все'],['friends','Друзья'],['nobody','Никто']]],
  ['profile','Профиль','Кто может открыть ваш профиль целиком',[['everyone','Все'],['friends','Друзья'],['nobody','Никто']]],
  ['find','Поиск','Кто может найти вас по имени',[['everyone','По имени и ID'],['id','Только по ID']]],
  ['shared_tasks','Совместные задания','Кто может приглашать вас в совместные задания',[['friends','Друзья'],['nobody','Никто']]],
  ['shared_activity','Совместная активность','Показывать общие задания и прогресс в ленте друзей',[['friends','Друзья'],['nobody','Никто']]]
];
const HIDE=[['bio','О себе'],['status','Статус'],['links','Ссылки'],['badges','Значки и достижения'],['stats','Статистика'],['registered','Дата регистрации'],['banner','Баннер и фон']];
function swHTML(k,on){return '<button type="button" class="sw" role="switch" aria-checked="'+(!!on)+'" data-hide="'+k+'"><i></i></button>'}
function renderPrivacy(){
  const inl=cur()==='profile',box=$(inl?'pePriv':'privBody'),other=$(inl?'privBody':'pePriv');
  if(other)other.innerHTML=''; // одна копия на странице: без дублей id
  if(!box)return;
  if(!S.me){box.innerHTML='<div class="empty">'+esc(S.loadErr?human(S.loadErr):i18('Загружаю профиль…'))+'</div>';return}
  const pv=Object.assign({requests:'everyone',online:'everyone',last_seen:'friends',profile:'everyone',find:'everyone',shared_tasks:'friends',shared_activity:'friends'},S.me.privacy||{}),hide=pv.hide||[];
  let h='<div class="acc">'+PRIV.map(p=>{const cur=pv[p[0]];const val=(cur!=null&&p[3].some(o=>o[0]===cur))?cur:p[3][0][0];return '<div class="prow"><div><b>'+esc(i18(p[1]))+'</b><div class="tiny">'+esc(i18(p[2]))+'</div></div><div class="seg full" role="radiogroup" data-pk="'+p[0]+'" style="grid-template-columns:repeat('+p[3].length+',1fr)">'+p[3].map(o=>'<button type="button" role="radio" data-v="'+o[0]+'" class="'+(val===o[0]?'on':'')+'" aria-checked="'+(val===o[0])+'">'+esc(i18(o[1]))+'</button>').join('')+'</div></div>'}).join('')+'</div>';
  if(!inl)h+='<div class="sectiontitle"><span>'+esc(i18('Скрыть из профиля'))+'</span></div><p class="sub">'+esc(i18('Скрытые элементы не видит никто, кроме вас. Это те же переключатели, что и в редакторе профиля.'))+'</p><div class="acc">'+HIDE.map(x=>'<div class="srow"><span>'+esc(i18(x[1]))+'</span>'+swHTML(x[0],hide.includes(x[0]))+'</div>').join('')+'</div>';
  h+='<div class="sectiontitle"><span>'+esc(i18('Заблокированные'))+'</span><span>'+S.blocked.length+'</span></div><p class="sub">'+esc(i18('Заблокированные пользователи не могут отправлять вам заявки и взаимодействовать с вами, а ваш профиль для них недоступен.'))+'</p>';
  h+='<form id="blockForm" class="findform" autocomplete="off"><div class="row" style="gap:8px"><input class="field" id="blockQ" maxlength="20" placeholder="FORM#123456" autocapitalize="off" spellcheck="false" aria-label="FORM ID"><button class="btn secondary" type="submit">'+esc(i18('Заблокировать'))+'</button></div></form>';
  h+=S.blocked.length?S.blocked.map(u=>'<div class="frow"><button type="button" class="frmain" data-act="open" data-id="'+esc(u.id)+'">'+avHTML(u,40,{noDot:true})+'<span class="frtxt"><span class="frname"><b data-nt>'+esc(dispName(u))+'</b>'+tagsHTML(u.tags)+'</span><span class="tiny" data-nt>'+esc(u.id)+'</span></span></button><span class="fract"><button type="button" class="btn small ghost" data-act="unblock" data-id="'+esc(u.id)+'">'+esc(i18('Разблокировать'))+'</button></span></div>').join(''):'<div class="empty">'+esc(i18('Список пуст.'))+'</div>';
  box.innerHTML=h;
}
async function setPriv(patch){
  const before=JSON.stringify(S.me.privacy);
  S.me.privacy={...S.me.privacy,...patch};renderPrivacy();
  try{S.me=await rpc('update_profile',{p:{privacy:patch}});saveCache();toast(i18('Сохранено'))}
  catch(e){S.me.privacy=JSON.parse(before);toast(human(e))}
  renderPrivacy();
}

/* ---------- редактор профиля: вкладка «Профиль», все настройки в одном месте ---------- */
const COLORS=['#111111','#3a3a42','#6b6b73','#a3a3ab','#ffffff','#2f5bea','#4f7bff','#0b8fa6','#00a3a3','#00677f','#1f9d63','#3d8f2f','#7fb800','#c2b500','#c77b00','#ffa94d','#e05a3a','#d93b3b','#8a3a1f','#c2399a','#d1478a','#ff6b9d','#8e44ad','#6b5be2','#5b2a86','#2a2a8a','#4dabf7','#69db7c','#b197fc','#006d4a'];
const DECOS=[['none','Нет'],['dots','Точки'],['grid','Сетка'],['lines','Линии'],['orbit','Орбита'],['ascii','ASCII'],['binary','Код']];
const BGS=[['none','Обычный'],['tint','Оттенок цвета'],['image','Моё изображение']];
const GIF_MAX={avatar:450000,banner:650000,bg:650000}; // байты файла: в базу GIF кладётся как есть (с анимацией)
let prevTm=null;
function draftFrom(m){
  const th=m.theme||{};
  return {display:myName(),username:m.username,bio:m.bio||'',status:m.status||'',links:(m.links||[]).map(l=>({label:l.label||'',url:l.url||''})),
    color:th.color||'#2f5bea',color2:th.color2||'',banner:th.banner||'color',deco:th.deco||'dots',bg:th.bg||'none',frame:th.frame||'none',
    banner_image:m.banner_image||null,bg_image:m.bg_image||null,avatar_anim:m.avatar_anim||null,pinned:(m.pinned||[]).slice(),hide:((m.privacy||{}).hide||[]).slice(),
    bannerCh:false,bgCh:false,avCh:false,avFirst:null,dirty:false};
}
function viewFromDraft(){
  const D=S.D,m=S.me,hide=D.hide,th={color:D.color,color2:D.color2||null,banner:D.banner,deco:D.deco,bg:D.bg,frame:D.frame};
  if(hide.includes('banner')){th.banner='color';th.deco='none';th.bg='none'}
  const st=statsNow(),have=st.medals;
  const v={id:m.id,tags:m.tags||[],username:D.username||m.username,display_name:D.display||D.username||m.username,
    avatar:state.avatar||(D.avFirst&&D.avFirst.avatar)||null,avatar_thumb:state.avatar||null,avatar_anim:D.avatar_anim,theme:th,online:true,
    banner_image:D.banner_image,bg_image:D.bg_image};
  if(!hide.includes('status'))v.status=D.status;
  if(!hide.includes('bio'))v.bio=D.bio;
  if(!hide.includes('links'))v.links=D.links.filter(l=>safeUrl(l.url));
  if(!hide.includes('registered'))v.registered_at=m.registered_at;
  if(!hide.includes('badges'))v.badges={rank:st.rank,medals:have,pinned:D.pinned.filter(x=>have.includes(x))};
  if(!hide.includes('stats'))v.stats={xp:st.xp,tasks:st.tasks,best:st.best};
  return v;
}
function drawPrev(){
  const box=$('pePrev');if(!box||!S.me)return;
  if(!S.D)S.D=draftFrom(S.me);
  showCard(box,viewFromDraft(),{});
  box.querySelectorAll('[data-act]').forEach(b=>{b.removeAttribute('data-act');b.tabIndex=-1});
}
function updateBar(){const b=$('peBar');if(b)b.hidden=!(S.D&&S.D.dirty)}
function swatchRow(sel,key,none){
  return (none?'<button type="button" class="swatch none'+(!sel?' on':'')+'" data-c2="" aria-label="'+esc(i18('Без второго цвета'))+'">×</button>':'')+
    COLORS.map(c=>'<button type="button" class="swatch'+((sel||'').toLowerCase()===c?' on':'')+'" '+key+'="'+c+'" style="--c:'+c+'" aria-label="'+c+'"></button>').join('')+
    '<label class="swatch custom'+(sel&&!COLORS.includes(sel.toLowerCase())?' on':'')+'" aria-label="'+esc(i18('Свой цвет'))+'"><input type="color" id="'+(none?'peColor2':'peColor')+'" value="'+hex(sel||'#2f5bea')+'"></label>';
}
function drawSwatches(){
  const D=S.D,a=$('peColors'),b=$('peColors2');
  if(a)a.innerHTML=swatchRow(D.color,'data-c',false);
  if(b)b.innerHTML=swatchRow(D.color2,'data-c2',true);
}
function segHTML(key,opts,val){return '<div class="seg full wrap" role="radiogroup" data-ek="'+key+'" style="grid-template-columns:repeat('+Math.min(opts.length,4)+',1fr)">'+opts.map(o=>'<button type="button" role="radio" data-v="'+o[0]+'" class="'+(val===o[0]?'on':'')+'" aria-checked="'+(val===o[0])+'">'+esc(i18(o[1]))+'</button>').join('')+'</div>'}
const fileBtn=(id,label,accept)=>'<label class="btn secondary small" style="margin:0;cursor:pointer">'+esc(i18(label))+'<input type="file" id="'+id+'" accept="'+accept+'" hidden></label>';
function drawEditorParts(){
  const D=S.D;
  const fr=$('peFrames');
  if(fr)fr.innerHTML=FRAMES.map(f=>{
    const ok=frameOk(f[0]);
    return '<button type="button" class="frameopt'+(D.frame===f[0]?' on':'')+(ok?'':' lk')+'" data-f="'+f[0]+'"'+(ok?'':' disabled')+' aria-label="'+esc(i18(f[1]))+'">'+avHTML({display_name:D.display||D.username,avatar_thumb:state.avatar||null,color:D.color,frame:f[0]},46,{noDot:true})+'<span class="tiny">'+esc(ok?i18(f[1]):(f[2]==='x'?i18('Эксклюзив'):i18('ранг {n}',{n:pad2(f[2]+1)})))+'</span></button>';
  }).join('');
  drawSwatches();
  const ag=$('peAvBtns');
  if(ag)ag.innerHTML='<button type="button" class="btn secondary small" onclick="openAvatar()">'+esc(i18('Изменить фото'))+'</button>'+fileBtn('peAvGif','GIF-аватар','image/gif')+(D.avatar_anim?'<button type="button" class="btn ghost small" data-del="avgif">'+esc(i18('Убрать GIF'))+'</button>':'');
  const bi=$('peBanner');
  if(bi)bi.innerHTML=segHTML('banner',[['color','Цвет'],['image','Изображение или GIF']],D.banner)+(D.banner==='image'?'<div class="row" style="gap:8px;margin-top:8px;justify-content:flex-start">'+fileBtn('peBannerFile',D.banner_image?'Заменить':'Загрузить','image/*')+(D.banner_image?'<button type="button" class="btn ghost small" data-del="banner">'+esc(i18('Убрать'))+'</button>':'')+'</div>':'');
  const dc=$('peDeco');if(dc)dc.innerHTML=segHTML('deco',DECOS,D.deco);
  const bg=$('peBg');
  if(bg)bg.innerHTML=segHTML('bg',BGS,D.bg)+(D.bg==='image'?'<div class="row" style="gap:8px;margin-top:8px;justify-content:flex-start">'+fileBtn('peBgFile',D.bg_image?'Заменить':'Загрузить','image/*')+(D.bg_image?'<button type="button" class="btn ghost small" data-del="bg">'+esc(i18('Убрать'))+'</button>':'')+'</div>':'');
  const pn=$('pePins');
  if(pn){
    const have=statsNow().medals;
    pn.innerHTML=have.length?have.map(n=>{const on=D.pinned.includes(n);return '<button type="button" class="pickbadge'+(on?' on':'')+'" data-pin="'+esc(n)+'" aria-pressed="'+on+'">'+badgeHTML(n,false)+'</button>'}).join(''):'<div class="tiny">'+esc(i18('Достижения появятся после первых выполненных задач.'))+'</div>';
  }
  const hd=$('peHide');
  if(hd)hd.innerHTML=HIDE.map(x=>'<div class="srow"><span>'+esc(i18(x[1]))+'</span>'+swHTML(x[0],D.hide.includes(x[0]))+'</div>').join('');
  const ln=$('peLinks');
  if(ln)ln.innerHTML=D.links.map((l,i)=>'<div class="lrow"><input class="field" data-li="'+i+'" data-lf="label" maxlength="24" placeholder="'+esc(i18('Название'))+'" value="'+esc(l.label)+'" aria-label="'+esc(i18('Название ссылки'))+'"><input class="field" data-li="'+i+'" data-lf="url" maxlength="200" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://" value="'+esc(l.url)+'" aria-label="URL"><button type="button" class="iconbtn" data-ldel="'+i+'" aria-label="'+esc(i18('Удалить ссылку'))+'">×</button></div>').join('')+(D.links.length<4?'<button type="button" class="btn secondary small" id="peAddLink">+ '+esc(i18('Добавить ссылку'))+'</button>':'');
}
const asc=t=>'<div class="asc-title"><span>'+esc(i18(t))+'</span></div>';
function renderEditor(){
  const box=$('peBody');if(!box)return;
  if(!S.me){box.innerHTML='<div class="empty">'+esc(S.loadErr?human(S.loadErr):i18('Загружаю профиль…'))+'</div>';return}
  if(!S.D)S.D=draftFrom(S.me);
  const D=S.D,m=S.me;
  const left=m.username_changed_at?Math.ceil((new Date(m.username_changed_at).getTime()+7*864e5-Date.now())/864e5):0;
  box.innerHTML=
   asc('01 · Аватар и баннер')+
   '<div class="row" id="peAvBtns" style="justify-content:flex-start;gap:8px;flex-wrap:wrap"></div><div class="tiny hint">'+esc(i18('GIF: до 450 КБ для аватара, до 650 КБ для баннера и фона.'))+'</div>'+
   '<div class="tiny" style="margin:16px 0 8px">'+esc(i18('Рамка аватара'))+'</div><div class="frames" id="peFrames"></div>'+
   '<div class="tiny" style="margin:16px 0 8px">'+esc(i18('Баннер'))+'</div><div id="peBanner"></div>'+
   '<div class="tiny" style="margin:16px 0 8px">'+esc(i18('Декор баннера'))+'</div><div id="peDeco"></div>'+
   asc('02 · Информация')+
   '<label for="peName" style="margin-top:0">'+esc(i18('Отображаемое имя'))+'</label><input class="field" id="peName" maxlength="18" autocomplete="off" spellcheck="false" value="'+esc(D.display)+'" placeholder="'+esc(i18('ПОЛЬЗОВАТЕЛЬ'))+'">'+
   '<label for="peUser">'+esc(i18('Имя пользователя'))+'</label><div class="atfield"><span>@</span><input class="field" id="peUser" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" value="'+esc(D.username)+'"'+(left>0?' disabled':'')+'></div><div class="tiny hint">'+esc(left>0?i18('Следующая смена имени пользователя через {n} дн.',{n:left}):i18('3–20 символов: латиница, цифры, _ и точка. Менять можно раз в 7 дней.'))+'</div>'+
   '<label for="peStatus">'+esc(i18('Статус'))+'</label><input class="field" id="peStatus" maxlength="60" autocomplete="off" value="'+esc(D.status)+'" placeholder="'+esc(i18('Чем занят сейчас'))+'">'+
   '<label for="peBio">'+esc(i18('О себе'))+'</label><textarea class="field" id="peBio" maxlength="200" rows="3" placeholder="'+esc(i18('Пара слов о вас'))+'">'+esc(D.bio)+'</textarea><div class="tiny hint" id="peBioN"></div>'+
   '<div class="tiny" style="margin:18px 0 8px">'+esc(i18('Ссылки'))+'</div><div id="peLinks"></div>'+
   asc('03 · Персонализация')+
   '<div class="tiny" style="margin-bottom:8px">'+esc(i18('Цвет профиля'))+'</div><div class="swatches" id="peColors"></div>'+
   '<div class="tiny" style="margin:16px 0 8px">'+esc(i18('Второй цвет (градиент баннера)'))+'</div><div class="swatches" id="peColors2"></div>'+
   '<div class="tiny" style="margin:16px 0 8px">'+esc(i18('Фон профиля'))+'</div><div id="peBg"></div>'+
   '<div class="tiny" style="margin:18px 0 6px">'+esc(i18('Закреплённые достижения'))+' <span id="pePinN"></span></div><div class="pickgrid" id="pePins"></div>'+
   asc('04 · Отображение')+'<p class="sub" style="margin-top:0">'+esc(i18('Скрытые элементы не видит никто, кроме вас. Это те же переключатели, что и в редакторе профиля.'))+'</p><div class="acc" id="peHide"></div>';
  drawEditorParts();drawPrev();bioCount();pinCount();updateBar();
}
const bioCount=()=>{const n=$('peBioN');if(n&&S.D)n.textContent=S.D.bio.length+' / 200'};
const pinCount=()=>{const n=$('pePinN');if(n&&S.D)n.textContent='('+S.D.pinned.length+' / 3)'};
function dirty(){if(S.D)S.D.dirty=true;updateBar();clearTimeout(prevTm);prevTm=setTimeout(drawPrev,60)}
function openEditor(){showScreen('profile')}
async function saveEditor(){
  const D=S.D;if(!D)return;
  if(D.username!==S.me.username&&!/^[A-Za-z0-9_.]{3,20}$/.test(D.username))return toast(i18(ERR.username_invalid));
  for(const l of D.links)if((l.url||l.label)&&!safeUrl(l.url))return toast(i18('Ссылка должна начинаться с http:// или https://'));
  const p={display_name:D.display,bio:D.bio,status:D.status,music_status:null,links:D.links.filter(l=>safeUrl(l.url)),
    theme:{color:D.color,color2:D.color2||null,banner:D.banner,deco:D.deco,bg:D.bg,frame:frameOk(D.frame)?D.frame:'none'},pinned:D.pinned,privacy:{hide:D.hide}};
  if(D.username!==S.me.username)p.username=D.username;
  if(D.bannerCh)p.banner_image=D.banner_image;
  if(D.bgCh)p.bg_image=D.bg_image;
  if(D.avCh){p.avatar_anim=D.avatar_anim;if(D.avFirst&&!state.avatar){p.avatar=D.avFirst.avatar;p.avatar_thumb=D.avFirst.thumb}}
  const btns=[$('peSave'),$('peSave2')].filter(Boolean);btns.forEach(b=>b.disabled=true);
  try{
    S.me=await rpc('update_profile',{p});saveCache();
    const nm=D.display||DEF_NAME;
    if(nm!==state.callsign){state.callsign=nm;save();render()}
    lastSig='';
    S.D=draftFrom(S.me);
    toast(i18('Профиль сохранён'));renderIdCard();renderEditor();
  }catch(e){toast(human(e))}
  btns.forEach(b=>b.disabled=false);
}
const readFile=f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)});
async function pickGif(kind,file){
  if(file.size>GIF_MAX[kind])return toast(i18('GIF слишком большой: не больше {n} КБ',{n:Math.round(GIF_MAX[kind]/1000)}));
  let u;try{u=await readFile(file)}catch(_){return toast(i18('Не удалось обработать изображение'))}
  if(!/^data:image\/gif;base64,R0lGOD/.test(u))return toast(i18('Это не GIF'));
  if(kind==='avatar'){
    S.D.avatar_anim=u;S.D.avCh=true;S.D.avFirst=null;
    if(!state.avatar){try{S.D.avFirst={avatar:await squareOf(u,192,.8),thumb:await squareOf(u,64,.75)}}catch(_){}}
  }else if(kind==='banner'){S.D.banner_image=u;S.D.bannerCh=true;S.D.banner='image'}
  else{S.D.bg_image=u;S.D.bgCh=true;S.D.bg='image'}
  dirty();drawEditorParts();drawPrev();
}
async function pickImage(kind,file){
  if(!file)return;
  if(file.type==='image/gif')return pickGif(kind,file);
  if(!/^image\//.test(file.type)&&!/\.(heic|heif|avif|webp|png|jpe?g)$/i.test(file.name||''))return toast(i18('Это не изображение'));
  try{
    const u=kind==='banner'?await fileToCover(file,960,320):await fileToCover(file,720,960);
    if(kind==='banner'){S.D.banner_image=u;S.D.bannerCh=true}else{S.D.bg_image=u;S.D.bgCh=true}
    dirty();drawEditorParts();drawPrev();
  }catch(_){toast(i18('Не удалось обработать изображение'))}
}

/* ---------- Owner Panel: все действия проверяются сервером (функции admin_*) ---------- */
async function ownerGuard(e){
  if(String(e&&e.message)==='forbidden'){toast(i18('Нет доступа'));showScreen('dashboard');return true}
  return false;
}
async function renderOwner(){
  const tabs=$('owTabs'),box=$('owBody');if(!tabs||!box)return;
  tabs.innerHTML=[['users','Пользователи'],['log','Журнал']].map(t=>'<button type="button" role="tab" class="frtab'+(O.tab===t[0]?' on':'')+'" aria-selected="'+(O.tab===t[0])+'" data-owtab="'+t[0]+'">'+esc(i18(t[1]))+'</button>').join('');
  if(O.tab==='users'){
    box.innerHTML='<form id="owForm" class="findform" role="search" autocomplete="off"><div class="row" style="gap:8px"><input class="field" id="owQ" maxlength="40" placeholder="'+esc(i18('FORM ID, @имя или имя'))+'" autocapitalize="off" spellcheck="false" aria-label="'+esc(i18('Поиск'))+'" value="'+esc(O.q)+'"><button class="btn" type="submit">'+esc(i18('Найти'))+'</button></div></form><div id="owList"><div class="empty">'+esc(i18('Загружаю…'))+'</div></div>';
    await loadOwnerUsers();
  }else{
    box.innerHTML='<div id="owList"><div class="empty">'+esc(i18('Загружаю…'))+'</div></div>';
    await loadOwnerLog();
  }
}
async function loadOwnerUsers(){
  const el=$('owList');if(!el)return;
  let l;try{l=await rpc('admin_users',{p_q:O.q})||[]}catch(e){if(await ownerGuard(e))return;el.innerHTML='<div class="empty">'+esc(human(e))+'</div>';return}
  el.innerHTML=l.length?'<div class="sectiontitle"><span>'+esc(i18('Пользователи'))+'</span><span>'+l.length+'</span></div>'+l.map(u=>'<div class="frow"><button type="button" class="frmain" data-ow="open" data-id="'+esc(u.id)+'">'+avHTML(u,40,{noDot:true})+'<span class="frtxt"><span class="frname"><b data-nt>'+esc(dispName(u))+'</b>'+tagsHTML(u.tags)+roleChip(u.role)+'</span><span class="tiny" data-nt>@'+esc(u.username)+' · '+esc(u.id)+'</span></span></button></div>').join(''):'<div class="empty">'+esc(i18('Никого не найдено.'))+'</div>';
}
function logLine(l){
  const d=l.data||{},tg=l.target?esc(l.target):'';
  const roleName=r=>i18(ROLE_L[r]||r);
  switch(l.action){
    case 'set_role':return i18('изменил(а) роль: {a} → {b}',{a:roleName(d.from),b:roleName(d.to)});
    case 'add_tag':return i18('выдал(а) тег «{l}»',{l:clean(d.label)});
    case 'remove_tag':return i18('снял(а) тег «{l}»',{l:clean(d.label)});
    case 'grant':return i18('выдал(а) предмет «{i}»',{i:clean(d.item)});
    case 'revoke':return i18('снял(а) предмет «{i}»',{i:clean(d.item)});
    case 'bootstrap':return i18('начальная настройка прав');
    default:return clean(l.action);
  }
}
async function loadOwnerLog(){
  const el=$('owList');if(!el)return;
  let l;try{l=await rpc('admin_log_list',{p_limit:100})||[]}catch(e){if(await ownerGuard(e))return;el.innerHTML='<div class="empty">'+esc(human(e))+'</div>';return}
  el.innerHTML=l.length?l.map(x=>'<div class="logrow"><div class="tiny" data-nt>'+esc(new Date(x.at).toLocaleString(loc()))+'</div><div data-nt>'+esc(clean(x.actor))+' → '+esc(clean(x.target))+'</div><div class="tiny" data-nt>'+esc(logLine(x))+'</div></div>').join(''):'<div class="empty">'+esc(i18('Журнал пуст.'))+'</div>';
}
const TAG_COLORS=[['','По умолчанию'],['#2f5bea','Синий'],['#c2399a','Розовый'],['#1f9d63','Зелёный'],['#e05a3a','Красный'],['#c77b00','Жёлтый']];
async function openOwnerUser(id){
  let d;try{d=await rpc('admin_user',{p_form_id:id})}catch(e){if(await ownerGuard(e))return;toast(human(e));return}
  O.cur={id,data:d};
  const u=d.user,locked=u.role==='owner'||(S.me&&u.id===S.me.id),own=u.role==='owner';
  $('modal').innerHTML='<h3 data-nt>'+esc(dispName(u))+'</h3><div class="pc-ids" style="margin:0 0 4px">'+idChip(u.id)+roleChip(u.role)+'</div>'+
    '<div class="tiny" style="margin:16px 0 6px">'+esc(i18('Роль'))+'</div><div class="seg full" role="radiogroup" style="grid-template-columns:1fr 1fr">'+['user','tester'].map(r=>'<button type="button" role="radio" data-ow="role" data-id="'+esc(u.id)+'" data-v="'+r+'" class="'+(u.role===r?'on':'')+'" aria-checked="'+(u.role===r)+'"'+(locked?' disabled':'')+'>'+esc(i18(ROLE_L[r]))+'</button>').join('')+'</div>'+
    (locked?'<div class="tiny hint">'+esc(i18(own?'Роль владельца изменить нельзя.':'Свою роль менять нельзя.'))+'</div>':'')+
    '<div class="tiny" style="margin:16px 0 6px">'+esc(i18('Теги'))+' · '+d.tags.length+' / 3</div>'+
    (d.tags.length?d.tags.map(t=>'<div class="tagrow">'+tagsHTML([t])+'<button type="button" class="iconbtn" data-ow="rmtag" data-tid="'+(+t.id)+'" aria-label="'+esc(i18('Снять тег'))+'">×</button></div>').join(''):'<div class="tiny">'+esc(i18('Тегов нет.'))+'</div>')+
    (d.tags.length<3?'<div class="tagadd"><input class="field" id="owLabel" maxlength="24" placeholder="'+esc(i18('Текст тега'))+'" autocomplete="off" aria-label="'+esc(i18('Текст тега'))+'"><div class="row" style="gap:8px;margin-top:6px"><select class="field" id="owStyle" aria-label="'+esc(i18('Оформление'))+'">'+TAG_STYLES.map(x=>'<option value="'+x[0]+'">'+esc(i18(x[1]))+'</option>').join('')+'</select><select class="field" id="owColor" aria-label="'+esc(i18('Цвет'))+'">'+TAG_COLORS.map(x=>'<option value="'+x[0]+'">'+esc(i18(x[1]))+'</option>').join('')+'</select></div><button type="button" class="btn small" style="margin-top:8px" data-ow="addtag" data-id="'+esc(u.id)+'">'+esc(i18('Выдать тег'))+'</button></div>':'')+
    '<div class="tiny" style="margin:18px 0 6px">'+esc(i18('Эксклюзивные рамки'))+'</div>'+
    (own?'<div class="tiny hint">'+esc(i18('Владельцу всё открыто автоматически.'))+'</div>':d.exclusive.map(it=>'<div class="srow"><span>'+esc(i18((FRAMES.find(f=>f[0]===it)||[0,it])[1]))+'</span><button type="button" class="sw" role="switch" aria-checked="'+d.grants.includes(it)+'" data-ow="grant" data-id="'+esc(u.id)+'" data-item="'+esc(it)+'"><i></i></button></div>').join(''))+
    '<div class="row" style="margin-top:18px"><button class="btn ghost" type="button" onclick="closeModal()">'+esc(i18('Закрыть'))+'</button></div>';
  showModal();
}
async function ownerAct(el){
  const a=el.dataset.ow,id=el.dataset.id;
  try{
    if(a==='open')return openOwnerUser(id);
    if(a==='role'){await rpc('admin_set_role',{p_form_id:id,p_role:el.dataset.v});toast(i18('Роль изменена'))}
    else if(a==='rmtag'){await rpc('admin_remove_tag',{p_tag_id:+el.dataset.tid});toast(i18('Тег снят'))}
    else if(a==='addtag'){
      const label=($('owLabel')||{}).value||'';
      if(!label.trim())return toast(i18(ERR.tag_invalid));
      await rpc('admin_add_tag',{p_form_id:id,p_label:label,p_style:$('owStyle').value,p_color:$('owColor').value||null});toast(i18('Тег выдан'));
    }
    else if(a==='grant'){const on=el.getAttribute('aria-checked')!=='true';await rpc('admin_grant',{p_form_id:id,p_item:el.dataset.item,p_on:on});toast(i18(on?'Предмет выдан':'Предмет снят'))}
    await openOwnerUser(O.cur&&O.cur.id||id);
    if(cur()==='owner'&&O.tab==='users')loadOwnerUsers();
  }catch(e){if(await ownerGuard(e))return;toast(human(e))}
}

/* ---------- события ---------- */
function onClick(e){
  const t=e.target;
  const tab=t.closest('[data-tab]');
  if(tab&&tab.closest('#friends')){S.tab=tab.dataset.tab;renderFriends();return}
  const a=t.closest('[data-act]');
  if(a&&!a.disabled){
    if(a.dataset.act==='peview'){openPreview('stranger');return}
    if(a.dataset.act==='back'){goBack();return}
    act(a.dataset.act,a.dataset.id);return;
  }
  const ow=t.closest('[data-ow]');
  if(ow&&!ow.disabled){ownerAct(ow);return}
  const owt=t.closest('[data-owtab]');
  if(owt){O.tab=owt.dataset.owtab;renderOwner();return}
  const hs=t.closest('.sw[data-hide]');
  if(hs){
    const k=hs.dataset.hide,on=hs.getAttribute('aria-checked')!=='true';
    if(hs.closest('#peHide')&&S.D){const l=S.D.hide;const i=l.indexOf(k);if(on&&i<0)l.push(k);if(!on&&i>=0)l.splice(i,1);hs.setAttribute('aria-checked',on);dirty()}
    else if(S.me){const l=((S.me.privacy||{}).hide||[]).slice();const i=l.indexOf(k);if(on&&i<0)l.push(k);if(!on&&i>=0)l.splice(i,1);setPriv({hide:l})}
    return;
  }
  const pk=t.closest('[data-pk] button[data-v]');
  if(pk&&S.me){setPriv({[pk.parentNode.dataset.pk]:pk.dataset.v});return}
  const ek=t.closest('[data-ek] button[data-v]');
  if(ek&&S.D){S.D[ek.parentNode.dataset.ek]=ek.dataset.v;dirty();drawEditorParts();return}
  const sw=t.closest('.swatch[data-c]');
  if(sw&&S.D){S.D.color=sw.dataset.c;dirty();drawEditorParts();return}
  const sw2=t.closest('.swatch[data-c2]');
  if(sw2&&S.D){S.D.color2=sw2.dataset.c2;dirty();drawEditorParts();return}
  if(t.closest('#peReset')&&S.me){S.D=draftFrom(S.me);renderEditor();return}
  const fo=t.closest('.frameopt[data-f]');
  if(fo&&S.D&&!fo.disabled){S.D.frame=fo.dataset.f;dirty();drawEditorParts();return}
  const pin=t.closest('[data-pin]');
  if(pin&&S.D){
    const n=pin.dataset.pin,l=S.D.pinned,i=l.indexOf(n);
    if(i>=0)l.splice(i,1);else if(l.length>=3)return toast(i18('Можно закрепить не больше трёх'));else l.push(n);
    dirty();drawEditorParts();pinCount();return;
  }
  const del=t.closest('[data-del]');
  if(del&&S.D){const k=del.dataset.del;if(k==='banner'){S.D.banner_image=null;S.D.bannerCh=true}else if(k==='avgif'){S.D.avatar_anim=null;S.D.avCh=true;S.D.avFirst=null}else{S.D.bg_image=null;S.D.bgCh=true}dirty();drawEditorParts();drawPrev();return}
  const ld=t.closest('[data-ldel]');
  if(ld&&S.D){S.D.links.splice(+ld.dataset.ldel,1);dirty();drawEditorParts();return}
  if(t.closest('#peAddLink')&&S.D){S.D.links.push({label:'',url:''});dirty();drawEditorParts();return}
  if(t.closest('#peSave')||t.closest('#peSave2')){saveEditor();return}
  const as=t.closest('#userPrev button[data-as]');
  if(as){openPreview(as.dataset.as);return}
  if(t.closest('#notifClear')){clearNotifs();return}
}
function onInput(e){
  const t=e.target,D=S.D;
  if(t.id==='peName'&&D){D.display=t.value.trim();dirty()}
  else if(t.id==='peUser'&&D){D.username=t.value.trim();dirty()}
  else if(t.id==='peStatus'&&D){D.status=t.value;dirty()}
  else if(t.id==='peBio'&&D){D.bio=t.value;bioCount();dirty()}
  else if(t.id==='peColor'&&D){D.color=t.value;dirty();const o=document.querySelector('#peColors .swatch.on');if(o)o.classList.remove('on')}
  else if(t.id==='peColor2'&&D){D.color2=t.value;dirty();const o=document.querySelector('#peColors2 .swatch.on');if(o)o.classList.remove('on')}
  else if(t.dataset&&t.dataset.li!=null&&D){const l=D.links[+t.dataset.li];if(l){l[t.dataset.lf]=t.value;dirty()}}
  else if(t.id==='findQ'){clearTimeout(findTm);const v=t.value;findTm=setTimeout(()=>search(v),380)}
}
function onChange(e){
  const t=e.target;
  if(t.id==='peBannerFile'){pickImage('banner',t.files&&t.files[0]);t.value=''}
  else if(t.id==='peBgFile'){pickImage('bg',t.files&&t.files[0]);t.value=''}
  else if(t.id==='peAvGif'){const f=t.files&&t.files[0];t.value='';if(f&&S.D){if(f.type!=='image/gif')toast(i18('Нужен файл GIF'));else pickGif('avatar',f)}}
}
function onSubmit(e){
  if(e.target.id==='owForm'){e.preventDefault();O.q=$('owQ').value;loadOwnerUsers();return}
  if(e.target.id==='findForm'){e.preventDefault();clearTimeout(findTm);const q=$('findQ').value;S.query=q;search(q)}
  else if(e.target.id==='blockForm'){
    e.preventDefault();
    const raw=$('blockQ').value.trim(),m=raw.match(/\d{6}/);
    if(!m)return toast(i18('Введите FORM ID вида FORM#123456'));
    const id='FORM#'+m[0];
    confirmBox('Заблокировать пользователя?',i18('{n} не сможет отправлять вам заявки и взаимодействовать с вами. Дружба и заявки будут удалены.',{n:id}),'Заблокировать',async()=>{await rpc('block_user',{p_form_id:id});toast(i18('Пользователь заблокирован'));await afterChange(id)});
  }
}
function goBack(){
  back(cur()==='privacy'||cur()==='owner'?'profile':cur()==='notifs'?'dashboard':'friends');
}
function renderAll(){
  if(cur()==='friends')renderFriends();
  if(cur()==='privacy')renderPrivacy();
  if(cur()==='notifs')drawNotifs();
  renderIdCard();badges();
}
function onScreen(id){
  if(!SUB.has(id))NAV.length=0;
  // Owner Panel: прямой переход без прав никуда не ведёт (а сервер всё равно отклонит любой запрос)
  if(id==='owner'&&!isOwner()){showScreen('dashboard');toast(i18('Нет доступа'));return}
  if(!started)return;
  if(id==='owner'){O.tab='users';O.q='';renderOwner();return}
  if(id==='friends'){renderFriends();refreshFriends().then(()=>{if(cur()==='friends')renderFriends()})}
  else if(id==='notifs'){loadNotifs(false);refreshFriends().then(()=>{if(cur()==='notifs')drawNotifs()})}
  else if(id==='privacy'){renderPrivacy();loadBlocked().then(()=>{if(cur()==='privacy')renderPrivacy()})}
  else if(id==='profile'){
    if(S.me&&(!S.D||!S.D.dirty))S.D=draftFrom(S.me);
    renderEditor();renderIdCard();renderPrivacy();
    loadBlocked().then(()=>{if(cur()==='profile')renderPrivacy()});
  }
}

/* ---------- присутствие, опрос, realtime ---------- */
let presTm=null,pollTm=null,refTm=null;
async function presence(){if(document.hidden||!navigator.onLine||!sb)return;try{await rpc('touch_presence')}catch(_){}}
function refreshSoon(){clearTimeout(refTm);refTm=setTimeout(refreshAll,500)}
async function refreshAll(){
  if(document.hidden||!navigator.onLine)return;
  await Promise.all([refreshFriends(),refreshUnread()]);
  renderAll();
}
function subscribe(){
  try{
    sb.channel('form-social-'+uid)
      .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:'user_id=eq.'+uid},refreshSoon)
      .on('postgres_changes',{event:'*',schema:'public',table:'friendships'},refreshSoon)
      .subscribe();
  }catch(_){}
}
async function start(client,user){
  if(started)return;
  sb=client;uid=user.id;started=true;
  loadCache();renderIdCard();
  try{S.me=await rpc('get_my_profile');S.loadErr=null;saveCache()}
  catch(e){S.loadErr=e;console.warn('social',e&&e.message);renderIdCard();renderAll();return}
  renderIdCard();
  await pushMine(true);
  presence();presTm=setInterval(presence,60000);
  pollTm=setInterval(refreshAll,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){presence();refreshAll()}});
  window.addEventListener('online',()=>{presence();refreshAll()});
  subscribe();
  await Promise.all([refreshFriends(),refreshUnread(),loadBlocked()]);
  if(window.FormSharedTasks)await window.FormSharedTasks.start(client,user);
  renderAll();
  // переход по ссылке на профиль (?u=123456)
  let pend=null;try{pend=sessionStorage.getItem('formOpenUser');sessionStorage.removeItem('formOpenUser')}catch(_){}
  if(pend)openUser('FORM#'+pend);
}

/* ссылка на профиль запоминается сразу: после входа адрес очищается */
(function(){
  try{
    const q=new URLSearchParams(location.search),u=(q.get('u')||'').replace(/\D/g,'');
    if(/^\d{6}$/.test(u)){
      sessionStorage.setItem('formOpenUser',u);
      q.delete('u');const s=q.toString();
      history.replaceState(null,'',location.pathname+(s?'?'+s:'')+location.hash);
    }
  }catch(_){}
})();

document.addEventListener('click',onClick);
document.addEventListener('input',onInput);
document.addEventListener('change',onChange);
document.addEventListener('submit',onSubmit);

window.FormSocial={start,touch,onScreen,go,back:goBack,openUser,openEditor,openPreview,refreshUnread,
  open:id=>go(id),get me(){return S.me},get role(){return S.me?S.me.role:'user'},
  get friends(){return friendsOnly()},avHTML,dispName,tagsHTML,ago,esc,rpc,human,hex};

(function(){
  const prev=window.formLangChanged;
  window.formLangChanged=function(c){
    if(typeof prev==='function')prev(c);
    try{
      if(typeof renderPrivacy==='function')renderPrivacy();
      if(typeof renderFriends==='function')renderFriends();
      if(typeof drawNotifs==='function')drawNotifs();
      if(S&&S.me&&typeof renderEditor==='function'){/* keep draft */}
    }catch(_){}
  };
})();
})();
