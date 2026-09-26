// JWT + 密码哈希工具（纯 Web Crypto API，Cloudflare Workers 原生支持）

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(data) {
  if (typeof data === 'string') data = enc.encode(data);
  if (data instanceof ArrayBuffer) data = new Uint8Array(data);
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function getKey(secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify']
  );
}

export async function signJWT(payload, secret) {
  const key = await getKey(secret);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = header + '.' + body;
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return data + '.' + b64url(sig);
}

export async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const key = await getKey(secret);
  const sig = b64urlDecode(parts[2]);
  const valid = await crypto.subtle.verify('HMAC', key, sig, enc.encode(parts[0] + '.' + parts[1]));
  if (!valid) return null;
  const payload = JSON.parse(dec.decode(b64urlDecode(parts[1])));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256
  );
  return b64url(salt) + '.' + b64url(hash);
}

export async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = stored.split('.');
  const salt = b64urlDecode(saltB64);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256
  );
  return b64url(hash) === hashB64;
}

export async function extractUser(request, secret) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verifyJWT(auth.slice(7), secret);
}
