/* FORM. v0.16 — оболочка интерфейса в духе Spotify: чипы разделов сверху, мини-панель прогресса,
   ASCII-элементы. Логику приложения не трогает: только отображение. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const RM=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);
const asciiBar=(p,n)=>{n=n||16;const f=Math.round(Math.max(0,Math.min(100,p))/100*n);return '['+'█'.repeat(f)+'░'.repeat(n-f)+']'};
function greeting(){const h=new Date().getHours();return h<5?'Доброй ночи':h<12?'Доброе утро':h<18?'Добрый день':'Добрый вечер'}

/* прогресс: мини-панель внизу, ASCII-полоса на главной, приветствие */
function sync(r){
  try{
    r=r||rankProgress();
    const mn=$('miniName');if(mn)mn.textContent=i18(rankNames[r.i])+' · '+String(r.i+1).padStart(2,'0');
    const mc=$('miniCrest');if(mc)mc.innerHTML=crest(r.i);
    const mf=$('miniFill');if(mf)mf.style.width=r.pct+'%';
    const ma=$('miniAscii');if(ma)ma.textContent=asciiBar(r.pct,12)+' '+Math.round(r.pct)+'%';
    const xa=$('xpAscii');if(xa)xa.textContent=asciiBar(r.pct,24);
    const hh=$('homeHead');if(hh){const g=greeting();if(hh.dataset.g!==g+loc()){hh.dataset.g=g+loc();hh.textContent=i18(g)}}
  }catch(_){}
}

/* активный раздел: подсветка чипа и прокрутка к нему */
function onScreen(id){
  document.documentElement.dataset.screen=id;
  const sc=$('chips');
  document.querySelectorAll('#chips button').forEach(b=>{
    const on=b.dataset.screen===id;
    b.classList.toggle('on',on);
    b.setAttribute('aria-selected',String(on));
    // Прокручиваем только горизонтальную ленту чипов.
    // scrollIntoView() мог одновременно сдвигать всю страницу по вертикали.
    if(on&&sc){
      const br=b.getBoundingClientRect(),sr=sc.getBoundingClientRect();
      const left=sc.scrollLeft+(br.left-sr.left)-(sc.clientWidth-b.offsetWidth)/2;
      sc.scrollTo({left:Math.max(0,left),behavior:RM()?'auto':'smooth'});
    }
  });
  const h=$('hdr');
  if(h)h.classList.remove('compact');
  // Синхронизируем направление прокрутки после смены экрана,
  // чтобы старое значение не сворачивало шапку повторно.
  lastY=window.scrollY||0;
}

/* на телефоне верхняя строка шапки уходит при прокрутке вниз, чипы остаются */
let lastY=0,tick=false;
addEventListener('scroll',()=>{
  if(tick)return;tick=true;
  requestAnimationFrame(()=>{
    tick=false;
    const y=scrollY,h=$('hdr');if(!h)return;
    if(y>70&&y>lastY+4)h.classList.add('compact');
    else if(y<lastY-4||y<24)h.classList.remove('compact');
    lastY=y;
  });
},{passive:true});

window.FormUI={sync,onScreen,asciiBar};
try{sync();const a=document.querySelector('.screen.active');onScreen(a?a.id:'dashboard')}catch(_){}
})();
