const API = '';

let lang        = 'es';
let ui          = {};
let uiCache     = {};
let chatHistory = [];
let currentFile = null;
let sending     = false;
let lastXrayData = null;

(function(){
  const canvas = document.getElementById('canvas');
  const ctx    = canvas.getContext('2d');
  let particles = [];
 
  function resize(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize);
  resize();
 
  function rand(a,b){ return Math.random()*(b-a)+a; }
 
  function init(){
    particles = [];
    for(let i=0;i<70;i++) particles.push({
      x:rand(0,canvas.width), y:rand(0,canvas.height),
      vx:rand(-.25,.25), vy:rand(-.25,.25),
      r:rand(1.5,3), alpha:rand(.3,.8),
    });
  }
  init();
 
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let i=0;i<particles.length;i++){
      for(let j=i+1;j<particles.length;j++){
        const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<130){
          ctx.beginPath(); ctx.moveTo(particles[i].x,particles[i].y);
          ctx.lineTo(particles[j].x,particles[j].y);
          ctx.strokeStyle=`rgba(0,212,247,${(1-d/130)*0.12})`; ctx.lineWidth=.8; ctx.stroke();
        }
      }
    }
    particles.forEach(p=>{
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(0,212,247,${p.alpha})`; ctx.fill();
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=canvas.width; if(p.x>canvas.width)p.x=0;
      if(p.y<0)p.y=canvas.height; if(p.y>canvas.height)p.y=0;
    });
    requestAnimationFrame(draw);
  }
  draw();
})();
 
async function fetchUIContent(language){
  if(uiCache[language]) return uiCache[language];
  try {
    const res         = await fetch(`${API}/api/ui-content?lang=${language}`);
    uiCache[language] = await res.json();
  } catch(err){
    console.warn(`No se pudo cargar UI content (${language}):`, err);
    uiCache[language] = {};
  }
  return uiCache[language];
}
 
function applyUIContent(language){
  ui = uiCache[language] || {};
 
  document.documentElement.lang = language;
  document.getElementById('btn-es').classList.toggle('active', language==='es');
  document.getElementById('btn-en').classList.toggle('active', language==='en');
 
  document.querySelectorAll('[data-es]').forEach(el => {
    if(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'){
      el.placeholder = el.getAttribute(`data-${language}`) || '';
    } else {
      el.innerHTML = el.getAttribute(`data-${language}`) || '';
    }
  });
 
  if(ui.budget_placeholder)
    document.getElementById('budget-input').placeholder = ui.budget_placeholder;
  if(ui.input_placeholder)
    document.getElementById('msg-input').placeholder    = ui.input_placeholder;
 
  document.getElementById('quick-title').textContent =
    language === 'es' ? 'Preguntas rápidas' : 'Quick questions';
 
  const container = document.getElementById('quick-buttons-container');
  container.innerHTML = '';
  (ui.quick_questions || []).forEach(q => {
    const btn = document.createElement('button');
    btn.className = 'quick-btn';
    btn.innerHTML = `<span></span><span>${q.label}</span>`;
    btn.onclick   = () => quickAsk(q.prompt);
    container.appendChild(btn);
  });
 
  const welcomeMsg = document.getElementById('welcome-msg');
  if(welcomeMsg && ui.welcome){
    welcomeMsg.querySelector('.msg-bubble').innerHTML = formatMarkdown(ui.welcome);
  }
 
  if(lastXrayData){
    renderResults(lastXrayData);
  }
}
 
function setLang(l){
  lang = l;
  applyUIContent(l);
}
 
function switchTab(tab){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  document.getElementById(`section-${tab}`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
}
 
function formatMarkdown(text){
  return text
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/\n/g,'<br>');
}
 
function addMessage(role, content, isTyping=false, msgId=null){
  const box  = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  if(msgId) wrap.id = msgId;   
  wrap.innerHTML = `
    <div class="msg-avatar"></div>
    <div class="msg-bubble">
      ${isTyping
        ? '<div class="typing-dots"><span></span><span></span><span></span></div>'
        : formatMarkdown(content)}
    </div>`;
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
  return wrap.querySelector('.msg-bubble');
}
 
async function sendMessage(){
  if(sending) return;
  const input  = document.getElementById('msg-input');
  const budget = document.getElementById('budget-input').value.trim();
  const text   = input.value.trim();
  if(!text) return;
 
  sending = true;
  document.getElementById('send-btn').disabled = true;
  input.value = '';
  input.style.height = '52px';
 
  addMessage('user', text);
  chatHistory.push({role:'user', content:text});
 
  const typingBubble = addMessage('nova', '', true);
 
  try {
    const res = await fetch(`${API}/api/chat`, {
      method:  'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        message:  text,
        history:  chatHistory.slice(0,-1),
        language: lang,
        budget:   budget || null,
      }),
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.detail || 'Error');
 
    typingBubble.innerHTML = formatMarkdown(data.response);
    chatHistory.push({role:'model', content:data.response});
 
  } catch(err){
    typingBubble.innerHTML = `<span style="color:var(--red)"> ${err.message}</span>`;
  }
 
  sending = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('chat-messages').scrollTop = 999999;
}
 
function handleKey(e){
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); }
  const ta = document.getElementById('msg-input');
  ta.style.height='52px';
  ta.style.height=Math.min(ta.scrollHeight,140)+'px';
}
 
function quickAsk(prompt){
  document.getElementById('msg-input').value = prompt;
  sendMessage();
}
 
function triggerUpload(){ document.getElementById('file-input').click(); }
 
function onDragOver(e){ e.preventDefault(); document.getElementById('upload-zone').classList.add('drag-over'); }
function onDragLeave(){ document.getElementById('upload-zone').classList.remove('drag-over'); }
function onDrop(e){
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('drag-over');
  const f = e.dataTransfer.files[0]; if(f) loadFile(f);
}
function onFileSelected(e){ const f=e.target.files[0]; if(f) loadFile(f); }
 
function loadFile(file){
  if(!file.type.match(/image\/(jpeg|png)/)){
    showToast('Solo JPG y PNG / Only JPG and PNG'); return;
  }
  currentFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    const preview = document.getElementById('xray-preview');
    preview.src = ev.target.result; preview.style.display='block';
    document.getElementById('upload-placeholder').style.display='none';
    document.getElementById('upload-zone').classList.add('has-image');
    document.getElementById('upload-controls').style.display='flex';
  };
  reader.readAsDataURL(file);
}
 
function resetXray(){
  currentFile  = null;
  lastXrayData = null;  
  document.getElementById('xray-preview').style.display='none';
  document.getElementById('xray-preview').src='';
  document.getElementById('upload-placeholder').style.display='';
  document.getElementById('upload-zone').classList.remove('has-image');
  document.getElementById('upload-controls').style.display='none';
  document.getElementById('file-input').value='';
  document.getElementById('results-empty').style.display='';
  document.getElementById('results-content').style.display='none';
}
 
async function analyzeXray(){
  if(!currentFile){ showToast(ui.analyzing||'Selecciona una imagen primero'); return; }
 
  const btn = document.getElementById('analyze-btn');
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> <span>${ui.analyzing||'…'}</span>`;
  document.getElementById('results-empty').innerHTML =
    `<div class="spinner"></div><p style="color:var(--txt-3);margin-top:12px;font-size:14px;">${ui.analyzing||'…'}</p>`;
 
  try {
    const form = new FormData();
    form.append('file', currentFile);
 
    const res  = await fetch(`${API}/api/analyze-xray`, {method:'POST', body:form});
    const data = await res.json();
    if(!res.ok) throw new Error(data.detail||'Error en el análisis');
 
    renderResults(data);
  } catch(err){
    document.getElementById('results-empty').innerHTML =
      `<div class="results-empty-icon"></div><div class="results-empty-text" style="color:var(--red)">${err.message}</div>`;
  }
 
  btn.disabled = false;
  btn.innerHTML = `<span></span> <span>${lang==='es'?'Analizar Radiografía':'Analyze X-Ray'}</span>`;
}
 
function renderResults(data){
  lastXrayData = data;
 
  document.getElementById('results-empty').style.display='none';
  const el = document.getElementById('results-content');
  el.style.display='block';
 
  const top8     = (data.findings||[]).slice(0,8);
  const isNormal = data.is_normal;
 
  el.innerHTML = `
    <div class="verdict-banner ${isNormal?'normal':'abnormal'}">
      <div class="verdict-icon"></div>
      <div class="verdict-text">
        <h3>${isNormal ? ui.normal_title : ui.abnormal_title}</h3>
        <p>${isNormal ? ui.normal_sub   : ui.abnormal_sub}</p>
      </div>
    </div>
 
    <div class="findings-title">${ui.findings_label||''}</div>
 
    ${top8.map(f=>`
      <div class="finding-item">
        <div class="finding-header">
          <div class="finding-name">
            <div class="finding-dot ${f.severity}"></div>
            ${lang==='es' ? f.condition_es : f.condition}
          </div>
          <div class="finding-pct ${f.severity}">${f.confidence}%</div>
        </div>
        <div class="finding-bar-track">
          <div class="finding-bar ${f.severity}" data-w="${f.confidence}"></div>
        </div>
        <div class="finding-desc">${lang==='es' ? f.description_es : f.description_en}</div>
      </div>
    `).join('')}
 
    <p style="font-size:12px;color:var(--txt-3);border-top:1px solid var(--border);padding-top:14px;">
      ${ui.disclaimer||''}
    </p>`;
 
  requestAnimationFrame(()=>{
    el.querySelectorAll('.finding-bar').forEach(bar=>{
      setTimeout(()=>{ bar.style.width = bar.dataset.w+'%'; }, 50);
    });
  });
}
 
function showToast(msg, duration=3000){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), duration);
}
 
window.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    fetchUIContent('es'),
    fetchUIContent('en'),
  ]);
 
  applyUIContent('es');
 
  addMessage('nova', ui.welcome || 'Hola! Soy NOVA. En qué puedo ayudarte?', false, 'welcome-msg');
});