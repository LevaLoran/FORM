/* FORM. v0.11 — локализация (12 языков).
   Исходный язык интерфейса — русский: ключом словаря служит русская строка. Цепочка запасных вариантов: язык → English → русский.
   Статические тексты переводятся автоматически (текстовые узлы и атрибуты placeholder / title / aria-label / alt),
   составные фразы собираются через t('Шаблон {x}',{x}). Пользовательские данные (названия задач и т. д.) не переводятся. */
(function(){
'use strict';
const LANGS=[
  ['ru','Русский','ru-RU'],['en','English','en-US'],['es','Español','es-ES'],['de','Deutsch','de-DE'],
  ['fr','Français','fr-FR'],['it','Italiano','it-IT'],['pt','Português','pt-BR'],['pl','Polski','pl-PL'],
  ['tr','Türkçe','tr-TR'],['uk','Українська','uk-UA'],['zh','中文','zh-CN'],['ja','日本語','ja-JP']
];
const CODES=LANGS.map(l=>l[0]);
let lang='ru';
const DICT=()=>window.FORM_I18N||{};
const norm=s=>String(s).replace(/\s+/g,' ').trim();

function lookup(k){
  if(lang==='ru')return null;
  const d=DICT(),a=d[lang],e=d.en;
  if(a&&Object.prototype.hasOwnProperty.call(a,k))return a[k];
  if(e&&Object.prototype.hasOwnProperty.call(e,k))return e[k];
  return null;
}
const tr=s=>{const v=lookup(norm(s));return v==null?s:v}; // перевод значения-параметра
function t(k,p){
  const v=lookup(k);let s=v==null?k:v;
  if(p)s=s.replace(/\{(\w+)\}/g,(m,n)=>(n in p)?tr(p[n]):m);
  return s;
}

/* ---------- перевод DOM ---------- */
const ORIG=new WeakMap(),ATTR=new WeakMap(),ATTRS=['placeholder','title','aria-label','alt'];
const skip=n=>{const p=n.nodeType===3?n.parentNode:n;return !p||!p.closest||!!p.closest('script,style,textarea,[data-nt],.missiontitle')};
function text(n){
  if(skip(n))return;
  let o=ORIG.get(n);const cur=n.nodeValue;
  if(!o||cur!==o.out){o={src:cur,out:cur};ORIG.set(n,o)}      // приложение записало новый текст: это новый оригинал
  const m=/^(\s*)([\s\S]*?)(\s*)$/.exec(o.src),v=m[2]?lookup(norm(m[2])):null;
  const out=v==null?o.src:m[1]+v+m[3];
  if(out!==cur)n.nodeValue=out;
  o.out=out;
}
function attrs(el){
  if(skip(el))return;
  let rec=ATTR.get(el);if(!rec){rec={};ATTR.set(el,rec)}
  ATTRS.forEach(a=>{
    if(!el.hasAttribute(a))return;
    const cur=el.getAttribute(a);let o=rec[a];
    if(!o||cur!==o.out){o={src:cur,out:cur};rec[a]=o}
    const v=lookup(norm(o.src)),out=v==null?o.src:v;
    if(out!==cur)el.setAttribute(a,out);
    o.out=out;
  });
}
function walk(root){
  if(!root)return;
  if(root.nodeType===3)return text(root);
  if(root.nodeType!==1)return;
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
  while((n=w.nextNode()))text(n);
  if(root.matches&&root.matches('[placeholder],[title],[aria-label],[alt]'))attrs(root);
  root.querySelectorAll&&root.querySelectorAll('[placeholder],[title],[aria-label],[alt]').forEach(attrs);
}
let mo=null;
function observe(){
  if(mo||!document.body||!window.MutationObserver)return;
  mo=new MutationObserver(list=>{
    if(lang==='ru'&&!window.__i18nSeen)return;
    for(const m of list){
      if(m.type==='characterData')text(m.target);
      else if(m.type==='attributes')attrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  mo.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS});
}
function retranslate(){
  window.__i18nSeen=true;
  walk(document.body);
  document.documentElement.lang=lang;
  const m=document.querySelector('meta[name="description"]');if(m&&lang!=='ru'){/* описание остаётся английским */}
}

/* ---------- выбор языка ---------- */
function detect(){
  const l=(navigator.languages&&navigator.languages[0]||navigator.language||'en').toLowerCase().slice(0,2);
  return CODES.includes(l)?l:'en';
}
function setLang(c,o){
  if(!CODES.includes(c))c='en';
  lang=c;
  try{localStorage.setItem('formLang',c)}catch(_){}
  retranslate();
  if(!(o&&o.silent)&&typeof window.formLangChanged==='function')window.formLangChanged(c);
}
function pick(onDone){
  if(document.getElementById('langPick'))return;
  const sel0=detect();let sel=sel0;
  const el=document.createElement('div');el.id='langPick';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-labelledby','lpT');
  el.innerHTML='<div class="lp-box"><div class="lp-brand">FORM<em>.</em></div><h2 id="lpT" data-nt>Choose your language</h2><div class="lp-grid" role="radiogroup">'+
    LANGS.map(l=>'<button type="button" role="radio" class="lp-b" data-c="'+l[0]+'" data-nt lang="'+l[0]+'">'+l[1]+'</button>').join('')+
    '</div><button type="button" class="btn primary block" id="lpGo" data-nt></button></div>';
  document.body.appendChild(el);
  const go=el.querySelector('#lpGo'),ttl=el.querySelector('#lpT');
  const mark=()=>{
    el.querySelectorAll('.lp-b').forEach(b=>{const on=b.dataset.c===sel;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});
    const keep=lang;lang=sel;go.textContent=t('Продолжить');ttl.textContent=sel==='ru'?'Выберите язык':t('Выберите язык');lang=keep;
  };
  el.querySelector('.lp-grid').addEventListener('click',e=>{const b=e.target.closest('.lp-b');if(!b)return;sel=b.dataset.c;mark()});
  go.addEventListener('click',()=>{el.remove();setLang(sel);if(onDone)onDone(sel)});
  mark();
  const b=el.querySelector('.lp-b.on');if(b)b.focus();
}
function init(){
  let saved=null;try{saved=localStorage.getItem('formLang')}catch(_){}
  observe();
  if(saved&&CODES.includes(saved)){lang=saved;if(saved!=='ru')retranslate();else document.documentElement.lang='ru'}
  else{lang='ru';document.documentElement.lang='ru';pick()}
}

window.FormI18n={
  LANGS,t,setLang,pick,init,
  get lang(){return lang},
  locale(){const l=LANGS.find(x=>x[0]===lang);return l?l[2]:'ru-RU'},
  tr
};
window.t=t;window.i18=t;
init();
})();
