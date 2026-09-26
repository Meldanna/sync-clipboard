import { handleApiRequest } from './api.js';
import { getHTML } from './frontend.js';

export { SyncRoom } from './sync-room.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // API
    if (url.pathname.startsWith('/api/')) {
      const res = await handleApiRequest(request, env, url);
      const h = new Headers(res.headers);
      Object.entries(corsHeaders()).forEach(([k, v]) => h.set(k, v));
      return new Response(res.body, { status: res.status, headers: h });
    }

    // WebSocket
    if (url.pathname === '/ws') {
      const id = env.SYNC_ROOM.idFromName('global');
      const room = env.SYNC_ROOM.get(id);
      return room.fetch(request);
    }

    // 前端页面
    return new Response(getHTML(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}
