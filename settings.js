/* FORM. v0.13 — экран «Настройки»: профиль, аккаунт, внешний вид, язык, данные.
   Тема, язык и анимации входят в данные аккаунта и синхронизируются между устройствами. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let built=false;

function buildLangs(){
  const g=$('langGrid');if(!g||built)return;
  g.innerHTML=FormI18n.LANGS.map(l=>'<button type="button" role="radio" class="lp-b" data-c="'+l[0]+'" lang="'+l[0]+'" data-nt>'+l[1]+'</button>').join('');
  g.addEventListener('click',e=>{const b=e.target.closest('.lp-b');if(!b||b.dataset.c===FormI18n.lang)return;FormI18n.setLang(b.dataset.c);renderSettings()});
  built=true;
}
function mark(box,val){
  box.querySelectorAll('button').forEach(b=>{const on=b.dataset.v===val;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});
}
/* ---------- сброс XP за период (последние 7 / 30 / 365 дней, включая сегодня) ---------- */
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
  $('xpResetGo').addEventListener('click',()=>doReset(d));
}
function doReset(d){
  const s=periodStats(d);
  if(s.n){
    const ids=new Set(s.l.map(x=>x.id));
    s.l.forEach(x=>{
      const sk=skillMap[x.category]||'SOCIAL';state.skills[sk]=Math.max(0,(state.skills[sk]||0)-1);
    });
    state.completed=state.completed.filter(x=>x.date<s.from);
    state.missions.forEach(m=>{if(ids.has(m.id))m.done=false}); // выполненные в этот период задачи снова невыполнены
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
  mark($('segAnim'),state.anim==='off'?'off':'on');
  mark($('segSound'),state.sound==='off'?'off':'on');
  document.querySelectorAll('#langGrid .lp-b').forEach(b=>{const on=b.dataset.c===FormI18n.lang;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});
};

function init(){
  const rl=$('xpResetList');
  if(rl)rl.addEventListener('click',e=>{const b=e.target.closest('button[data-d]');if(b&&!b.disabled)openReset(+b.dataset.d)});
  const nm=$('setName');
  if(nm){
    const commit=()=>{
      let v=nm.value.trim().slice(0,18);
      const dflt=i18('ПОЛЬЗОВАТЕЛЬ');
      if(!v||v===dflt)v='ПОЛЬЗОВАТЕЛЬ'; // стандартное имя хранится в исходном виде и переводится при показе
      if(v===state.callsign)return;
      state.callsign=v;save();render();toast('Имя сохранено');
    };
    nm.addEventListener('change',commit);
    nm.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();nm.blur()}});
  }
  $('segTheme').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    applyTheme(b.dataset.v);state.theme=b.dataset.v;save();renderSettings();
  });
  $('segSound').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const on=b.dataset.v==='on';
    if(on)delete state.sound;else state.sound='off';
    save();renderSettings();
    if(on&&window.fxSound)fxSound('win'); // короткий пример при включении
  });
  $('segAnim').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const on=b.dataset.v==='on';applyAnim(on);
    if(on)delete state.anim;else state.anim='off';
    save();renderSettings();
  });
}
init();
})();
