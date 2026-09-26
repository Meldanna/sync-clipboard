// Durable Object: WebSocket 实时同步房间
export class SyncRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // userId -> Set<WebSocket>
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 内部广播请求（从 API 调用）
    if (url.pathname === '/broadcast') {
      const data = await request.json();
      this.broadcast(data);
      return new Response('ok');
    }

    // WebSocket 升级
    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    let userId = null;

    server.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'auth') {
          userId = data.userId;
          if (!this.sessions.has(userId)) this.sessions.set(userId, new Set());
          this.sessions.get(userId).add(server);
          server.send(JSON.stringify({ type: 'auth_ok' }));
        }
        if (data.type === 'ping') {
          server.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {}
    });

    const cleanup = () => {
      if (userId && this.sessions.has(userId)) {
        this.sessions.get(userId).delete(server);
        if (this.sessions.get(userId).size === 0) this.sessions.delete(userId);
      }
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(data) {
    const uid = data.userId;
    if (!uid) return;
    const sockets = this.sessions.get(uid);
    if (!sockets) return;
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      try { ws.send(payload); } catch (e) { sockets.delete(ws); }
    }
  }
}
