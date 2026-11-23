/* FORM 1.1.1 / Formik: private, local activity guide. No generative AI or chat. */
(function () {
'use strict';
const I18N = {
 ru:['Формик','Твой помощник в FORM','Что тебя интересует?','Для тебя','Что сделать дальше?','Мой прогресс','План на сегодня','Подбери занятие','Хочу отдохнуть','Создать задание','Открыть задания','Добавить в задания','Ещё идеи','Сегодня выполнено: {done} из {total}.','Текущие XP: {xp}.','На сегодня ещё нет задач. Можно начать с небольшой идеи.','Все задания на сегодня выполнены. Можешь отдохнуть.','Начни с этого задания: {title}','Давай выберем до трёх небольших шагов.','Отдых — тоже часть прогресса. Не обязательно постоянно быть продуктивным.','Идеи подобраны по твоим заданиям и занятиям в FORM.','Пока мало данных: вот несколько разных занятий на выбор.','Не удалось открыть редактор заданий.','Ожидание','Радость','Размышление','Разговор','Удивление','Отдых','Праздник','Закрыть Formik','Открыть Formik','Пока ничего не выбрано. Нажми на интересующий вопрос.','Осталось на сегодня: {count}','Рекомендации обрабатываются локально на устройстве','Привет, {name}! Чем займёмся?','Продолжить задачу','Сделать паузу'],
 en:['Formik','Your FORM companion','What would you like to explore?','Picked for you','What should I do next?','My progress','Plan my day','Suggest an activity','I need a break','Create a task','Open tasks','Add as a task','More ideas','Completed today: {done} of {total}.','Current XP: {xp}.','No tasks yet today. You can start with one small idea.','All tasks for today are complete. A break is fine.','Start with this task: {title}','Choose up to three small steps for today.','Rest is part of progress, too. You do not have to be productive all the time.','Suggestions are based on your activities and tasks in FORM.','Not much history yet — try one of these varied activities.','Could not open the task editor.','Idle','Happy','Thinking','Talking','Surprised','Rest','Celebration','Close Formik','Open Formik','Choose a question to get started.','Still to do today: {count}','Recommendations run locally on your device','Hi, {name}! What shall we do?','Continue task','Take a break'],
 es:['Formik','Tu compañero en FORM','¿Qué te interesa?','Para ti','¿Qué hago ahora?','Mi progreso','Plan de hoy','Sugiere una actividad','Necesito descansar','Crear tarea','Abrir tareas','Añadir tarea','Más ideas','Hoy completadas: {done} de {total}.','XP actual: {xp}.','Aún no hay tareas para hoy. Empieza con algo pequeño.','¡Todo listo por hoy! Puedes descansar.','Empieza por esta tarea: {title}','Elige hasta tres pasos pequeños.','Descansar también es progresar.','Ideas basadas en tus tareas y actividades de FORM.','Aún hay pocos datos; prueba estas actividades.','No se pudo abrir el editor.','Espera','Alegría','Pensando','Hablando','Sorpresa','Descanso','Celebración','Cerrar Formik','Abrir Formik','Elige una pregunta para empezar.','Pendientes hoy: {count}','Las recomendaciones se crean en tu dispositivo','¡Hola, {name}! ¿Qué hacemos?','Continuar tarea','Tomar un descanso'],
 de:['Formik','Dein Begleiter in FORM','Was interessiert dich?','Für dich','Was mache ich als Nächstes?','Mein Fortschritt','Tagesplan','Aktivität vorschlagen','Ich brauche eine Pause','Aufgabe erstellen','Aufgaben öffnen','Als Aufgabe hinzufügen','Mehr Ideen','Heute erledigt: {done} von {total}.','Aktuelle XP: {xp}.','Heute noch keine Aufgaben. Beginne mit etwas Kleinem.','Alles für heute erledigt. Du kannst dich ausruhen.','Starte mit dieser Aufgabe: {title}','Wähle bis zu drei kleine Schritte.','Erholung gehört zum Fortschritt.','Ideen basieren auf deinen FORM-Aufgaben.','Noch wenig Daten – hier sind einige Ideen.','Aufgabeneditor konnte nicht geöffnet werden.','Warten','Freude','Denken','Sprechen','Überrascht','Ruhe','Feier','Formik schließen','Formik öffnen','Wähle zum Start eine Frage.','Heute offen: {count}','Empfehlungen bleiben auf deinem Gerät','Hallo, {name}! Was machen wir?','Aufgabe fortsetzen','Pause machen'],
 fr:['Formik','Ton compagnon FORM','Qu’est-ce qui t’intéresse ?','Pour toi','Que faire ensuite ?','Ma progression','Plan du jour','Propose une activité','J’ai besoin d’une pause','Créer une tâche','Ouvrir les tâches','Ajouter une tâche','Plus d’idées','Fait aujourd’hui : {done} sur {total}.','XP actuels : {xp}.','Aucune tâche aujourd’hui. Commence petit.','Tout est terminé pour aujourd’hui. Repose-toi.','Commence par : {title}','Choisis jusqu’à trois petites étapes.','Se reposer fait aussi partie du progrès.','Idées basées sur tes activités FORM.','Peu de données pour le moment, voici quelques idées.','Impossible d’ouvrir l’éditeur.','Attente','Joie','Réflexion','Parole','Surprise','Repos','Fête','Fermer Formik','Ouvrir Formik','Choisis une question pour commencer.','À faire aujourd’hui : {count}','Les recommandations restent sur ton appareil','Salut {name} ! Que fait-on ?','Continuer la tâche','Faire une pause'],
 it:['Formik','Il tuo compagno FORM','Cosa ti interessa?','Per te','Cosa faccio adesso?','I miei progressi','Piano di oggi','Suggerisci un’attività','Ho bisogno di riposo','Crea attività','Apri attività','Aggiungi attività','Altre idee','Completate oggi: {done} di {total}.','XP attuali: {xp}.','Nessuna attività oggi. Inizia con poco.','Tutto completato! Puoi riposarti.','Inizia con: {title}','Scegli fino a tre piccoli passi.','Il riposo fa parte dei progressi.','Idee basate sulle tue attività FORM.','Pochi dati per ora: prova una di queste idee.','Impossibile aprire l’editor.','Attesa','Gioia','Pensiero','Parlando','Sorpresa','Riposo','Festa','Chiudi Formik','Apri Formik','Scegli una domanda per iniziare.','Da fare oggi: {count}','Consigli elaborati sul tuo dispositivo','Ciao, {name}! Cosa facciamo?','Continua attività','Fai una pausa'],
 pt:['Formik','Seu companheiro FORM','O que te interessa?','Para você','O que faço agora?','Meu progresso','Plano de hoje','Sugira uma atividade','Preciso descansar','Criar tarefa','Abrir tarefas','Adicionar tarefa','Mais ideias','Concluídas hoje: {done} de {total}.','XP atual: {xp}.','Ainda sem tarefas hoje. Comece com algo pequeno.','Tudo concluído! Pode descansar.','Comece por esta tarefa: {title}','Escolha até três passos pequenos.','Descansar também faz parte do progresso.','Ideias baseadas nas suas tarefas FORM.','Ainda há poucos dados; tente estas ideias.','Não foi possível abrir o editor.','Espera','Alegria','Pensando','Falando','Surpresa','Descanso','Celebração','Fechar Formik','Abrir Formik','Escolha uma pergunta para começar.','Restantes hoje: {count}','Recomendações geradas no seu dispositivo','Olá, {name}! O que vamos fazer?','Continuar tarefa','Fazer uma pausa'],
 pl:['Formik','Twój pomocnik w FORM','Co Cię interesuje?','Dla Ciebie','Co zrobić dalej?','Mój postęp','Plan na dziś','Zaproponuj aktywność','Potrzebuję przerwy','Utwórz zadanie','Otwórz zadania','Dodaj zadanie','Więcej pomysłów','Dziś wykonano: {done} z {total}.','Aktualne XP: {xp}.','Brak zadań na dziś. Zacznij od czegoś małego.','Wszystko na dziś gotowe. Możesz odpocząć.','Zacznij od: {title}','Wybierz do trzech małych kroków.','Odpoczynek to też część postępu.','Pomysły bazują na zadaniach w FORM.','Na razie mało danych – oto kilka pomysłów.','Nie można otworzyć edytora.','Czekanie','Radość','Myślenie','Rozmowa','Zaskoczenie','Odpoczynek','Świętowanie','Zamknij Formik','Otwórz Formik','Wybierz pytanie na początek.','Pozostało dziś: {count}','Rekomendacje powstają na urządzeniu','Cześć, {name}! Co robimy?','Kontynuuj zadanie','Zrób przerwę'],
 tr:['Formik','FORM yol arkadaşın','Neyle ilgileniyorsun?','Senin için','Sırada ne yapmalıyım?','İlerlemem','Günlük plan','Etkinlik öner','Mola istiyorum','Görev oluştur','Görevleri aç','Görev ekle','Daha fazla fikir','Bugün tamamlanan: {done}/{total}.','Güncel XP: {xp}.','Bugün görev yok. Küçük bir adımla başla.','Bugünkü işler bitti. Dinlenebilirsin.','Bu görevle başla: {title}','En fazla üç küçük adım seç.','Dinlenmek de ilerlemenin bir parçası.','Fikirler FORM görevlerine göre seçilir.','Henüz az veri var; bunları dene.','Görev düzenleyici açılamadı.','Bekleme','Mutluluk','Düşünme','Konuşma','Şaşkınlık','Dinlenme','Kutlama','Formik’i kapat','Formik’i aç','Başlamak için bir soru seç.','Bugün kalan: {count}','Öneriler cihazında hazırlanır','Merhaba, {name}! Ne yapalım?','Göreve devam et','Mola ver'],
 uk:['Формік','Твій помічник у FORM','Що тебе цікавить?','Для тебе','Що робити далі?','Мій прогрес','План на сьогодні','Порадь заняття','Хочу відпочити','Створити завдання','Відкрити завдання','Додати завдання','Ще ідеї','Сьогодні виконано: {done} з {total}.','Поточні XP: {xp}.','Завдань на сьогодні ще немає. Почни з малого.','Усі завдання виконані. Можна відпочити.','Почни з цього завдання: {title}','Обери до трьох невеликих кроків.','Відпочинок — теж частина прогресу.','Ідеї підібрано за завданнями у FORM.','Поки замало даних: ось різні ідеї.','Не вдалося відкрити редактор.','Очікування','Радість','Роздуми','Розмова','Здивування','Відпочинок','Свято','Закрити Формік','Відкрити Формік','Обери запитання для початку.','Залишилося сьогодні: {count}','Поради створюються на пристрої','Привіт, {name}! Що робитимемо?','Продовжити завдання','Зробити перерву'],
 zh:['Formik','你的 FORM 伙伴','你想了解什么？','为你推荐','下一步做什么？','我的进度','今日计划','推荐活动','我想休息','创建任务','打开任务','添加任务','更多建议','今日完成：{done}/{total}。','当前 XP：{xp}。','今天还没有任务，可以从一件小事开始。','今天的任务全部完成，可以休息了。','从这项任务开始：{title}','选择最多三个小步骤。','休息也是进步的一部分。','建议根据你的 FORM 任务和活动生成。','数据还不多，试试这些不同活动。','无法打开任务编辑器。','待机','开心','思考','说话','惊讶','休息','庆祝','关闭 Formik','打开 Formik','选一个感兴趣的问题开始。','今天剩余：{count}','推荐仅在设备上生成','你好，{name}！接下来做什么？','继续任务','休息一下'],
 ja:['Formik','FORM の相棒','何が気になる？','あなたへのおすすめ','次に何をする？','進捗を見る','今日の計画','活動を提案して','休みたい','タスクを作成','タスクを開く','タスクを追加','ほかのアイデア','今日の完了：{done}/{total}。','現在の XP：{xp}。','今日のタスクはまだありません。小さく始めましょう。','今日のタスクはすべて完了です。休んで大丈夫。','このタスクから始めよう：{title}','小さなステップを３つまで選ぼう。','休息も進歩の一部です。','FORM のタスクに基づく提案です。','まだデータが少ないので、いくつか提案します。','タスク編集画面を開けませんでした。','待機','喜び','考え中','会話','驚き','休憩','お祝い','Formik を閉じる','Formik を開く','気になる質問を選んでね。','今日の残り：{count}','提案は端末内だけで作成されます','こんにちは、{name}！何をしよう？','タスクを続ける','ひと休み']
};
const KEYS=['name','subtitle','interests','foryou','next','progress','plan','ideas','rest','new','openTasks','add','more','completed','xp','none','allDone','start','smallSteps','restText','personalized','fewData','editorFail','idle','happy','thinking','talking','surprised','sleep','celebration','close','open','choose','left','private','hello','continue','break'];
const T = Object.fromEntries(KEYS.map((k,i)=>[k,i]));
function language(){const lang=window.FormI18n?.lang||document.documentElement.lang||'ru';return I18N[lang] ? lang : 'en'}
function tr(key,args){let s=(I18N[language()]||I18N.en)[T[key]]||I18N.en[T[key]]||key;return s.replace(/\{(\w+)\}/g,(_,x)=>String(args?.[x]??''))}
const IDEA_NAMES={
 EDUCATION:{ru:'Уделить 15 минут новой теме',en:'Explore a new topic for 15 minutes',es:'Dedica 15 minutos a un tema nuevo',de:'Erkunde 15 Minuten lang ein neues Thema',fr:'Découvre un nouveau sujet pendant 15 minutes',it:'Scopri un nuovo argomento per 15 minuti',pt:'Explore um novo assunto por 15 minutos',pl:'Poznaj nowy temat przez 15 minut',tr:'Yeni bir konuya 15 dakika ayır',uk:'Приділи 15 хвилин новій темі',zh:'花 15 分钟了解新主题',ja:'新しいテーマを15分学ぶ'},
 PRODUCTIVITY:{ru:'Навести порядок в одном деле',en:'Organize one small task',es:'Organiza una tarea pequeña',de:'Ordne eine kleine Aufgabe',fr:'Organise une petite tâche',it:'Organizza una piccola attività',pt:'Organize uma tarefa pequena',pl:'Uporządkuj jedno małe zadanie',tr:'Küçük bir işi düzenle',uk:'Упорядкуй одну невелику справу',zh:'整理一件小事',ja:'小さなタスクを一つ整理する'},
 CREATIVE:{ru:'Сделать маленький творческий проект',en:'Try a small creative project',es:'Prueba un proyecto creativo pequeño',de:'Versuche ein kleines Kreativprojekt',fr:'Essaie un petit projet créatif',it:'Prova un piccolo progetto creativo',pt:'Tente um pequeno projeto criativo',pl:'Spróbuj małego projektu twórczego',tr:'Küçük bir yaratıcı proje dene',uk:'Спробуй маленький творчий проєкт',zh:'尝试一个小型创意项目',ja:'小さな創作をしてみる'},
 FITNESS:{ru:'Погулять в удобном темпе',en:'Take a comfortable walk',es:'Da un paseo a tu ritmo',de:'Geh in deinem Tempo spazieren',fr:'Fais une promenade à ton rythme',it:'Fai una passeggiata con calma',pt:'Faça uma caminhada tranquila',pl:'Idź na spacer we własnym tempie',tr:'Rahat bir tempoda yürüyüş yap',uk:'Прогуляйся у зручному темпі',zh:'按自己的节奏散散步',ja:'自分のペースで散歩する'},
 PERSONAL:{ru:'Связаться с другом',en:'Check in with a friend',es:'Escribe a una amistad',de:'Melde dich bei einem Freund',fr:'Prends des nouvelles d’un ami',it:'Scrivi a un amico',pt:'Converse com um amigo',pl:'Napisz do znajomego',tr:'Bir arkadaşına haber ver',uk:'Напиши другові',zh:'联系一位朋友',ja:'友達に連絡する'},
 HEALTH:{ru:'Устроить спокойный перерыв',en:'Take a quiet break',es:'Toma una pausa tranquila',de:'Mach eine ruhige Pause',fr:'Fais une pause au calme',it:'Fai una pausa tranquilla',pt:'Faça uma pausa tranquila',pl:'Zrób spokojną przerwę',tr:'Sakin bir mola ver',uk:'Зроби спокійну перерву',zh:'安静地休息一下',ja:'静かにひと休みする'},
 TECH:{ru:'Узнать что-то новое о технологиях',en:'Learn something new about technology',es:'Aprende algo nuevo de tecnología',de:'Lerne etwas Neues über Technik',fr:'Découvre une nouveauté technologique',it:'Scopri qualcosa di nuovo sulla tecnologia',pt:'Aprenda algo novo sobre tecnologia',pl:'Dowiedz się czegoś o technologii',tr:'Teknolojiyle ilgili yeni bir şey öğren',uk:'Дізнайся щось нове про технології',zh:'学习一点新科技知识',ja:'技術について新しいことを学ぶ'}
};
const STATES=new Set(['idle','happy','thinking','talking','surprised','sleep','celebration']);
let root,launch,panel,mini,full,status,answerBox,results,questions,scrim;
let isOpen=false,stateName='idle',sleepTimer=0,reactionTimer=0,ideaPage=0,observer=null;
const $=id=>document.getElementById(id);
function progress(){
  try{
    if(typeof state==='undefined'||!state||!Array.isArray(state.missions))throw Error('missing');
    const day=typeof today==='function'?today():new Date().toISOString().slice(0,10);
    const all=state.missions.filter(m=>m.created===day);return {
      name: String(state.callsign||'').trim().slice(0,32), all, done:all.filter(m=>m.done), left:all.filter(m=>!m.done),
      history:Array.isArray(state.completed)?state.completed:[], xp: Math.max(0,Number(state.xp)||0)
    };
  }catch(_){return {name:'',all:[],done:[],left:[],history:[],xp:0}}
}
function setCharacter(s,timeout=0){
  if(!STATES.has(s))s='idle';
  clearTimeout(reactionTimer);clearTimeout(sleepTimer);
  stateName=s;
  for(const el of [mini,full])if(el)el.dataset.state=s;
  if(status)status.textContent=tr(s);
  if(timeout>0)reactionTimer=setTimeout(()=>setCharacter('idle'),timeout);
  if(s==='idle'&&isOpen)sleepTimer=setTimeout(()=>{if(isOpen&&stateName==='idle')setCharacter('sleep')},90000);
}
function freshness(){if(stateName==='sleep')setCharacter('surprised',700);else if(stateName==='idle')setCharacter('idle')}
function make(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
function button(label,action,cls){const b=make('button',cls,label);b.type='button';b.dataset.fmAction=action;return b}
function curated(){
  const p=progress(),recent=p.history.slice(-60);
  const score={}; for(const m of p.all)score[m.category]=(score[m.category]||0)+2;
  for(const m of recent)score[m.category]=(score[m.category]||0)+3;
  const ordered=Object.keys(IDEA_NAMES).sort((a,b)=>(score[b]||0)-(score[a]||0));
  const offset=ideaPage++ % ordered.length;
  return ordered.slice(offset).concat(ordered.slice(0,offset)).slice(0,3).map(category=>({category, title:(IDEA_NAMES[category][language()]||IDEA_NAMES[category].en)}));
}
function taskCard(item,fromPlan=false){
  const card=make('article','fai-suggestion');
  const category=typeof categories!=='undefined' ? categories[item.category] : item.category;
  card.append(make('span','',window.FormI18n?.t?.(category)||category),make('strong','',item.title));
  if(fromPlan)card.append(button(tr('continue'),'tasks','fai-add'));
  else {const b=button(tr('add'),'createIdea','fai-add');b._idea=item;card.append(b)}
  return card;
}
function renderQuestions(){
  if(!questions)return;questions.replaceChildren();
  const p=progress();
  const actions=p.left.length ? [['next','next'],['plan','plan'],['progress','progress'],['rest','rest'],['ideas','ideas']] :
    p.all.length ? [['progress','progress'],['ideas','ideas'],['plan','plan'],['rest','rest'],['next','next']] :
    [['ideas','ideas'],['plan','plan'],['next','next'],['rest','rest'],['progress','progress']];
  for(const [key,action] of actions)questions.append(button(tr(key),action));
}
function renderRec(){
  if(!results)return;
  results.replaceChildren();const p=progress();
  if(p.left.length){results.append(taskCard(p.left[0],true));results.append(make('div','fai-sub',tr('left',{count:p.left.length})))}
  else {for(const item of curated())results.append(taskCard(item))}
}
function writeAnswer(key,arg){if(answerBox)answerBox.textContent=tr(key,arg)}
function openTasks(){close();if(typeof showScreen==='function')showScreen('dashboard')}
function createTask(idea){
  if(typeof openMission!=='function'){writeAnswer('editorFail');return}
  close();openMission();
  if(idea){
    const t=$('mTitle'),c=$('mCategory'),rep=$('mRepeat');
    if(t){t.value=idea.title;t.focus({preventScroll:true})}
    if(c&&Array.from(c.options).some(x=>x.value===idea.category))c.value=idea.category;
    if(rep)rep.value='once';
  }
}
function act(action,idea){
  const p=progress();freshness();
  if(action==='new'){createTask(null);return}
  if(action==='tasks'){openTasks();return}
  if(action==='createIdea'){createTask(idea);return}
  if(action==='next')writeAnswer(p.left.length?'start':p.all.length?'allDone':'none',{title:p.left[0]?.title||''});
  if(action==='progress')writeAnswer('completed',{done:p.done.length,total:p.all.length});
  if(action==='plan')writeAnswer(p.left.length?'smallSteps':'none');
  if(action==='ideas')writeAnswer(p.history.length||p.all.length?'personalized':'fewData');
  if(action==='rest')writeAnswer('restText');
  if(results){results.replaceChildren();if(action==='progress')results.append(make('p','fai-progress',tr('xp',{xp:p.xp})));
    else if(action==='rest')results.append(taskCard({category:'HEALTH',title:IDEA_NAMES.HEALTH[language()]||IDEA_NAMES.HEALTH.en}));
    else if(['next','plan'].includes(action)&&p.left.length){for(const item of p.left.slice(0,action==='plan'?3:1))results.append(taskCard(item,true))}
    else for(const item of curated())results.append(taskCard(item));
  }
  setCharacter(action==='progress'?'happy':action==='rest'?'sleep':'talking',action==='rest'?0:1150);
}
function renderLanguage(){
  if(!root)return;
  launch.setAttribute('aria-label',tr('open'));$('faiClose').setAttribute('aria-label',tr('close'));
  $('faiHeading').textContent=tr('name');$('faiSubtitle').textContent=tr('subtitle');
  $('faiQuestionTitle').textContent=tr('interests');$('faiForYou').textContent=tr('foryou');
  $('faiNew').textContent=tr('new');$('faiOpenTasks').textContent=tr('openTasks');
  $('faiPrivate').textContent=tr('private');$('faiBadge').textContent='FORMIK';
  const p=progress(),name=p.name&&p.name!=='ПОЛЬЗОВАТЕЛЬ'?p.name:'';
  const generic={ru:'Привет! Чем займёмся?',en:'Hi! What shall we do?',es:'¡Hola! ¿Qué hacemos?',de:'Hallo! Was machen wir?',fr:'Salut ! Que fait-on ?',it:'Ciao! Cosa facciamo?',pt:'Olá! O que vamos fazer?',pl:'Cześć! Co robimy?',tr:'Merhaba! Ne yapalım?',uk:'Привіт! Що робитимемо?',zh:'你好！接下来做什么？',ja:'こんにちは！何をしよう？'};
  $('faiHello').textContent=name?tr('hello',{name}):generic[language()];
  if(stateName!=='sleep')writeAnswer('choose');else writeAnswer('restText');
  status.textContent=tr(stateName);
  renderQuestions();renderRec();
}
function refreshVisibility(){
  const hidden=document.hidden;
  mini?.classList.toggle('is-paused',hidden||isOpen);
  full?.classList.toggle('is-paused',hidden||!isOpen);
}
function open(){
  if(!panel||document.documentElement.dataset.auth!=='in')return;
  isOpen=true;panel.hidden=false;scrim.hidden=false;launch.hidden=true;panel.setAttribute('aria-hidden','false');
  renderLanguage();setCharacter('happy',900);refreshVisibility();$('faiClose').focus({preventScroll:true});
}
function close(){
  if(!panel)return;isOpen=false;panel.hidden=true;scrim.hidden=true;launch.hidden=false;panel.setAttribute('aria-hidden','true');
  setCharacter('idle');refreshVisibility();launch.focus({preventScroll:true});
}
function setupDock(){
  const small=()=>matchMedia('(max-width:600px)').matches;
  const fit=v=>Math.max(130,Math.min(window.innerHeight-108, v));
  try{const n=+localStorage.getItem('formikDockTop');if(Number.isFinite(n)&&n>0)launch.style.top=fit(n)+'px'}catch(_){}
  let down=null,dragged=false;
  launch.addEventListener('pointerdown',e=>{if(!small()||!e.isPrimary)return;down={y:e.clientY,top:launch.getBoundingClientRect().top};dragged=false;try{launch.setPointerCapture(e.pointerId)}catch(_){}});
  launch.addEventListener('pointermove',e=>{if(!down||!small())return;const d=e.clientY-down.y;if(Math.abs(d)>7)dragged=true;if(dragged){e.preventDefault();launch.style.top=fit(down.top+d)+'px'}});
  launch.addEventListener('pointerup',()=>{if(dragged){try{localStorage.setItem('formikDockTop',String(parseInt(launch.style.top,10)))}catch(_){}}down=null});
  launch.addEventListener('pointercancel',()=>{down=null});
  launch.addEventListener('click',e=>{if(dragged){e.preventDefault();e.stopPropagation();dragged=false;return}open()});
  window.addEventListener('resize',()=>{if(small()&&launch.style.top)launch.style.top=fit(parseInt(launch.style.top,10))+'px'});
}
function init(){
  if(!window.FormAICharacter||$('formAI'))return;
  root=document.createElement('div');root.id='formAI';root.className='fai-root';
  root.innerHTML=`<button id="faiLaunch" class="fai-launch" type="button" aria-haspopup="dialog" aria-controls="faiPanel"><span class="fai-character" id="faiMini" data-state="idle">${window.FormAICharacter('formik-mini')}</span><span class="fai-betatab" id="faiBadge">FORMIK</span></button>
  <div class="fai-scrim" id="faiScrim" hidden></div>
  <section id="faiPanel" class="fai-panel" role="dialog" aria-hidden="true" aria-modal="true" hidden>
    <header class="fai-headbar"><div><div class="fai-kicker" id="faiSubtitle"></div><div class="fai-heading" id="faiHeading"></div></div><button class="fai-close" id="faiClose" type="button">×</button></header>
    <div class="fai-stage"><span class="fai-character" id="faiFull" data-state="idle">${window.FormAICharacter('formik-full')}</span><span class="fai-statetext" id="faiStatus"></span></div>
    <p class="fai-intro" id="faiHello"></p>
    <div class="fai-scroll"><div class="fai-section-title" id="faiQuestionTitle"></div><div id="faiQuestions" class="fai-questions"></div>
    <div class="fai-answer" id="faiAnswer" role="status" aria-live="polite"></div>
    <div class="fai-section-title" id="faiForYou"></div><div id="faiResults" class="fai-results"></div></div>
    <div class="fai-actions"><button id="faiOpenTasks" data-fm-action="tasks" type="button"></button><button id="faiNew" data-fm-action="new" type="button"></button></div>
    <div class="fai-foot" id="faiPrivate"></div>
  </section>`;
  document.body.append(root);
  launch=$('faiLaunch');panel=$('faiPanel');mini=$('faiMini');full=$('faiFull');status=$('faiStatus');answerBox=$('faiAnswer');results=$('faiResults');questions=$('faiQuestions');scrim=$('faiScrim');
  setupDock();$('faiClose').addEventListener('click',close);scrim.addEventListener('click',close);
  panel.addEventListener('click',e=>{const b=e.target.closest('[data-fm-action]');if(b)act(b.dataset.fmAction,b._idea);else freshness()});
  document.addEventListener('keydown',e=>{if(isOpen&&e.key==='Escape'){e.stopPropagation();close()}});
  document.addEventListener('visibilitychange',refreshVisibility);
  if('IntersectionObserver' in window){observer=new IntersectionObserver(entries=>{for(const ent of entries)ent.target.classList.toggle('is-paused',document.hidden||!ent.isIntersecting)},{threshold:0.01});observer.observe(mini);observer.observe(full)}
  const previous=window.formLangChanged;
  window.formLangChanged=function(lang){if(typeof previous==='function')previous(lang);renderLanguage()};
  // Cloud sync can set a language silently; track <html lang> as well as user changes.
  if('MutationObserver' in window){const langObserver=new MutationObserver(()=>renderLanguage());langObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']})}
  renderLanguage();refreshVisibility();
}
const api={open,close,react(name){if(STATES.has(name)){setCharacter(name,name==='celebration'?2300:1200);if(isOpen)renderRec()}},setState:setCharacter,getState:()=>stateName,refresh:()=>{if(isOpen)renderLanguage()},get hasGenerativeAPI(){return false},version:'1.1.1-formik'};
window.Formik=api;window.FormAI=api; // backwards compatibility with existing mission/XP reactions
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
