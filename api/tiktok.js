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
    // 2) Запрашиваем страницу пользователя TikTok
    //    Добавляем lang=en для консистентности
    const tiktokUrl = `https://www.tiktok.com/@${username}?lang=en`;
    const resp = await fetch(tiktokUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/115.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      cache: 'no-store'
    });

    if (!resp.ok) {
      response.status(resp.status).json({ error: 'failed to fetch TikTok page' });
      return;
    }

    // 3) Читаем весь HTML
    const html = await resp.text();

    // 4) Пытаемся извлечь JSON из <script id="SIGI_STATE">…</script>
    const sigiRegex = /<script\s+id="SIGI_STATE"\s+type="application\/json">([^<]+)<\/script>/;
    const sigiMatch = html.match(sigiRegex);

    if (sigiMatch && sigiMatch[1]) {
      let sigiJson;
      try {
        sigiJson = JSON.parse(sigiMatch[1]);
      } catch (parseErr) {
        // Если JSON внутри SIGI_STATE испорчен или неожиданного вида
        // Переходим к резервному способу
        sigiJson = null;
      }

      if (sigiJson) {
        // Новый путь может быть: sigiJson.UserModule.users[username].stats.followerCount
        // Некоторые версии TikTok кладут данные в sigiJson.ItemModule или sigiJson.UserPage
        let count = null;

        // Попробуем сразу несколько вариантов поиска:
        // Вариант A: стандартный путь UserModule.users[username].stats.followerCount
        if (
          sigiJson.UserModule &&
          sigiJson.UserModule.users &&
          sigiJson.UserModule.users[username] &&
          sigiJson.UserModule.users[username].stats &&
          typeof sigiJson.UserModule.users[username].stats.followerCount === 'number'
        ) {
          count = sigiJson.UserModule.users[username].stats.followerCount;
        }

        // Вариант B: иногда TikTok кладёт данные в ItemModule (для видео),
        // но нам нужен именно профиль → обычно не актуально для followerCount.
        // Поэтому можно не рассматривать ItemModule в данном контексте.

        // Вариант C: в некоторых локализациях путь находится в sigiJson.UserPage,
        // но чаще всего ProfilePage содержит stats внутри state
        if (
          count === null &&
          sigiJson.UserPage &&
          sigiJson.UserPage[username] &&
          sigiJson.UserPage[username].stats &&
          typeof sigiJson.UserPage[username].stats.followerCount === 'number'
        ) {
          count = sigiJson.UserPage[username].stats.followerCount;
        }

        if (count !== null) {
          response.status(200).json({ followerCount: count });
          return;
        }
      }
    }

    // 5) Если SIGI_STATE не сработал (нет мачей или неправильная структура),
    //    пробуем резервный вариант: regex по "userInfo":{"id":"…","uniqueId":"username","stats":{"followerCount":12345,…}}
    const userInfoRegex = new RegExp(
      `"userInfo":\\{[^}]*"uniqueId":"${username}"[^}]*"stats":\\{[^}]*"followerCount":(\\d+)`,
      'i'
    );
    const userInfoMatch = html.match(userInfoRegex);

    if (userInfoMatch && userInfoMatch[1]) {
      const fallbackCount = parseInt(userInfoMatch[1], 10);
      response.status(200).json({ followerCount: fallbackCount });
      return;
    }

    // 6) Если ни один метод не нашёл followerCount
    response.status(404).json({
      error: 'followerCount not found',
      detail: {
        sigiAttempt: sigiMatch ? 'found SIGI_STATE tag but path mismatch' : 'no SIGI_STATE tag',
        userInfoAttempt: userInfoMatch ? 'found userInfo but regex failed' : 'no userInfo match'
      }
    });

  } catch (e) {
    response.status(500).json({ error: 'internal error', details: e.message });
  }
}
