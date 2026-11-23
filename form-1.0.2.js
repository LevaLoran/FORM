/* FORM 1.0.2 — circular RPG overview. Original XP, skills and ranks stay authoritative. */
(function(){
'use strict';
if(typeof window.renderTree!=='function')return;
const old=window.renderTree;
const symbols={SOCIAL:'♡',CREATIVITY:'✦',INTELLIGENCE:'✧',TECHNICAL:'⌘',DISCIPLINE:'◎',FITNESS:'✚'};
const descriptions={SOCIAL:'Связи и общение',CREATIVITY:'Идеи и творчество',INTELLIGENCE:'Знания и мышление',TECHNICAL:'Технологии и практика',DISCIPLINE:'Привычки и фокус',FITNESS:'Движение и здоровье'};
const polar=(r,a)=>[250+r*Math.cos((a-90)*Math.PI/180),250+r*Math.sin((a-90)*Math.PI/180)];
function sector(a,b,r,R){
 const p=polar(R,a),q=polar(R,b),x=polar(r,b),y=polar(r,a);
 return 'M'+p.join(' ')+' A'+R+' '+R+' 0 0 1 '+q.join(' ')+' L'+x.join(' ')+' A'+r+' '+r+' 0 0 0 '+y.join(' ')+'Z';
}
function rate(c){return Math.min(100,Math.max(0,Math.round((state.skills[c]||0)/(tierAt[TIER_COUNT-1]+LVL_SPAN*(LVL_MAX-1))*100)))}
function build(){
 const data=treeOrder.map(c=>({id:c,p:rate(c),xp:state.skills[c]||0}));
 const total=(data.reduce((sum,c)=>sum+c.p,0)/data.length/10).toFixed(1);
 let ring='',cards='';
 data.forEach((e,i)=>{
   const a=i*60+3,b=a+54,xy=polar(172,(a+b)/2),color='var(--c-'+e.id+')';
   ring+='<g class="fw-segment" data-tree-focus="'+e.id+'" role="button" tabindex="0" aria-label="'+treeLab[e.id]+' '+e.p+' процентов" style="--fw-color:'+color+'">'+
     '<path class="fw-background" d="'+sector(a,b,121,220)+'"/>'+
     '<path class="fw-fill" d="'+sector(a,b,121,Math.max(122,121+99*e.p/100))+'"/>'+
     '<text class="fw-icon" x="'+xy[0]+'" y="'+xy[1]+'" dominant-baseline="middle" text-anchor="middle">'+symbols[e.id]+'</text></g>';
   cards+='<button type="button" class="fw-item" style="--fw-color:'+color+'" data-tree-focus="'+e.id+'">'+
      '<span class="fw-item-icon">'+symbols[e.id]+'</span><span class="fw-item-copy"><strong>'+treeLab[e.id]+'</strong><small>'+descriptions[e.id]+' · '+e.xp+' очк.</small></span>'+
      '<span class="fw-item-score">'+e.p+'% <span>›</span></span></button>';
 });
 return '<section class="fw-overview" aria-label="Баланс развития навыков">'+
   '<div class="fw-title"><div><span class="fw-kicker">FORM // RPG PROGRESSION</span><h3>Баланс развития</h3><p>Выбери направление и открой его дерево навыков.</p></div><span class="fw-badge">6 направлений</span></div>'+
   '<div class="fw-chart"><svg viewBox="0 0 500 500" role="group" aria-label="Шесть направлений развития">'+ring+
   '<circle cx="250" cy="250" r="111" class="fw-center"/>'+
   '<g class="fw-central"><text x="250" y="226" text-anchor="middle" class="fw-central-kicker">ОБЩИЙ ПРОГРЕСС</text>'+
   '<text x="250" y="265" text-anchor="middle" class="fw-central-value">'+total+'<tspan class="fw-central-max">/10</tspan></text>'+
   '<text x="250" y="289" text-anchor="middle" class="fw-central-sub">SHAPE YOURSELF</text></g></svg></div>'+
   '<div class="fw-list">'+cards+'</div><p class="fw-footnote">8 RPG-ступеней и 6 уровней внутри каждой ветки. Очки начисляются за реальные задания; прогресс сохраняется.</p></section>';
}
window.renderTree=function(){
 old();
 const root=document.getElementById('skillTree');
 if(root)root.insertAdjacentHTML('afterbegin',build());
};
function focus(el){
 const c=el.dataset.treeFocus;
 if(!treeOrder.includes(c))return;
 const vp=document.getElementById('treeVp');
 if(vp){vp.scrollIntoView({behavior:window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});}
 requestAnimationFrame(()=>{if(typeof window.treeFocus==='function')window.treeFocus(c);});
}
document.addEventListener('click',e=>{const el=e.target.closest('[data-tree-focus]');if(el)focus(el)});
document.addEventListener('keydown',e=>{
 const el=e.target.closest('[data-tree-focus]');
 if(el&&el.tagName.toLowerCase()==='g'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();focus(el)}
});
})();
