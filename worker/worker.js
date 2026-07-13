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
    if (!key) return json({ error: '未配置 ODDS_API_KEY，请用 wrangler secret 设置' }, 500);

    const base = 'https://api.the-odds-api.com/v4';

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
