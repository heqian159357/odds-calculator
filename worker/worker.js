/**
 * Cloudflare Worker · The Odds API 代理
 * 作用：隐藏 API key、解决 CORS、精简返回给前端
 *
 * 部署后前端这样调用：
 *   列出赛事:  https://<worker>.workers.dev/sports
 *   取某赛事赔率: https://<worker>.workers.dev/odds?sport=soccer_fifa_world_cup&regions=eu&markets=h2h,totals
 *
 * API key 存在 Worker 的环境变量 ODDS_API_KEY（wrangler secret），不出现在前端。
 */

const ALLOW_ORIGIN = '*'; // 上线后可收紧为你的 GitHub Pages 域名

function cors(resp) {
  const h = new Headers(resp.headers);
  h.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(resp.body, { status: resp.status, headers: h });
}

function json(obj, status = 200) {
  return cors(new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json' }
  }));
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    const url = new URL(request.url);
    const key = env.ODDS_API_KEY;
    const base = 'https://api.the-odds-api.com/v4';

    // ===== API-Football 路由（伤停/阵容/交锋），需 env.APIFOOTBALL_KEY =====
    const AF = 'https://v3.football.api-sports.io';
    async function afFetch(path) {
      const r = await fetch(`${AF}${path}`, { headers: { 'x-apisports-key': env.APIFOOTBALL_KEY } });
      return r.json();
    }
    if (url.pathname.startsWith('/af/')) {
      if (!env.APIFOOTBALL_KEY) return json({ error: '未配置 APIFOOTBALL_KEY' }, 500);
      try {
        // /af/search?q=Spain  → 找球队 id
        if (url.pathname === '/af/team') {
          const q = url.searchParams.get('q') || '';
          const d = await afFetch(`/teams?search=${encodeURIComponent(q)}`);
          return json({ teams: (d.response || []).map(t => ({ id: t.team.id, name: t.team.name, country: t.team.country })) });
        }
        // /af/injuries?team=9&season=2026&league=1 → 伤停
        if (url.pathname === '/af/injuries') {
          const team = url.searchParams.get('team'), season = url.searchParams.get('season') || '2026';
          const d = await afFetch(`/injuries?team=${team}&season=${season}`);
          return json({ injuries: (d.response || []).map(x => ({ player: x.player.name, reason: x.player.reason, type: x.player.type })) });
        }
        // /af/h2h?h=9&a=2 → 历史交锋
        if (url.pathname === '/af/h2h') {
          const h = url.searchParams.get('h'), a = url.searchParams.get('a');
          const d = await afFetch(`/fixtures/headtohead?h2h=${h}-${a}&last=10`);
          return json({ h2h: (d.response || []).map(f => ({
            date: f.fixture.date, home: f.teams.home.name, away: f.teams.away.name,
            score: `${f.goals.home}-${f.goals.away}` })) });
        }
        return json({ error: '未知 /af/ 路由' }, 404);
      } catch (e) { return json({ error: String(e) }, 500); }
    }

    if (!key) return json({ error: '未配置 ODDS_API_KEY，请用 wrangler secret 设置' }, 500);

    try {
      // 路由1：列出所有运动/赛事
      if (url.pathname === '/sports') {
        const r = await fetch(`${base}/sports/?apiKey=${key}`);
        const data = await r.json();
        // 只返回足球相关，精简
        const soccer = Array.isArray(data) ? data.filter(s => s.group === 'Soccer') : data;
        return json({ remaining: r.headers.get('x-requests-remaining'), sports: soccer });
      }

      // 路由2：取指定赛事的赔率
      if (url.pathname === '/odds') {
        const sport = url.searchParams.get('sport') || 'soccer_fifa_world_cup';
        const regions = url.searchParams.get('regions') || 'eu';       // eu=欧洲盘(十进制赔率)
        const markets = url.searchParams.get('markets') || 'h2h,totals,spreads'; // h2h=胜平负, totals=大小球, spreads=亚盘让球
        const q = `${base}/sports/${sport}/odds/?apiKey=${key}&regions=${regions}&markets=${markets}&oddsFormat=decimal`;
        const r = await fetch(q);
        if (!r.ok) return json({ error: 'Odds API 返回错误', status: r.status, detail: await r.text() }, r.status);
        const data = await r.json();
        return json({
          remaining: r.headers.get('x-requests-remaining'),
          used: r.headers.get('x-requests-used'),
          matches: data,
        });
      }

      // 默认：使用说明
      return json({
        service: 'The Odds API 代理 (Cloudflare Worker)',
        endpoints: {
          '/sports': '列出所有足球赛事的 sport key',
          '/odds?sport=<key>&regions=eu&markets=h2h,totals': '取某赛事所有比赛的赔率',
        },
      });
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },
};
