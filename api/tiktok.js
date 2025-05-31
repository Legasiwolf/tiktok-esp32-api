// api/tiktok.js

import fetch from 'node-fetch';

export default async function handler(request, response) {
  // 1) Проверяем, передан ли параметр ?user=...
  const username = request.query.user;
  if (!username) {
    response.status(400).json({ error: 'missing user parameter' });
    return;
  }

  try {
    // 2) Делаем запрос на страницу пользователя TikTok
    //    Добавляем ?lang=en, чтобы получить HTML без лишних локализаций.
    const tiktokUrl = `https://www.tiktok.com/@${username}?lang=en`;
    const resp = await fetch(tiktokUrl, {
      headers: {
        // Обходим защиту, притворяясь браузером Chrome
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/115.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      // Чтобы не возвращался закешированный HTML
      cache: 'no-store'
    });

    if (!resp.ok) {
      // Если TikTok вернул 404 или 503, возвращаем ошибку дальше
      response.status(resp.status).json({ error: 'failed to fetch TikTok page' });
      return;
    }

    // 3) Читаем полностью HTML-страницу
    const html = await resp.text();

    // 4) Ищем JSON внутри <script id="SIGI_STATE">…</script>
    //    В этом JSON находятся данные о пользователе, в том числе followerCount
    const sigiRegex = /<script id="SIGI_STATE" type="application\/json">([^<]+)<\/script>/;
    const sigiMatch = html.match(sigiRegex);

    if (sigiMatch && sigiMatch[1]) {
      let sigiJson;
      try {
        sigiJson = JSON.parse(sigiMatch[1]);
      } catch (parseErr) {
        response.status(500).json({ error: 'invalid SIGI_STATE JSON', details: parseErr.message });
        return;
      }

      // Структура вложений: sigiJson.UserModule.users[username].stats.followerCount
      const userObj = sigiJson.UserModule
                        && sigiJson.UserModule.users
                        && sigiJson.UserModule.users[username];
      if (userObj && userObj.stats && typeof userObj.stats.followerCount === 'number') {
        const count = userObj.stats.followerCount;
        response.status(200).json({ followerCount: count });
        return;
      }
    }

    // 5) Если не удалось найти поле через SIGI_STATE, возвращаем 404
    response.status(404).json({ error: 'followerCount not found in SIGI_STATE' });

  } catch (e) {
    // Любые неожиданные ошибки
    response.status(500).json({ error: 'internal error', details: e.message });
  }
}
