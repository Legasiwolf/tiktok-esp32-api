// api/tiktok.js

import fetch from 'node-fetch'; // чтобы делать запросы из функции

export default async function handler(request, response) {
  // Получаем параметр ?user=...
  const username = request.query.user;
  if (!username) {
    response.status(400).json({ error: 'missing user parameter' });
    return;
  }

  try {
    // Делаем HTTP GET на страницу TikTok
    const tiktokUrl = `https://www.tiktok.com/@${username}`;
    const resp = await fetch(tiktokUrl, {
      headers: {
        // Притворяемся обычным браузером, иначе TikTok даёт защиту
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!resp.ok) {
      response.status(resp.status).json({ error: 'failed to fetch TikTok page' });
      return;
    }

    const html = await resp.text();

    // Ищем в HTML: "followerCount":12345
    const re = /"followerCount":([0-9]+)/;
    const match = html.match(re);
    if (match && match[1]) {
      const count = parseInt(match[1], 10);
      response.status(200).json({ followerCount: count });
    } else {
      response
        .status(404)
        .json({ error: 'followerCount not found in TikTok HTML' });
    }
  } catch (e) {
    response.status(500).json({ error: 'internal error', details: e.message });
  }
}
