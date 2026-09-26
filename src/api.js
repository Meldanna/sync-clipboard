import { signJWT, hashPassword, verifyPassword, extractUser } from './auth.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleApiRequest(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  // ===== 注册 =====
  if (path === '/api/register' && method === 'POST') {
    try {
      const { username, password } = await request.json();
      if (!username || !password) return json({ error: '用户名和密码不能为空' }, 400);
      if (username.length < 2 || username.length > 20) return json({ error: '用户名长度 2-20' }, 400);
      if (password.length < 6) return json({ error: '密码至少6位' }, 400);

      const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
      if (existing) return json({ error: '用户名已被使用' }, 409);

      const pw_hash = await hashPassword(password);
      const result = await env.DB.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').bind(username, pw_hash).run();

      const token = await signJWT(
        { uid: result.meta.last_row_id, username, exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
        env.JWT_SECRET
      );
      return json({ ok: true, token, username });
    } catch (e) {
      return json({ error: '注册失败: ' + e.message }, 500);
    }
  }

  // ===== 登录 =====
  if (path === '/api/login' && method === 'POST') {
    try {
      const { username, password } = await request.json();
      if (!username || !password) return json({ error: '请输入用户名和密码' }, 400);

      const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
      if (!user) return json({ error: '用户不存在' }, 404);

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) return json({ error: '密码错误' }, 401);

      const token = await signJWT(
        { uid: user.id, username, exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
        env.JWT_SECRET
      );
      return json({ ok: true, token, username });
    } catch (e) {
      return json({ error: '登录失败: ' + e.message }, 500);
    }
  }

  // ===== 以下需要认证 =====
  const user = await extractUser(request, env.JWT_SECRET);
  if (!user) return json({ error: '未登录或Token已过期' }, 401);

  // ===== 发送消息 =====
  if (path === '/api/messages' && method === 'POST') {
    try {
      const { content, channel } = await request.json();
      if (!content || !content.trim()) return json({ error: '内容不能为空' }, 400);
      if (content.length > 50000) return json({ error: '内容过长' }, 400);
      const ch = (channel || 'default').slice(0, 50);

      const result = await env.DB.prepare(
        'INSERT INTO messages (user_id, content, channel) VALUES (?, ?, ?)'
      ).bind(user.uid, content.trim(), ch).run();

      const msg = { id: result.meta.last_row_id, content: content.trim(), channel: ch, created_at: new Date().toISOString() };

      // 广播给该用户的所有连接
      try {
        const roomId = env.SYNC_ROOM.idFromName('global');
        const room = env.SYNC_ROOM.get(roomId);
        await room.fetch(new Request('http://internal/broadcast', {
          method: 'POST',
          body: JSON.stringify({ type: 'new_message', userId: user.uid, username: user.username, message: msg }),
        }));
      } catch (e) {}

      return json({ ok: true, message: msg });
    } catch (e) {
      return json({ error: '发送失败: ' + e.message }, 500);
    }
  }

  // ===== 获取消息（游标分页） =====
  if (path === '/api/messages' && method === 'GET') {
    try {
      const channel = url.searchParams.get('channel') || 'default';
      const before = url.searchParams.get('before');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

      let results;
      if (before) {
        const r = await env.DB.prepare(
          'SELECT * FROM messages WHERE user_id = ? AND channel = ? AND id < ? ORDER BY id DESC LIMIT ?'
        ).bind(user.uid, channel, parseInt(before), limit).all();
        results = r.results;
      } else {
        const r = await env.DB.prepare(
          'SELECT * FROM messages WHERE user_id = ? AND channel = ? ORDER BY id DESC LIMIT ?'
        ).bind(user.uid, channel, limit).all();
        results = r.results;
      }
      return json({ ok: true, messages: results, hasMore: results.length === limit });
    } catch (e) {
      return json({ error: '获取失败: ' + e.message }, 500);
    }
  }

  // ===== 删除消息 =====
  if (path.match(/^\/api\/messages\/\d+$/) && method === 'DELETE') {
    try {
      const msgId = parseInt(path.split('/').pop());
      await env.DB.prepare('DELETE FROM messages WHERE id = ? AND user_id = ?').bind(msgId, user.uid).run();
      try {
        const roomId = env.SYNC_ROOM.idFromName('global');
        const room = env.SYNC_ROOM.get(roomId);
        await room.fetch(new Request('http://internal/broadcast', {
          method: 'POST',
          body: JSON.stringify({ type: 'delete_message', userId: user.uid, messageId: msgId }),
        }));
      } catch (e) {}
      return json({ ok: true });
    } catch (e) {
      return json({ error: '删除失败: ' + e.message }, 500);
    }
  }

  // ===== 频道列表 =====
  if (path === '/api/channels' && method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        'SELECT DISTINCT channel, COUNT(*) as count FROM messages WHERE user_id = ? GROUP BY channel ORDER BY MAX(created_at) DESC'
      ).bind(user.uid).all();
      return json({ ok: true, channels: results });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  return json({ error: 'Not Found' }, 404);
}
