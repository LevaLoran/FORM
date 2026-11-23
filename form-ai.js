/* FORM 1.1.0 / FORM AI BETA — local guide and non-blocking UI.
   No AI secrets or personal data are sent to any external provider.
   Generative chat needs an authenticated server-side API; see FORM_AI_BETA.md. */
(function(){
'use strict';
const IDEAS=[
 {title:'Прочитать 10 страниц',category:'EDUCATION',desc:'Образование'},
 {title:'Разобрать одну учебную задачу',category:'PRODUCTIVITY',desc:'Продуктивность'},
 {title:'Продвинуть личный проект на один шаг',category:'CREATIVE',desc:'Творчество'},
 {title:'Выйти на небольшую прогулку',category:'FITNESS',desc:'Активность'},
 {title:'Навести порядок на рабочем месте',category:'PERSONAL',desc:'Личное'},
 {title:'Выделить время на спокойный отдых',category:'HEALTH',desc:'Здоровье'},
 {title:'Изучить новую тему за 15 минут',category:'EDUCATION',desc:'Образование'},
 {title:'Написать другу и узнать, как дела',category:'PERSONAL',desc:'Личное'}
];
const LABELS={idle:'ОЖИДАНИЕ',happy:'РАДОСТЬ',thinking:'ДУМАЮ',talking:'ОТВЕТ',surprised:'УДИВЛЕНИЕ',sleep:'ОТДЫХ',celebration:'НОВЫЙ УРОВЕНЬ'};
const STATES=new Set(Object.keys(LABELS));
let root, launch, panel, mini, full, status, input, log, opened=false, stateName='idle';
let reactionTimeout=0, sleepTimeout=0, ideaOffset=0, processing=false, observer;
const $=(id)=>document.getElementById(id);
function readProgress(){
  try{
    if(typeof state==='undefined'||!state||!Array.isArray(state.missions))return {name:'',all:[],completed:[],xp:0};
    const now=typeof today==='function'?today():new Date().toISOString().slice(0,10);
    return {name:String(state.callsign||'').trim().slice(0,40),all:state.missions.filter(x=>x.created===now),completed:state.missions.filter(x=>x.created===now&&x.done),xp:Math.max(0,Number(state.xp)||0)};
  }catch(_){return {name:'',all:[],completed:[],xp:0}}
}
function stopTimeouts(){clearTimeout(reactionTimeout);clearTimeout(sleepTimeout)}
function updateState(name){
  if(!STATES.has(name))name='idle';
  stateName=name;
  [mini,full].forEach(el=>{if(el)el.dataset.state=name});
  if(status)status.textContent=LABELS[name];
}
function setState(name,duration=0){
  clearTimeout(reactionTimeout);
  updateState(name);
  if(duration>0)reactionTimeout=setTimeout(()=>{updateState('idle');scheduleSleep()},duration);
  else if(name==='idle')scheduleSleep();
}
function scheduleSleep(){
  clearTimeout(sleepTimeout);
  if(!opened||stateName!=='idle')return;
  // One delayed transition, no polling or animation frame loops.
  sleepTimeout=setTimeout(()=>{if(opened&&stateName==='idle')updateState('sleep')},90000);
}
function wake(){
  if(stateName==='sleep')setState('surprised',700);
  else if(stateName==='idle')scheduleSleep();
}
function appendMessage(message,who='bot'){
  const n=document.createElement('div');n.className='fai-message '+(who==='user'?'fai-user':'fai-bot');
  n.textContent=String(message).slice(0,4000);log.append(n);log.scrollTop=log.scrollHeight;
  // Never leave an unbounded amount of dialogue in the DOM.
  while(log.children.length>45)log.firstElementChild.remove();
  return n;
}
function ideas(count=3){
  const p=readProgress();const used=new Set(p.all.map(m=>String(m.title||'').toLocaleLowerCase()));
  const list=IDEAS.filter(x=>!used.has(x.title.toLocaleLowerCase()));
  if(!list.length)return [];
  const n=ideaOffset++%list.length;
  return list.slice(n).concat(list.slice(0,n)).slice(0,count);
}
function addIdeaCard(message,idea){
  const box=document.createElement('div');box.className='fai-suggestion';
  const type=document.createElement('span');type.textContent=idea.desc;
  const title=document.createElement('strong');title.textContent=idea.title;
  const btn=document.createElement('button');btn.type='button';btn.textContent='Создать задание +';
  btn.addEventListener('click',()=>{wake();createTask(idea)});
  box.append(type,title,btn);message.append(box);
}
function createTask(idea){
  if(typeof openMission!=='function')return appendMessage('Редактор заданий пока недоступен.');
  close();
  openMission();
  const title=$('mTitle'),category=$('mCategory'),repeat=$('mRepeat');
  if(title){title.value=idea.title;title.focus()}
  if(category&&Array.from(category.options).some(x=>x.value===idea.category))category.value=idea.category;
  if(repeat)repeat.value='once';
  // Saving remains under user control via the existing FORM editor.
}
function summary(){
  const p=readProgress();
  const left=p.all.filter(x=>!x.done);
  if(!p.all.length)return 'На сегодня задач ещё нет. Можем подобрать первую — без лишней спешки.';
  return `Сегодня выполнено ${p.completed.length} из ${p.all.length} задач. XP: ${p.xp}. `+
    (left.length?`Следующая невыполненная задача: «${String(left[0].title||'задача').slice(0,70)}».`:'Все запланированные задачи выполнены. Можно отдохнуть.');
}
function answer(text){
  const v=String(text).toLowerCase();
  const p=readProgress();
  if(/привет|здравств|хай|hello|hi\b/.test(v))return {body:'Привет! Я FORM AI BETA — твой локальный проводник. Помогу найти подходящее занятие, посмотреть прогресс или подготовить новое задание.'};
  if(/спасибо|благодар/.test(v))return {body:'Рад помочь. Твой темп — твой выбор.'};
  if(/план|расписан|организ|с чего начать/.test(v)){
    const remaining=p.all.filter(x=>!x.done).slice(0,3);
    return {body:remaining.length?
      'Небольшой план на сегодня:\n'+remaining.map((m,i)=>`${i+1}. ${String(m.title||'Задача').slice(0,70)}`).join('\n')+'\nПосле каждого шага можно сделать перерыв.':
      'Предлагаю простой план: выбери одно короткое дело, выполни его в удобном темпе, затем отдохни. Ниже — идея для первого шага.',ideas:remaining.length?[]:ideas(1)};
  }
  if(/прогресс|статист|сколько|xp|задач|дела|успех/.test(v))return {body:summary()};
  if(/устал|отдых|пауза|сон|нет сил|выгор/.test(v))return {body:'Можно выбрать небольшое спокойное занятие или сделать паузу. Отдых не нужно заслуживать выполненными задачами.',ideas:[IDEAS[5]]};
  if(/иде|посовет|рекомен|заняти|что делать|скучно|предлож|начать|задач/.test(v))return {body:'Вот несколько вариантов. Выбирай то, что подходит твоему настроению и времени:',ideas:ideas(3)};
  if(/кто ты|как работа|нейросет|ai|ии\b/.test(v))return {body:'Я FORM AI BETA. Сейчас я работаю локально: анализирую только доступные в FORM задачи и отвечаю по встроенным правилам. Генеративная нейросеть ещё не подключена; твои сообщения никуда не отправляются.'};
  return {body:'Пока я умею подбирать занятия, помогать с небольшим планом и показывать прогресс FORM. Попробуй спросить: «Что мне сегодня сделать?» или «Покажи прогресс». Для свободных ответов на любые темы потребуется подключение AI API.'};
}
function reply(text){
  if(processing)return;
  const msg=String(text||'').trim().slice(0,500);if(!msg)return;
  appendMessage(msg,'user');processing=true;input.disabled=true;setState('thinking');
  // Short, finite state transition to show the layered Thinking -> Talking rig.
  reactionTimeout=setTimeout(()=>{
    let res;
    try{res=answer(msg)}catch(_){res={body:'Не получилось составить совет. Попробуй ещё раз.'}}
    const bubble=appendMessage(res.body);
    (res.ideas||[]).forEach(x=>addIdeaCard(bubble,x));
    input.disabled=false;processing=false;setState('talking',2400);
    if(opened)input.focus({preventScroll:true});
  },350);
}
function quick(action){
  if(processing)return;
  wake();
  const actions={ideas:'Посоветуй занятие',progress:'Покажи мой прогресс',plan:'Составь план на день'};
  if(action==='new'){createTask({title:'',category:'PRODUCTIVITY'});return}
  if(actions[action])reply(actions[action]);
}
function open(){
  if(!panel||document.documentElement.dataset.auth!=='in')return;
  opened=true;panel.hidden=false;launch.hidden=true;
  panel.setAttribute('aria-hidden','false');
  if(!log.childElementCount){const p=readProgress();appendMessage(`Привет${p.name&&p.name!=='ПОЛЬЗОВАТЕЛЬ'?', '+p.name:''}! Я FORM AI — твой проводник. Помогу выбрать занятие, составить план и развиваться в FORM.`)}
  setState('happy',1100);
  input.focus({preventScroll:true});
  refreshVisibility();
}
function close(){
  if(!panel)return;
  opened=false;panel.hidden=true;panel.setAttribute('aria-hidden','true');launch.hidden=false;
  clearTimeout(sleepTimeout);updateState('idle');refreshVisibility();
  launch.focus({preventScroll:true});
}
function refreshVisibility(){
  const hidden=document.hidden;
  if(mini)mini.classList.toggle('is-paused',hidden||opened);
  if(full)full.classList.toggle('is-paused',hidden||!opened);
}
function init(){
  if(!window.FormAICharacter||$('formAI'))return;
  root=document.createElement('div');root.id='formAI';root.className='fai-root';
  root.innerHTML=`<button id="faiLaunch" class="fai-launch" type="button" aria-haspopup="dialog" aria-controls="faiPanel" aria-label="Открыть FORM AI BETA">
      <span class="fai-character" data-state="idle" id="faiMini">${window.FormAICharacter('fm-ai-mini')}</span><span class="fai-betatab">AI BETA</span></button>
    <section id="faiPanel" class="fai-panel" role="dialog" aria-label="FORM AI BETA — цифровой проводник" aria-hidden="true" hidden>
      <div class="fai-headbar"><div><div class="fai-kicker">YOUR PERSONAL GUIDE</div><div class="fai-heading">FORM AI <b>BETA</b></div></div><button class="fai-close" id="faiClose" type="button" aria-label="Свернуть помощника">×</button></div>
      <div class="fai-stage"><div class="fai-character" id="faiFull" data-state="idle">${window.FormAICharacter('fm-ai-full')}</div><div class="fai-statetext" id="faiStatus">ОЖИДАНИЕ</div><span class="fai-state-dot" aria-hidden="true"></span></div>
      <p class="fai-intro">Твой цифровой проводник. Советы по реальным задачам FORM, без лишних уведомлений.</p>
      <div class="fai-quick"><button data-fai-quick="ideas" type="button">✦ Идеи</button><button data-fai-quick="progress" type="button">◉ Прогресс</button><button data-fai-quick="plan" type="button">☰ План</button><button data-fai-quick="new" type="button">＋ Задание</button></div>
      <div id="faiLog" class="fai-log" role="log" aria-label="Диалог с помощником" aria-live="polite" aria-relevant="additions text"></div>
      <form id="faiForm" class="fai-form"><input id="faiInput" type="text" maxlength="500" placeholder="Спроси FORM AI..." aria-label="Сообщение помощнику" autocomplete="off"><button type="submit" aria-label="Отправить сообщение">➤</button></form>
      <div class="fai-foot">Локальный режим · AI API не подключён · сообщения не передаются</div>
    </section>`;
  document.body.append(root);
  launch=$('faiLaunch');panel=$('faiPanel');mini=$('faiMini');full=$('faiFull');status=$('faiStatus');input=$('faiInput');log=$('faiLog');
  launch.addEventListener('click',open);$('faiClose').addEventListener('click',close);
  $('faiForm').addEventListener('submit',e=>{e.preventDefault();const val=input.value;input.value='';reply(val)});
  panel.addEventListener('click',e=>{const btn=e.target.closest('[data-fai-quick]');if(btn)quick(btn.dataset.faiQuick);else wake()});
  document.addEventListener('keydown',e=>{if(opened&&e.key==='Escape'){e.stopPropagation();close()}});
  document.addEventListener('visibilitychange',refreshVisibility);
  if('IntersectionObserver' in window){
    observer=new IntersectionObserver(entries=>entries.forEach(e=>{e.target.classList.toggle('is-paused',document.hidden||!e.isIntersecting)}),{threshold:0.01});
    observer.observe(mini);observer.observe(full);
  }
  refreshVisibility();
}
window.FormAI={
 open,close,
 react(name){if(!STATES.has(name))return;clearTimeout(sleepTimeout);setState(name,name==='celebration'?2100:1350)},
 setState(name){setState(name)},
 getState(){return stateName},
 suggest(){return ideas()},
 version:'1.1.0-beta',
 get hasGenerativeAPI(){return false}
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
