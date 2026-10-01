// =============================================
// SyncBoard v1.2 - 单文件版本
// 标签页持久化 + 亮暗主题切换 + 轮询同步
// =============================================

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(data) {
  if (typeof data === 'string') data = enc.encode(data);
  if (data instanceof ArrayBuffer) data = new Uint8Array(data);
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDec(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function signJWT(payload, secret) {
  const key = await hmacKey(secret);
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const b = b64url(JSON.stringify(payload));
  const d = h + '.' + b;
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(d));
  return d + '.' + b64url(sig);
}
async function verifyJWT(token, secret) {
  const p = token.split('.'); if (p.length !== 3) return null;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify('HMAC', key, b64urlDec(p[2]), enc.encode(p[0] + '.' + p[1]));
  if (!valid) return null;
  const payload = JSON.parse(dec.decode(b64urlDec(p[1])));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
async function hashPw(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return b64url(salt) + '.' + b64url(hash);
}
async function verifyPw(password, stored) {
  const [sB, hB] = stored.split('.');
  const salt = b64urlDec(sB);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return b64url(hash) === hB;
}
async function getUser(request, secret) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verifyJWT(auth.slice(7), secret);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return json({ ok: true });

    if (path === '/api/register' && method === 'POST') {
      try {
        const { username, password } = await request.json();
        if (!username || !password) return json({ error: '用户名和密码不能为空' }, 400);
        if (username.length < 2 || username.length > 20) return json({ error: '用户名 2-20 字符' }, 400);
        if (password.length < 6) return json({ error: '密码至少 6 位' }, 400);
        const exist = await env.DB.prepare('SELECT id FROM users WHERE username=?').bind(username).first();
        if (exist) return json({ error: '用户名已存在' }, 409);
        const ph = await hashPw(password);
        const r = await env.DB.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)').bind(username, ph).run();
        const token = await signJWT({ uid: r.meta.last_row_id, username, exp: Math.floor(Date.now() / 1000) + 86400 * 30 }, env.JWT_SECRET);
        return json({ ok: true, token, username });
      } catch (e) { return json({ error: '注册失败: ' + e.message }, 500); }
    }

    if (path === '/api/login' && method === 'POST') {
      try {
        const { username, password } = await request.json();
        if (!username || !password) return json({ error: '请输入用户名和密码' }, 400);
        const user = await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
        if (!user) return json({ error: '用户不存在' }, 404);
        if (!(await verifyPw(password, user.password_hash))) return json({ error: '密码错误' }, 401);
        const token = await signJWT({ uid: user.id, username, exp: Math.floor(Date.now() / 1000) + 86400 * 30 }, env.JWT_SECRET);
        return json({ ok: true, token, username });
      } catch (e) { return json({ error: '登录失败: ' + e.message }, 500); }
    }

    if (path.startsWith('/api/')) {
      const user = await getUser(request, env.JWT_SECRET);
      if (!user) return json({ error: '未登录或已过期' }, 401);

      if (path === '/api/messages' && method === 'POST') {
        try {
          const { content, channel } = await request.json();
          if (!content || !content.trim()) return json({ error: '内容不能为空' }, 400);
          if (content.length > 50000) return json({ error: '内容过长' }, 400);
          const ch = (channel || 'default').slice(0, 50);
          const r = await env.DB.prepare('INSERT INTO messages(user_id,content,channel) VALUES(?,?,?)').bind(user.uid, content.trim(), ch).run();
          return json({ ok: true, message: { id: r.meta.last_row_id, content: content.trim(), channel: ch, created_at: new Date().toISOString() } });
        } catch (e) { return json({ error: '发送失败: ' + e.message }, 500); }
      }

      if (path === '/api/messages' && method === 'GET') {
        try {
          const ch = url.searchParams.get('channel') || 'default';
          const before = url.searchParams.get('before');
          const after = url.searchParams.get('after');
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
          let results;
          if (after) {
            results = (await env.DB.prepare('SELECT * FROM messages WHERE user_id=? AND channel=? AND id>? ORDER BY id ASC LIMIT ?').bind(user.uid, ch, parseInt(after), limit).all()).results;
          } else if (before) {
            results = (await env.DB.prepare('SELECT * FROM messages WHERE user_id=? AND channel=? AND id<? ORDER BY id DESC LIMIT ?').bind(user.uid, ch, parseInt(before), limit).all()).results;
          } else {
            results = (await env.DB.prepare('SELECT * FROM messages WHERE user_id=? AND channel=? ORDER BY id DESC LIMIT ?').bind(user.uid, ch, limit).all()).results;
          }
          return json({ ok: true, messages: results, hasMore: results.length === limit });
        } catch (e) { return json({ error: e.message }, 500); }
      }

      if (path.match(/^\/api\/messages\/\d+$/) && method === 'DELETE') {
        try {
          const id = parseInt(path.split('/').pop());
          await env.DB.prepare('DELETE FROM messages WHERE id=? AND user_id=?').bind(id, user.uid).run();
          return json({ ok: true });
        } catch (e) { return json({ error: e.message }, 500); }
      }

      if (path === '/api/poll' && method === 'GET') {
        try {
          const ch = url.searchParams.get('channel') || 'default';
          const r = await env.DB.prepare('SELECT MAX(id) as latest FROM messages WHERE user_id=? AND channel=?').bind(user.uid, ch).first();
          return json({ ok: true, latest: r?.latest || 0 });
        } catch (e) { return json({ error: e.message }, 500); }
      }

      return json({ error: 'Not Found' }, 404);
    }

    return new Response(HTML, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  },
};

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>SyncBoard</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root,html[data-theme="dark"]{
  --bg:#0a0a0f;--sf:#12121a;--sf2:#1a1a26;--bd:#2a2a3e;--bd2:#363650;
  --tx:#e4e4f0;--tx2:#9090b0;
  --pr:#6c5ce7;--pr2:#8577ed;--prb:rgba(108,92,231,.12);
  --dg:#ff6b6b;--dgb:rgba(255,107,107,.12);
  --ok:#51cf66;--okb:rgba(81,207,102,.12);
  --r:12px;--rs:8px;--shadow:0 20px 60px rgba(0,0,0,.5);--card-shadow:0 8px 24px rgba(0,0,0,.3)
}
html[data-theme="light"]{
  --bg:#f0f2f5;--sf:#ffffff;--sf2:#f5f6f8;--bd:#e0e2e8;--bd2:#d0d2d8;
  --tx:#1a1a2e;--tx2:#6b7280;
  --pr:#6c5ce7;--pr2:#5a4bd1;--prb:rgba(108,92,231,.08);
  --dg:#e55050;--dgb:rgba(229,80,80,.08);
  --ok:#2f9e44;--okb:rgba(47,158,68,.08);
  --shadow:0 20px 60px rgba(0,0,0,.1);--card-shadow:0 8px 24px rgba(0,0,0,.06)
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--tx);min-height:100dvh;overflow:hidden;transition:background .3s,color .3s}
.ao{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;z-index:1000;transition:opacity .3s,background .3s}
.ao.h{opacity:0;pointer-events:none}
.ac{background:var(--sf);border:1px solid var(--bd);border-radius:20px;padding:40px 36px;width:min(400px,90vw);box-shadow:var(--shadow);transition:background .3s,border-color .3s}
.ac h1{font-size:28px;text-align:center;margin-bottom:6px;background:linear-gradient(135deg,var(--pr),#a29bfe);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.ac .sub{text-align:center;color:var(--tx2);font-size:14px;margin-bottom:32px}
.ac .f{margin-bottom:18px}
.ac label{display:block;font-size:13px;color:var(--tx2);margin-bottom:6px;font-weight:500}
.ac input{width:100%;padding:12px 16px;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--rs);color:var(--tx);font-size:15px;outline:none;transition:all .3s}
.ac input:focus{border-color:var(--pr)}
.bp{width:100%;padding:13px;background:var(--pr);color:#fff;border:none;border-radius:var(--rs);font-size:15px;font-weight:600;cursor:pointer;transition:all .2s;margin-top:8px}
.bp:hover{background:var(--pr2)}.bp:disabled{opacity:.5;cursor:not-allowed}
.ac .sw{text-align:center;margin-top:20px;font-size:13px;color:var(--tx2)}
.ac .sw a{color:var(--pr);cursor:pointer;text-decoration:none;font-weight:500}
.ac .er{color:var(--dg);font-size:13px;text-align:center;margin-top:12px;min-height:18px}
.app{display:flex;flex-direction:column;height:100dvh}
.top{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:var(--sf);border-bottom:1px solid var(--bd);flex-shrink:0;gap:12px;transition:all .3s}
.top .logo{font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px;white-space:nowrap}
.top .logo span{background:linear-gradient(135deg,var(--pr),#a29bfe);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.tr{display:flex;align-items:center;gap:8px}
.bs{padding:6px 14px;font-size:12px;border:1px solid var(--bd);border-radius:var(--rs);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:all .2s;white-space:nowrap}
.bs:hover{border-color:var(--pr);color:var(--pr)}
.bs.dg:hover{border-color:var(--dg);color:var(--dg)}
.theme-btn{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:1px solid var(--bd);border-radius:var(--rs);background:var(--sf2);cursor:pointer;font-size:16px;transition:all .2s;flex-shrink:0}
.theme-btn:hover{border-color:var(--pr);background:var(--prb)}
.tabs{display:flex;align-items:center;background:var(--sf);border-bottom:1px solid var(--bd);padding:0 12px;flex-shrink:0;overflow-x:auto;gap:2px;min-height:40px;transition:all .3s}
.tabs::-webkit-scrollbar{display:none}
.tab{display:flex;align-items:center;gap:6px;padding:8px 16px;font-size:13px;color:var(--tx2);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap;flex-shrink:0;user-select:none}
.tab:hover{color:var(--tx)}
.tab.on{color:var(--pr);border-bottom-color:var(--pr)}
.tab .x{width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:14px;opacity:0;transition:all .15s}
.tab:hover .x{opacity:.6}
.tab .x:hover{opacity:1;background:var(--dgb);color:var(--dg)}
.at{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:6px;color:var(--tx2);cursor:pointer;font-size:18px;transition:all .2s;flex-shrink:0}
.at:hover{background:var(--prb);color:var(--pr)}
.mn{flex:1;overflow:hidden;position:relative}
.cv{position:absolute;inset:0;display:flex;flex-direction:column;transition:opacity .15s}
.cv.hide{opacity:0;pointer-events:none;z-index:0}.cv.on{opacity:1;z-index:1}
.ms{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:8px}
.ms::-webkit-scrollbar{width:6px}.ms::-webkit-scrollbar-track{background:transparent}.ms::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}
.ldm{text-align:center;padding:8px}
.ldm button{padding:6px 20px;font-size:12px;border:1px solid var(--bd);border-radius:var(--rs);background:var(--sf2);color:var(--tx2);cursor:pointer;transition:all .2s}
.ldm button:hover{border-color:var(--pr);color:var(--pr)}
.mi{display:flex;padding:12px 16px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--r);transition:all .2s;animation:si .2s ease}
.mi:hover{border-color:var(--bd2);background:var(--sf2)}
.mc{flex:1;font-size:14px;line-height:1.7;word-break:break-all;white-space:pre-wrap}
.mm{display:flex;align-items:center;justify-content:space-between;margin-top:6px}
.mt{font-size:11px;color:var(--tx2)}
.ma{display:flex;gap:4px;opacity:0;transition:opacity .15s}
.mi:hover .ma{opacity:1}
.mb{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--tx2);cursor:pointer;border-radius:6px;font-size:14px;transition:all .15s}
.mb:hover{background:var(--prb);color:var(--pr)}
.mb.dl:hover{background:var(--dgb);color:var(--dg)}
.ey{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--tx2);gap:12px}
.ey .ic{font-size:48px;opacity:.5}.ey p{font-size:14px}
.ia{padding:12px 20px;background:var(--sf);border-top:1px solid var(--bd);flex-shrink:0;transition:all .3s}
.ir{display:flex;gap:10px;align-items:flex-end}
.ir textarea{flex:1;padding:12px 16px;background:var(--sf2);border:1px solid var(--bd);border-radius:var(--r);color:var(--tx);font-size:14px;line-height:1.6;resize:none;outline:none;min-height:48px;max-height:200px;font-family:inherit;transition:all .3s}
.ir textarea:focus{border-color:var(--pr)}
.ir textarea::placeholder{color:var(--tx2)}
.sb{width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:var(--pr);border:none;border-radius:var(--r);color:#fff;cursor:pointer;font-size:20px;transition:all .2s;flex-shrink:0}
.sb:hover{background:var(--pr2)}.sb:disabled{opacity:.4;cursor:not-allowed}
.ih{font-size:11px;color:var(--tx2);margin-top:6px;text-align:right}
.tc{position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px}
.tt{padding:12px 20px;border-radius:var(--rs);font-size:13px;animation:sr .3s ease;box-shadow:var(--card-shadow)}
.tt.ok{background:var(--okb);color:var(--ok);border:1px solid rgba(81,207,102,.2)}
.tt.er{background:var(--dgb);color:var(--dg);border:1px solid rgba(255,107,107,.2)}
.tt.info{background:var(--prb);color:var(--pr2);border:1px solid rgba(108,92,231,.2)}
@keyframes si{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes sr{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
@media(max-width:600px){.top{padding:10px 14px}.ms{padding:12px 14px}.ia{padding:10px 14px}.mi{padding:10px 12px}.mi .ma{opacity:1}.ac{padding:28px 24px}}
</style>
</head>
<body>
<div class="ao" id="ao">
  <div class="ac">
    <h1>⚡ SyncBoard</h1>
    <p class="sub">跨端实时消息同步</p>
    <div class="f"><label>用户名</label><input type="text" id="au" placeholder="输入用户名" maxlength="20"></div>
    <div class="f"><label>密码</label><input type="password" id="ap" placeholder="输入密码"></div>
    <button class="bp" id="ab" onclick="doAuth()">登 录</button>
    <div class="er" id="ae"></div>
    <div class="sw" id="as">还没有帐号？<a onclick="toggleMode()">注册</a></div>
  </div>
</div>
<div class="app" id="app" style="display:none">
  <div class="top">
    <div class="logo">⚡ <span>SyncBoard</span></div>
    <div class="tr">
      <span style="font-size:12px;color:var(--tx2)" id="st">●</span>
      <button class="theme-btn" id="themeBtn" onclick="toggleTheme()" title="切换主题">🌙</button>
      <button class="bs" id="ul">user</button>
      <button class="bs dg" onclick="logout()">退出</button>
    </div>
  </div>
  <div class="tabs" id="tb"><div class="at" onclick="addTab()" title="新窗口">＋</div></div>
  <div class="mn" id="mn"></div>
</div>
<div class="tc" id="tc"></div>
<script>
let tk=localStorage.getItem('tk'),un=localStorage.getItem('un'),uid=null,mode='login',chs=[],ach=0,polls={};

// ===== 主题 =====
function initTheme(){const s=localStorage.getItem('theme');if(s){setTheme(s)}else{setTheme(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')}}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);localStorage.setItem('theme',t);const b=document.getElementById('themeBtn');if(b)b.textContent=t==='dark'?'☀️':'🌙';}
function toggleTheme(){const c=document.documentElement.getAttribute('data-theme')||'dark';setTheme(c==='dark'?'light':'dark');}
initTheme();
window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',e=>{if(!localStorage.getItem('theme'))setTheme(e.matches?'dark':'light')});

// ===== 标签页持久化 =====
function saveTabs(){localStorage.setItem('tabs',JSON.stringify({tabs:chs.map(c=>c.n),active:ach}));}
function loadSavedTabs(){try{const r=localStorage.getItem('tabs');return r?JSON.parse(r):null}catch(e){return null}}

// ===== 初始化 =====
if(tk&&un){try{uid=JSON.parse(atob(tk.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).uid}catch(e){tk=null}}
if(tk)showApp();else G('ao').classList.remove('h');

function G(id){return document.getElementById(id)}
function toggleMode(){mode=mode==='login'?'register':'login';G('ab').textContent=mode==='login'?'登 录':'注 册';G('as').innerHTML=mode==='login'?'还没有帐号？<a onclick="toggleMode()">注册</a>':'已有帐号？<a onclick="toggleMode()">登录</a>';G('ae').textContent='';}

async function doAuth(){
  const u=G('au').value.trim(),p=G('ap').value,e=G('ae'),b=G('ab');e.textContent='';
  if(!u||!p){e.textContent='请填写完整';return}b.disabled=true;
  try{const r=await fetch(mode==='login'?'/api/login':'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});const d=await r.json();if(!r.ok){e.textContent=d.error||'失败';return}tk=d.token;un=d.username;uid=JSON.parse(atob(tk.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).uid;localStorage.setItem('tk',tk);localStorage.setItem('un',un);showApp();toast(mode==='login'?'登录成功':'注册成功','ok');
  }catch(x){e.textContent='网络错误'}finally{b.disabled=false}
}

function logout(){
  tk=un=uid=null;
  localStorage.removeItem('tk');localStorage.removeItem('un');localStorage.removeItem('tabs');
  Object.values(polls).forEach(clearInterval);polls={};chs=[];
  G('mn').innerHTML='';G('tb').querySelectorAll('.tab').forEach(t=>t.remove());
  G('app').style.display='none';G('ao').classList.remove('h');
  G('au').value='';G('ap').value='';
}

function showApp(){
  G('ao').classList.add('h');G('app').style.display='flex';G('ul').textContent=un;
  const saved=loadSavedTabs();
  if(saved&&saved.tabs&&saved.tabs.length>0){
    saved.tabs.forEach(function(name){addTab(name,true)});
    swTab(Math.min(saved.active||0,chs.length-1));
  }else{
    addTab('default',true);
  }
}

// ===== 标签页 =====
function addTab(name,silent){
  if(!name&&!silent){
    const n=prompt('频道名称','ch-'+(chs.length+1));
    if(!n)return;
    name=n.trim().replace(/[^a-zA-Z0-9_-]/g,'')||'ch-'+(chs.length+1);
  }
  if(!name)name='default';
  const ei=chs.findIndex(c=>c.n===name);
  if(ei>=0){swTab(ei);return;}
  const ch={n:name,msgs:[],hm:true,old:null,el:null,lat:0};
  chs.push(ch);buildV(ch);renderTabs();swTab(chs.length-1);loadM(chs.length-1);startPoll(chs.length-1);
  saveTabs();
}

function closeTab(i,ev){
  if(ev)ev.stopPropagation();if(chs.length<=1)return;
  if(polls[chs[i].n]){clearInterval(polls[chs[i].n]);delete polls[chs[i].n];}
  if(chs[i].el)chs[i].el.remove();
  chs.splice(i,1);
  if(ach>=chs.length)ach=chs.length-1;
  renderTabs();swTab(ach);
  saveTabs();
}

function swTab(i){
  ach=i;
  chs.forEach((c,j)=>{if(c.el){c.el.classList.toggle('on',j===i);c.el.classList.toggle('hide',j!==i)}});
  renderTabs();
  const ta=chs[i]?.el?.querySelector('textarea');
  if(ta)setTimeout(()=>ta.focus(),50);
  saveTabs();
}

function renderTabs(){
  const bar=G('tb'),add=bar.querySelector('.at');
  bar.querySelectorAll('.tab').forEach(t=>t.remove());
  chs.forEach((c,i)=>{
    const t=document.createElement('div');
    t.className='tab'+(i===ach?' on':'');
    t.onclick=()=>swTab(i);
    t.innerHTML=(c.n==='default'?'📋 默认':'📁 '+c.n)+(chs.length>1?'<span class="x" onclick="closeTab('+i+',event)">×</span>':'');
    bar.insertBefore(t,add);
  });
}

function buildV(ch){
  const v=document.createElement('div');v.className='cv hide';
  v.innerHTML='<div class="ms"><div class="ldm" style="display:none"><button onclick="loadMore()">加载更早消息</button></div><div class="ey"><div class="ic">📝</div><p>发送你的第一条消息</p></div></div><div class="ia"><div class="ir"><textarea rows="1" placeholder="输入消息… (Ctrl+Enter 发送)" oninput="arz(this)"></textarea><button class="sb" onclick="sendM()">↑</button></div><div class="ih">Ctrl + Enter 发送</div></div>';
  v.querySelector('textarea').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();sendM();}});
  const ml=v.querySelector('.ms');
  ml.addEventListener('scroll',()=>{if(ml.scrollTop<50){const idx=chs.indexOf(ch);if(idx>=0&&ch.hm)loadM(idx,true);}});
  ch.el=v;G('mn').appendChild(v);
}

// ===== 消息 =====
async function loadM(idx,older=false){
  const ch=chs[idx];if(!ch||(!older&&ch.msgs.length>0)||(older&&!ch.hm))return;
  const p=new URLSearchParams({channel:ch.n,limit:'20'});
  if(older&&ch.old)p.set('before',ch.old);
  try{
    const r=await fetch('/api/messages?'+p,{headers:{Authorization:'Bearer '+tk}});
    const d=await r.json();
    if(!r.ok){if(r.status===401)logout();return;}
    ch.hm=d.hasMore;
    if(d.messages.length){const nm=d.messages.reverse();ch.msgs=older?[...nm,...ch.msgs]:nm;ch.old=ch.msgs[0]?.id;ch.lat=Math.max(ch.lat,...ch.msgs.map(m=>m.id));}
    renderM(idx,older);
  }catch(e){toast('加载失败','er');}
}
function loadMore(){loadM(ach,true);}

function renderM(idx,prep=false){
  const ch=chs[idx];if(!ch?.el)return;
  const c=ch.el.querySelector('.ms'),em=c.querySelector('.ey'),ld=c.querySelector('.ldm');
  if(!ch.msgs.length){em.style.display='flex';ld.style.display='none';c.querySelectorAll('.mi').forEach(e=>e.remove());return;}
  em.style.display='none';ld.style.display=ch.hm?'block':'none';
  c.querySelectorAll('.mi').forEach(e=>e.remove());
  const wb=c.scrollHeight-c.scrollTop-c.clientHeight<60;const ph=c.scrollHeight;
  ch.msgs.forEach(m=>c.appendChild(mkM(m)));
  if(prep)c.scrollTop=c.scrollHeight-ph;else if(wb||!prep)c.scrollTop=c.scrollHeight;
}

function mkM(m){
  const d=document.createElement('div');d.className='mi';d.dataset.id=m.id;
  d.innerHTML='<div style="flex:1;min-width:0"><div class="mc">'+esc(m.content)+'</div><div class="mm"><span class="mt">'+fmtT(m.created_at)+'</span><div class="ma"><button class="mb" onclick="cpM('+m.id+')" title="复制">📋</button><button class="mb dl" onclick="delM('+m.id+')" title="删除">🗑</button></div></div></div>';
  return d;
}

async function sendM(){
  const ch=chs[ach];if(!ch)return;
  const ta=ch.el.querySelector('textarea'),v=ta.value.trim();if(!v)return;
  const btn=ch.el.querySelector('.sb');btn.disabled=true;
  try{
    const r=await fetch('/api/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tk},body:JSON.stringify({content:v,channel:ch.n})});
    const d=await r.json();
    if(!r.ok){toast(d.error||'发送失败','er');return;}
    addM(ach,d.message);ta.value='';ta.style.height='auto';
  }catch(e){toast('网络错误','er');}finally{btn.disabled=false;ta.focus();}
}

function addM(idx,m){
  const ch=chs[idx];if(!ch||ch.msgs.find(x=>x.id===m.id))return;
  ch.msgs.push(m);ch.lat=Math.max(ch.lat,m.id);
  const c=ch.el.querySelector('.ms');c.querySelector('.ey').style.display='none';
  c.appendChild(mkM(m));c.scrollTop=c.scrollHeight;
}

async function delM(id){
  try{const r=await fetch('/api/messages/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+tk}});
  if(r.ok){chs.forEach((ch,i)=>{ch.msgs=ch.msgs.filter(m=>m.id!==id);renderM(i);});toast('已删除','ok');}
  }catch(e){toast('删除失败','er');}
}
function cpM(id){for(const ch of chs){const m=ch.msgs.find(x=>x.id===id);if(m){navigator.clipboard.writeText(m.content).then(()=>toast('已复制','ok'));return;}}}

// ===== 轮询 =====
function startPoll(idx){
  const ch=chs[idx];if(polls[ch.n])return;
  polls[ch.n]=setInterval(async()=>{
    if(!tk)return;
    try{
      const r=await fetch('/api/messages?channel='+ch.n+'&after='+ch.lat+'&limit=20',{headers:{Authorization:'Bearer '+tk}});
      const d=await r.json();
      if(d.ok&&d.messages.length){d.messages.forEach(m=>addM(idx,m));}
    }catch(e){}
  },2000);
}

// ===== 工具 =====
function arz(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,200)+'px';}
function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function fmtT(iso){if(!iso)return'';const d=new Date(iso.endsWith('Z')?iso:iso+'Z'),n=new Date(),td=new Date(n.getFullYear(),n.getMonth(),n.getDate()),md=new Date(d.getFullYear(),d.getMonth(),d.getDate()),t=d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});if(md.getTime()===td.getTime())return'今天 '+t;if(md.getTime()===td.getTime()-864e5)return'昨天 '+t;return d.toLocaleDateString('zh-CN',{month:'short',day:'numeric'})+' '+t;}
function toast(msg,type='info'){const c=G('tc'),el=document.createElement('div');el.className='tt '+type;el.textContent=msg;c.appendChild(el);setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),300);},2500);}
G('ap').addEventListener('keydown',e=>{if(e.key==='Enter')doAuth();});
G('au').addEventListener('keydown',e=>{if(e.key==='Enter')G('ap').focus();});
</script>
</body>
</html>`;
