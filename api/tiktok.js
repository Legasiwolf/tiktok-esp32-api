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
    // -------------------------------
    // СПОСОБ №1: ОФИЦИАЛЬНЫЙ NODE/SHARE/USER API
    // -------------------------------
    // Этот endpoint возвращает готовый JSON-объект с данными профиля.
    // Пример: https://www.tiktok.com/node/share/user/@CherryCraft0
    //
    const nodeUrl = `https://www.tiktok.com/node/share/user/@${username}`;
    const nodeResp = await fetch(nodeUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/115.0.0.0 Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      cache: 'no-store'
    });

    if (nodeResp.ok) {
      // Парсим JSON-ответ
      const nodeJson = await nodeResp.json();
      // Структура: nodeJson.userInfo.stats.followerCount
      if (
        nodeJson
        && nodeJson.userInfo
        && nodeJson.userInfo.stats
        && typeof nodeJson.userInfo.stats.followerCount === 'number'
      ) {
        // Успешно получили число
        const count = nodeJson.userInfo.stats.followerCount;
        response.status(200).json({ followerCount: count });
        return;
      }
      // Если JSON есть, но поля нет — фиксируем в debug:
      // fall through to следующий шаг
    }
    // Если nodeResp.ok === false — попробуем парсинг HTML далее

    // -------------------------------
    // СПОСОБ №2: ПАРСИНГ HTML (SIGI_STATE, NEXT_DATA, REGEX)
    // -------------------------------
    // Делаем HTTP-запрос самой страницы профиля, чтобы получить HTML
    const htmlResp = await fetch(`https://www.tiktok.com/@${username}?lang=en`, {
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

    if (!htmlResp.ok) {
      // Если HTML-страница не отдалась, возвращаем статус ошибки
      response.status(htmlResp.status).json({ error: 'failed to fetch TikTok page' });
      return;
    }

    const html = await htmlResp.text();

    // Чтобы собрать детали для отладки, заведём объект debug:
    let debug = {
      nodeApi: nodeResp.ok ? 'node/share/user returned 200' : `node/share/user returned ${nodeResp.status}`,
      sigi: 'not attempted',
      next: 'not attempted',
      regex: 'not attempted'
    };

    // ----- 2.1 Попытка через <script id="SIGI_STATE">…</script> -----
    const sigiRegex = /<script\s+id="SIGI_STATE"\s+type="application\/json">([^<]+)<\/script>/;
    const sigiMatch = html.match(sigiRegex);
    if (sigiMatch && sigiMatch[1]) {
      debug.sigi = 'found SIGI_STATE tag';
      try {
        const sigiJson = JSON.parse(sigiMatch[1]);

        // Варианты путей:
        // A) sigiJson.UserModule.users[username].stats.followerCount
        if (
          sigiJson.UserModule
          && sigiJson.UserModule.users
          && sigiJson.UserModule.users[username]
          && sigiJson.UserModule.users[username].stats
          && typeof sigiJson.UserModule.users[username].stats.followerCount === 'number'
        ) {
          const count = sigiJson.UserModule.users[username].stats.followerCount;
          response.status(200).json({ followerCount: count });
          return;
        }

        // B) sigiJson.UserPage[username].stats.followerCount
        if (
          sigiJson.UserPage
          && sigiJson.UserPage[username]
          && sigiJson.UserPage[username].stats
          && typeof sigiJson.UserPage[username].stats.followerCount === 'number'
        ) {
          const count = sigiJson.UserPage[username].stats.followerCount;
          response.status(200).json({ followerCount: count });
          return;
        }

        debug.sigi = 'SIGI_STATE found but no followerCount at expected paths';
      } catch (e) {
        debug.sigi = `SIGI_STATE JSON parse error: ${e.message}`;
      }
    } else {
      debug.sigi = 'no SIGI_STATE tag';
    }

    // ----- 2.2 Попытка через <script id="__NEXT_DATA__">…</script> -----
    const nextRegex = /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([^<]+)<\/script>/;
    const nextMatch = html.match(nextRegex);
    if (nextMatch && nextMatch[1]) {
      debug.next = 'found __NEXT_DATA__ tag';
      try {
        const nextJson = JSON.parse(nextMatch[1]);

        // Варианты путей:
        // A) nextJson.props.pageProps.userInfo.stats.followerCount
        if (
          nextJson.props
          && nextJson.props.pageProps
          && nextJson.props.pageProps.userInfo
          && nextJson.props.pageProps.userInfo.stats
          && typeof nextJson.props.pageProps.userInfo.stats.followerCount === 'number'
        ) {
          const count = nextJson.props.pageProps.userInfo.stats.followerCount;
          response.status(200).json({ followerCount: count });
          return;
        }

        // B) nextJson.props.pageProps.userPage.userInfo.stats.followerCount
        if (
          nextJson.props
          && nextJson.props.pageProps
          && nextJson.props.pageProps.userPage
          && nextJson.props.pageProps.userPage.userInfo
          && nextJson.props.pageProps.userPage.userInfo.stats
          && typeof nextJson.props.pageProps.userPage.userInfo.stats.followerCount === 'number'
        ) {
          const count = nextJson.props.pageProps.userPage.userInfo.stats.followerCount;
          response.status(200).json({ followerCount: count });
          return;
        }

        debug.next = '__NEXT_DATA__ found but no followerCount at expected paths';
      } catch (e) {
        debug.next = `__NEXT_DATA__ JSON parse error: ${e.message}`;
      }
    } else {
      debug.next = 'no __NEXT_DATA__ tag';
    }

    // ----- 2.3 Фоллбек: регулярка “userInfo” → “stats” → “followerCount” -----
    debug.regex = 'attempting fallback userInfo regex';
    const userInfoRegex = new RegExp(
      `"userInfo":\\{[^}]*"uniqueId":"${username}"[^}]*"stats":\\{[^}]*"followerCount":(\\d+)`,
      'i'
    );
    const userInfoMatch = html.match(userInfoRegex);
    if (userInfoMatch && userInfoMatch[1]) {
      const fallbackCount = parseInt(userInfoMatch[1], 10);
      response.status(200).json({ followerCount: fallbackCount });
      return;
    } else {
      debug.regex = 'no match on fallback userInfo regex';
    }

    // ----- 2.4 Ни один способ не сработал → возвращаем ошибку с debug -----
    response.status(404).json({
      error: 'followerCount not found',
      detail: debug
    });

  } catch (err) {
    // Любая неожиданная ошибка на сервере
    response.status(500).json({
      error: 'internal error',
      details: err.message
    });
  }
}
