/* FORM. v0.12 — экран «Настройки»: профиль, аккаунт, внешний вид, язык, данные.
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
window.renderSettings=function(){
  if(!$('settings'))return;
  buildLangs();
  const nm=$('setName');if(nm&&document.activeElement!==nm){nm.value=(state.callsign==='ПОЛЬЗОВАТЕЛЬ')?i18('ПОЛЬЗОВАТЕЛЬ'):state.callsign}
  mark($('segTheme'),document.documentElement.dataset.theme==='dark'?'dark':'light');
  mark($('segAnim'),state.anim==='off'?'off':'on');
  mark($('segSound'),state.sound==='off'?'off':'on');
  document.querySelectorAll('#langGrid .lp-b').forEach(b=>{const on=b.dataset.c===FormI18n.lang;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});
};

function init(){
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
