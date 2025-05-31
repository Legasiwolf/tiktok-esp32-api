// api/tiktok.js

import fetch from 'node-fetch';

export default async function handler(request, response) {
  // 1) Берём параметр ?user=...
  const username = request.query.user;
  if (!username) {
    response.status(400).json({ error: 'missing user parameter' });
    return;
  }

  try {
    //--------------------------------------------------
    // 2) Делаем запрос к внутреннему TikTok API:
    //    https://www.tiktok.com/api/user/detail/?uniqueId=<username>
    //--------------------------------------------------
    const apiUrl = `https://www.tiktok.com/api/user/detail/?uniqueId=${username}`;

    // Заголовки нужны, чтобы TikTok не блокировал запрос
    const apiResp = await fetch(apiUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/115.0.0.0 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: `https://www.tiktok.com/@${username}`
      },
      redirect: 'follow',
      cache: 'no-store'
    });

    // Если TikTok вернул ошибку (403, 404 и т. д.), сразу отдадим её клиенту
    if (!apiResp.ok) {
      response.status(apiResp.status).json({
        error: `failed to fetch TikTok API (status ${apiResp.status})`
      });
      return;
    }

    // 3) Парсим JSON-ответ
    const json = await apiResp.json();

    // Путь к followerCount: json.userInfo.stats.followerCount
    if (
      json.userInfo &&
      json.userInfo.stats &&
      typeof json.userInfo.stats.followerCount === 'number'
    ) {
      const count = json.userInfo.stats.followerCount;
      response.status(200).json({ followerCount: count });
      return;
    } else {
      // Если структура неожиданная, вернём весь JSON для отладки
      response.status(404).json({
        error: 'followerCount not found in API response',
        detail: json
      });
      return;
    }
  } catch (err) {
    // 4) Ловим любые непредвиденные ошибки
    response.status(500).json({
      error: 'internal error',
      details: err.message
    });
  }
}
