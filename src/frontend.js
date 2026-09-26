export function getHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>SyncBoard - 跨端消息同步</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0a0a0f;--sf:#12121a;--sf2:#1a1a26;--sf3:#222233;
  --bd:#2a2a3e;--bd2:#363650;--tx:#e4e4f0;--tx2:#9090b0;
  --pr:#6c5ce7;--pr2:#8577ed;--prb:rgba(108,92,231,.12);
  --dg:#ff6b6b;--dgb:rgba(255,107,107,.12);
  --ok:#51cf66;--okb:rgba(81,207,102,.12);
  --r:12px;--rs:8px
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--tx);min-height:100dvh;overflow:hidden}

/* === 认证页 === */
.auth-overlay{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:1000;transition:opacity .3s}
.auth-overlay.hidden{opacity:0;pointer-events:none}
.auth-card{background:var(--sf);border:1px solid var(--bd);border-radius:20px;padding:40px 36px;width:min(400px,90vw);box-shadow:0 20px 60px rgba(0,0,0,.5)}
.auth-card h1{font-size:28px;text-align:center;margin-bottom:6px;background:linear-gradient(135deg,var(--pr),#a29bfe);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.auth-card .sub{text-align:center;color:var(--tx2);font-size:14px;margin-bottom:32px}
.auth-card .field{margin-bottom:18px}
.auth-card label{display:block;font-size:13px;color:var(--tx2);margin-bottom:6px;font-weight:500}
.auth-card input{width:100%;padding:12px 16px;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--rs);color:var(--tx);font-size:15px;outline:none;transition:border .2s}
.auth-card input:focus{border-color:var(--pr)}
.btn-p{width:100%;padding:13px;background:var(--pr);color:#fff;border:none;border-radius:var(--rs);font-size:15px;font-weight:600;cursor:pointer;transition:all .2s;margin-top:8px}
.btn-p:hover{background:var(--pr2);transform:translateY(-1px)}
.btn-p:disabled{opacity:.5;cursor:not-allowed;transform:none}
.auth-card .sw{text-align:center;margin-top:20px;font-size:13px;color:var(--tx2)}
.auth-card .sw a{color:var(--pr);cursor:pointer;text-decoration:none;font-weight:500}
.auth-card .err{color:var(--dg);font-size:13px;text-align:center;margin-top:12px;min-height:18px}

/* === 主界面 === */
.app{display:flex;flex-direction:column;height:100dvh}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:var(--sf);border-bottom:1px solid var(--bd);flex-shrink:0;gap:12px}
.topbar .logo{font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px;white-space:nowrap}
.topbar .logo span{background:linear-gradient(135deg,var(--pr),#a29bfe);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.topbar-r{display:flex;align-items:center;gap:8px}
.status{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx2)}
.status .dot{width:8px;height:8px;border-radius:50%;background:var(--ok);flex-shrink:0}
.status .dot.off{background:var(--dg)}
.btn-s{padding:6px 14px;font-size:12px;border:1px solid var(--bd);border-radius:var(--rs);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:all .2s;white-space:nowrap}
.btn-s:hover{border-color:var(--pr);color:var(--pr)}
.btn-s.dg:hover{border-color:var(--dg);color:var(--dg)}

/* === 标签栏 === */
.tabs{display:flex;align-items:center;background:var(--sf);border-bottom:1px solid var(--bd);padding:0 12px;flex-shrink:0;overflow-x:auto;gap:2px;min-height:40px}
.tabs::-webkit-scrollbar{display:none}
.tab{display:flex;align-items:center;gap:6px;padding:8px 16px;font-size:13px;color:var(--tx2);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap;flex-shrink:0;user-select:none}
.tab:hover{color:var(--tx)}
.tab.on{color:var(--pr);border-bottom-color:var(--pr)}
.tab .x{width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:14px;line-height:1;opacity:0;transition:all .15s}
.tab:hover .x{opacity:.6}
.tab .x:hover{opacity:1;background:var(--dgb);color:var(--dg)}
.addtab{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;color:var(--tx2);cursor:pointer;font-size:18px;transition:all .2s;flex-shrink:0}
.addtab:hover{background:var(--prb);color:var(--pr)}

/* === 内容区 === */
.main{flex:1;overflow:hidden;position:relative}
.cv{position:absolute;inset:0;display:flex;flex-direction:column;transition:opacity .15s}
.cv.hide{opacity:0;pointer-events:none;z-index:0}
.cv.on{opacity:1;z-index:1}

.msgs{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:8px}
.msgs::-webkit-scrollbar{width:6px}
.msgs::-webkit-scrollbar-track{background:transparent}
.msgs::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}

.ldm{text-align:center;padding:8px}
.ldm button{padding:6px 20px;font-size:12px;border:1px solid var(--bd);border-radius:var(--rs);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:all .2s}
.ldm button:hover{border-color:var(--pr);color:var(--pr)}

.mi{display:flex;gap:12px;padding:12px 16px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);transition:all .2s;animation:si .2s ease}
.mi:hover{border-color:var(--bd2);background:var(--sf2)}
.mc{flex:1;font-size:14px;line-height:1.7;word-break:break-all;white-space:pre-wrap}
.mm{display:flex;align-items:center;justify-content:space-between;margin-top:6px}
.mt{font-size:11px;color:var(--tx2)}
.ma{display:flex;gap:4px;opacity:0;transition:opacity .15s}
.mi:hover .ma{opacity:1}
.mb{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--tx2);cursor:pointer;border-radius:6px;font-size:14px;transition:all .15s}
.mb:hover{background:var(--prb);color:var(--pr)}
.mb.dl:hover{background:var(--dgb);color:var(--dg)}

.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--tx2);gap:12px}
.empty .ic{font-size:48px;opacity:.5}
.empty p{font-size:14px}

/* === 输入区 === */
.iarea{padding:12px 20px;background:var(--sf);border-top:1px solid var(--bd);flex-shrink:0}
.irow{display:flex;gap:10px;align-items:flex-end}
.irow textarea{flex:1;padding:12px 16px;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);color:var(--tx);font-size:14px;line-height:1.6;resize:none;outline:none;min-height:48px;max-height:200px;font-family:inherit;transition:border .2s}
.irow textarea:focus{border-color:var(--pr)}
.irow textarea::placeholder{color:var(--tx2)}
.sbtn{width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:var(--pr);border:none;border-radius:var(--r);color:#fff;cursor:pointer;font-size:20px;transition:all .2s;flex-shrink:0}
.sbtn:hover{background:var(--pr2);transform:translateY(-1px)}
.sbtn:active{transform:scale(.95)}
.sbtn:disabled{opacity:.4;cursor:not-allowed;transform:none}
.ihint{font-size:11px;color:var(--tx2);margin-top:6px;text-align:right}

/* === Toast === */
.tc{position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px}
.tt{padding:12px 20px;border-radius:var(--rs);font-size:13px;animation:sr .3s ease;box-shadow:0 8px 24px rgba(0,0,0,.3)}
.tt.ok{background:var(--okb);color:var(--ok);border:1px solid rgba(81,207,102,.2)}
.tt.er{background:var(--dgb);color:var(--dg);border:1px solid rgba(255,107,107,.2)}
.tt.info{background:var(--prb);color:var(--pr2);border:1px solid rgba(108,92,231,.2)}

@keyframes si{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes sr{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}

@media(max-width:600px){
  .topbar{padding:10px 14px}
  .msgs{padding:12px 14px}
  .iarea{padding:10px 14px}
  .mi{padding:10px 12px}
  .mi .ma{opacity:1}
  .auth-card{padding:28px 24px}
}
</style>
</head>
<body>

<!-- 登录/注册 -->
<div class="auth-overlay" id="ao">
  <div class="auth-card">
    <h1>\u26A1 SyncBoard</h1>
    <p class="sub">跨端实时消息同步</p>
    <div id="af">
      <div class="field"><label>用户名</label><input type="text" id="au" placeholder="输入用户名" autocomplete="username" maxlength="20"></div>
      <div class="field"><label>密码</label><input type="password" id="ap" placeholder="输入密码" autocomplete="current-password"></div>
      <button class="btn-p" id="ab" onclick="doAuth()">登 录</button>
      <div class="err" id="ae"></div>
      <div class="sw" id="as">还没有帐号？<a onclick="toggleMode()">注册</a></div>
    </div>
  </div>
</div>

<!-- 主界面 -->
<div class="app" id="app" style="display:none">
  <div class="topbar">
    <div class="logo">\u26A1 <span>SyncBoard</span></div>
    <div class="topbar-r">
      <div class="status" id="wss"><div class="dot off"></div><span>连接中</span></div>
      <button class="btn-s" id="ul">user</button>
      <button class="btn-s dg" onclick="logout()">退出</button>
    </div>
  </div>
  <div class="tabs" id="tb"><div class="addtab" onclick="addTab()" title="新建窗口">＋</div></div>
  <div class="main" id="ma"></div>
</div>

<div class="tc" id="tc"></div>

<script>
let token=localStorage.getItem('tk'),uname=localStorage.getItem('un'),uid=null,mode='login',ws=null,chs=[],ach=0;

if(token&&uname){try{const p=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));uid=p.uid}catch(e){token=null}}
if(token){showApp()}else{$('ao').classList.remove('hidden')}

function $(id){return document.getElementById(id)}
function toggleMode(){
  mode=mode==='login'?'register':'login';
  $('ab').textContent=mode==='login'?'登 录':'注 册';
  $('as').innerHTML=mode==='login'?'还没有帐号？<a onclick="toggleMode()">注册</a>':'已有帐号？<a onclick="toggleMode()">登录</a>';
  $('ae').textContent='';
}

async function doAuth(){
  const u=$('au').value.trim(),p=$('ap').value,e=$('ae'),b=$('ab');
  e.textContent='';
  if(!u||!p){e.textContent='请填写完整';return}
  b.disabled=true;
  try{
    const r=await fetch(mode==='login'?'/api/login':'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const d=await r.json();
    if(!r.ok){e.textContent=d.error||'失败';return}
    token=d.token;uname=d.username;
    const pl=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));uid=pl.uid;
    localStorage.setItem('tk',token);localStorage.setItem('un',uname);
    showApp();toast(mode==='login'?'登录成功':'注册成功','ok');
  }catch(x){e.textContent='网络错误'}finally{b.disabled=false}
}

function logout(){
  token=uname=uid=null;localStorage.removeItem('tk');localStorage.removeItem('un');
  if(ws)ws.close();chs=[];
  $('app').style.display='none';$('ao').classList.remove('hidden');
  $('au').value='';$('ap').value='';
}

function showApp(){
  $('ao').classList.add('hidden');$('app').style.display='flex';$('ul').textContent=uname;
  if(chs.length===0)addTab('default');
  connectWS();
}

// === 标签页 ===
function addTab(name){
  if(!name){
    const n=chs.length+1;
    const input=prompt('频道名称（英文/数字）','ch-'+n);
    if(input===null)return;
    name=input.trim().replace(/[^a-zA-Z0-9_-]/g,'')||'ch-'+n;
  }
  const ei=chs.findIndex(c=>c.name===name);
  if(ei>=0){switchTab(ei);return}
  const ch={name,msgs:[],hasMore:true,oldest:null,el:null};
  chs.push(ch);buildView(ch);renderTabs();switchTab(chs.length-1);loadMsgs(chs.length-1);
}

function closeTab(i,ev){
  if(ev)ev.stopPropagation();
  if(chs.length<=1)return;
  if(chs[i].el)chs[i].el.remove();
  chs.splice(i,1);
  if(ach>=chs.length)ach=chs.length-1;
  renderTabs();switchTab(ach);
}

function switchTab(i){
  ach=i;
  chs.forEach((c,j)=>{if(c.el){c.el.classList.toggle('on',j===i);c.el.classList.toggle('hide',j!==i)}});
  renderTabs();
  const ta=chs[i]?.el?.querySelector('textarea');
  if(ta)setTimeout(()=>ta.focus(),50);
}

function renderTabs(){
  const bar=$('tb'),add=bar.querySelector('.addtab');
  bar.querySelectorAll('.tab').forEach(t=>t.remove());
  chs.forEach((c,i)=>{
    const t=document.createElement('div');
    t.className='tab'+(i===ach?' on':'');
    t.onclick=()=>switchTab(i);
    t.innerHTML=(c.name==='default'?'\uD83D\uDCCB 默认':'\uD83D\uDCC1 '+c.name)
      +(chs.length>1?'<span class="x" onclick="closeTab('+i+',event)">\u00D7</span>':'');
    bar.insertBefore(t,add);
  });
}

function buildView(ch){
  const v=document.createElement('div');v.className='cv hide';
  v.innerHTML=\`
    <div class="msgs">
      <div class="ldm" style="display:none"><button onclick="loadMore()">加载更早消息</button></div>
      <div class="empty"><div class="ic">\uD83D\uDCDD</div><p>发送你的第一条消息</p></div>
    </div>
    <div class="iarea"><div class="irow">
      <textarea rows="1" placeholder="输入消息… (Ctrl+Enter 发送)" oninput="arz(this)"></textarea>
      <button class="sbtn" onclick="sendMsg()">\u2191</button>
    </div><div class="ihint">Ctrl + Enter 发送 · 支持多行</div></div>\`;
  v.querySelector('textarea').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();sendMsg()}});
  const ml=v.querySelector('.msgs');
  ml.addEventListener('scroll',()=>{if(ml.scrollTop<50){const idx=chs.indexOf(ch);if(idx>=0&&ch.hasMore)loadMsgs(idx,true)}});
  ch.el=v;$('ma').appendChild(v);
}

// === 消息 ===
async function loadMsgs(idx,older=false){
  const ch=chs[idx];if(!ch)return;
  if(!older&&ch.msgs.length>0)return;
  if(older&&!ch.hasMore)return;
  const p=new URLSearchParams({channel:ch.name,limit:'20'});
  if(older&&ch.oldest)p.set('before',ch.oldest);
  try{
    const r=await fetch('/api/messages?'+p,{headers:{Authorization:'Bearer '+token}});
    const d=await r.json();
    if(!r.ok){if(r.status===401)logout();return}
    ch.hasMore=d.hasMore;
    if(d.messages.length>0){
      const nm=d.messages.reverse();
      ch.msgs=older?[...nm,...ch.msgs]:nm;
      ch.oldest=ch.msgs[0]?.id;
    }
    renderMsgs(idx,older);
  }catch(e){toast('加载失败','er')}
}

function loadMore(){loadMsgs(ach,true)}

function renderMsgs(idx,prepend=false){
  const ch=chs[idx];if(!ch?.el)return;
  const c=ch.el.querySelector('.msgs'),em=c.querySelector('.empty'),ld=c.querySelector('.ldm');
  if(ch.msgs.length===0){em.style.display='flex';ld.style.display='none';c.querySelectorAll('.mi').forEach(e=>e.remove());return}
  em.style.display='none';ld.style.display=ch.hasMore?'block':'none';
  c.querySelectorAll('.mi').forEach(e=>e.remove());
  const wasBottom=c.scrollHeight-c.scrollTop-c.clientHeight<60;
  const prevH=c.scrollHeight;
  ch.msgs.forEach(m=>{c.appendChild(mkMsg(m))});
  if(prepend){c.scrollTop=c.scrollHeight-prevH}else if(wasBottom||!prepend){c.scrollTop=c.scrollHeight}
}

function mkMsg(m){
  const d=document.createElement('div');d.className='mi';d.dataset.id=m.id;
  d.innerHTML=\`<div style="flex:1;min-width:0">
    <div class="mc">\${esc(m.content)}</div>
    <div class="mm"><span class="mt">\${fmtT(m.created_at)}</span>
      <div class="ma">
        <button class="mb" onclick="cpMsg(\${m.id})" title="复制">\uD83D\uDCCB</button>
        <button class="mb dl" onclick="delMsg(\${m.id})" title="删除">\uD83D\uDDD1</button>
      </div>
    </div></div>\`;
  return d;
}

async function sendMsg(){
  const ch=chs[ach];if(!ch)return;
  const ta=ch.el.querySelector('textarea'),v=ta.value.trim();
  if(!v)return;
  const btn=ch.el.querySelector('.sbtn');btn.disabled=true;
  try{
    const r=await fetch('/api/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({content:v,channel:ch.name})});
    const d=await r.json();
    if(!r.ok){toast(d.error||'发送失败','er');return}
    addMsgToCh(ach,d.message);ta.value='';ta.style.height='auto';
  }catch(e){toast('网络错误','er')}finally{btn.disabled=false;ta.focus()}
}

function addMsgToCh(idx,m){
  const ch=chs[idx];if(!ch)return;
  if(ch.msgs.find(x=>x.id===m.id))return;
  ch.msgs.push(m);
  const c=ch.el.querySelector('.msgs');c.querySelector('.empty').style.display='none';
  c.appendChild(mkMsg(m));c.scrollTop=c.scrollHeight;
}

async function delMsg(id){
  try{
    const r=await fetch('/api/messages/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
    if(r.ok){rmMsg(id);toast('已删除','ok')}
  }catch(e){toast('删除失败','er')}
}

function rmMsg(id){
  chs.forEach((ch,i)=>{ch.msgs=ch.msgs.filter(m=>m.id!==id);renderMsgs(i)})
}

function cpMsg(id){
  for(const ch of chs){const m=ch.msgs.find(x=>x.id===id);if(m){navigator.clipboard.writeText(m.content).then(()=>toast('已复制','ok'));return}}
}

// === WebSocket ===
function connectWS(){
  if(ws)try{ws.close()}catch(e){}
  const proto=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(proto+'//'+location.host+'/ws');
  ws.onopen=()=>{
    ws.send(JSON.stringify({type:'auth',userId:uid}));
    upWS(true);
    ws._pi=setInterval(()=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'ping'}))},25000);
  };
  ws.onmessage=e=>{
    try{
      const d=JSON.parse(e.data);
      if(d.type==='new_message'&&d.message){const i=chs.findIndex(c=>c.name===d.message.channel);if(i>=0)addMsgToCh(i,d.message)}
      if(d.type==='delete_message'&&d.messageId)rmMsg(d.messageId);
    }catch(x){}
  };
  ws.onclose=()=>{upWS(false);if(ws._pi)clearInterval(ws._pi);if(token)setTimeout(connectWS,3000)};
  ws.onerror=()=>upWS(false);
}

function upWS(on){
  $('wss').innerHTML='<div class="dot'+(on?'':' off')+'"></div><span>'+(on?'已连接':'离线')+'</span>';
}

// === 工具 ===
function arz(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,200)+'px'}
function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML}
function fmtT(iso){
  if(!iso)return '';
  const d=new Date(iso.endsWith('Z')?iso:iso+'Z'),now=new Date();
  const td=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const md=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const t=d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  if(md.getTime()===td.getTime())return '今天 '+t;
  if(md.getTime()===td.getTime()-864e5)return '昨天 '+t;
  return d.toLocaleDateString('zh-CN',{month:'short',day:'numeric'})+' '+t;
}
function toast(msg,type='info'){
  const c=$('tc'),el=document.createElement('div');el.className='tt '+type;el.textContent=msg;
  c.appendChild(el);setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),300)},2500);
}
$('ap').addEventListener('keydown',e=>{if(e.key==='Enter')doAuth()});
</script>
</body>
</html>`;
}
