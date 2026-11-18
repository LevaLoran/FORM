/* FORM. v0.17 — экран «Настройки»: профиль, аккаунт, внешний вид, язык, данные. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let built=false;

function buildLangs(){
  const g=$('langGrid');if(!g||built||!window.FormI18n)return;
  g.innerHTML=FormI18n.LANGS.map(l=>'<button type="button" role="radio" class="lp-b" data-c="'+l[0]+'" lang="'+l[0]+'" data-nt>'+l[1]+'</button>').join('');
  g.addEventListener('click',e=>{const b=e.target.closest('.lp-b');if(!b||b.dataset.c===FormI18n.lang)return;FormI18n.setLang(b.dataset.c);renderSettings()});
  built=true;
}
function mark(box,val){
  if(!box)return;
  box.querySelectorAll('button').forEach(b=>{const on=b.dataset.v===val;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});
}
const PERIODS=[['За неделю',7],['За месяц',30],['За год',365]];
function periodStats(d){
  const c=new Date();c.setDate(c.getDate()-(d-1));
  const from=fmt(c),l=state.completed.filter(x=>x.date>=from);
  return {from,l,n:l.length,xp:l.reduce((s,x)=>s+(Number.isFinite(+x.xp)?+x.xp:0),0)};
}
function renderReset(){
  const box=$('xpResetList');if(!box)return;
  box.innerHTML=PERIODS.map(([t,d])=>{
    const s=periodStats(d);
    return '<div class="srow"><div><b>'+i18(t)+'</b><div class="tiny">'+i18('Последние {d} дн. · задач: {n} · {xp} XP',{d:d,n:s.n,xp:s.xp})+'</div></div><button type="button" class="btn secondary small" data-d="'+d+'"'+(s.n?'':' disabled')+'>'+i18('Сбросить')+'</button></div>';
  }).join('');
}
function openReset(d){
  const s=periodStats(d);if(!s.n)return;
  $('modal').innerHTML='<h3>'+i18('Сбросить XP?')+'</h3><p class="sub">'+i18('Будут удалены выполненные задачи за последние {d} дн.: {n}, всего {xp} XP. Серии, статистика и календарь пересчитаются. Полученные награды сохранятся. Сначала можно сделать экспорт в файл.',{d:d,n:s.n,xp:s.xp})+'</p><div class="row" style="margin-top:17px"><button class="btn ghost" onclick="closeModal()">'+i18('Отмена')+'</button><button class="btn" id="xpResetGo">'+i18('Сбросить')+'</button></div>';
  showModal();
  const goBtn=$('xpResetGo');
  if(goBtn)goBtn.addEventListener('click',()=>doReset(d));
}
function doReset(d){
  const s=periodStats(d);
  if(s.n){
    const ids=new Set(s.l.map(x=>x.id));
    s.l.forEach(x=>{
      const sk=skillMap[x.category]||'SOCIAL';state.skills[sk]=Math.max(0,(state.skills[sk]||0)-1);
    });
    state.completed=state.completed.filter(x=>x.date<s.from);
    state.missions.forEach(m=>{if(ids.has(m.id))m.done=false});
    state.xp=Math.max(0,state.xp-s.xp);
    state.lastRank=rankIndex(state.xp);
    save();
  }
  closeModal();render();renderSettings();
  toast(i18('Сброс выполнен · −{xp} XP',{xp:s.xp}));
}
window.renderSettings=function(){
  if(!$('settings'))return;
  buildLangs();renderReset();
  const nm=$('setName');if(nm&&document.activeElement!==nm){nm.value=(state.callsign==='ПОЛЬЗОВАТЕЛЬ')?i18('ПОЛЬЗОВАТЕЛЬ'):state.callsign}
  mark($('segTheme'),document.documentElement.dataset.theme==='dark'?'dark':'light');
  mark($('segGlass'),document.documentElement.dataset.glass==='on'?'on':'off');
  mark($('segAnim'),state.anim==='off'?'off':'on');
  mark($('segSound'),state.sound==='off'?'off':'on');
  if(window.FormI18n){
    document.querySelectorAll('#langGrid .lp-b').forEach(b=>{const on=b.dataset.c===FormI18n.lang;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});
  }
};

function applyGlass(on){
  if(on)document.documentElement.dataset.glass='on';
  else delete document.documentElement.dataset.glass;
}

function init(){
  const rl=$('xpResetList');
  if(rl)rl.addEventListener('click',e=>{const b=e.target.closest('button[data-d]');if(b&&!b.disabled)openReset(+b.dataset.d)});
  const nm=$('setName');
  if(nm){
    const commit=()=>{
      let v=nm.value.trim().slice(0,18);
      const dflt=i18('ПОЛЬЗОВАТЕЛЬ');
      if(!v||v===dflt)v='ПОЛЬЗОВАТЕЛЬ';
      if(v===state.callsign)return;
      state.callsign=v;save();render();toast(i18('Имя сохранено'));
    };
    nm.addEventListener('change',commit);
    nm.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();nm.blur()}});
  }
  const st=$('segTheme');
  if(st)st.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    applyTheme(b.dataset.v);state.theme=b.dataset.v;save();renderSettings();
  });
  const sg=$('segGlass');
  if(sg)sg.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const on=b.dataset.v==='on';
    applyGlass(on);
    if(on)state.glass='on';else delete state.glass;
    save();renderSettings();
  });
  const ss=$('segSound');
  if(ss)ss.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const on=b.dataset.v==='on';
    if(on)delete state.sound;else state.sound='off';
    save();renderSettings();
    if(on&&window.fxSound)fxSound('win');
  });
  const sa=$('segAnim');
  if(sa)sa.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const on=b.dataset.v==='on';applyAnim(on);
    if(on)delete state.anim;else state.anim='off';
    save();renderSettings();
  });
  // restore glass on load
  if(state.glass==='on')applyGlass(true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();
