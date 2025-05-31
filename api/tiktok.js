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
    // 2) Запрашиваем страницу пользователя TikTok с заголовками, как от браузера
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
      // Если TikTok вернул ошибку (404, 503 и т.д.), сразу отдадим её клиенту
      response.status(resp.status).json({ error: 'failed to fetch TikTok page' });
      return;
    }

    // 3) Читаем весь HTML страницы
    const html = await resp.text();

    // Попытаемся последовательно найти followerCount тремя способами:
    let count = null;
    let debug = {
      sigi: 'not attempted',
      next: 'not attempted',
      regex: 'not attempted'
    };

    //
    // 4) СПОСОБ №1: Парсим JSON из <script id="SIGI_STATE">…</script>
    //
    const sigiRegex = /<script\s+id="SIGI_STATE"\s+type="application\/json">([^<]+)<\/script>/;
    const sigiMatch = html.match(sigiRegex);
    if (sigiMatch && sigiMatch[1]) {
      debug.sigi = 'found SIGI_STATE tag';
      try {
        const sigiJson = JSON.parse(sigiMatch[1]);
        // Есть два вероятных пути внутри sigiJson, где лежит followerCount:
        // A) sigiJson.UserModule.users[username].stats.followerCount
        if (
          sigiJson.UserModule &&
          sigiJson.UserModule.users &&
          sigiJson.UserModule.users[username] &&
          sigiJson.UserModule.users[username].stats &&
          typeof sigiJson.UserModule.users[username].stats.followerCount === 'number'
        ) {
          count = sigiJson.UserModule.users[username].stats.followerCount;
        }
        // B) sigiJson.UserPage[username].stats.followerCount  (иногда встречается в другом разделе)
        else if (
          sigiJson.UserPage &&
          sigiJson.UserPage[username] &&
          sigiJson.UserPage[username].stats &&
          typeof sigiJson.UserPage[username].stats.followerCount === 'number'
        ) {
          count = sigiJson.UserPage[username].stats.followerCount;
        }

        if (count !== null) {
          // Успешно нашли в SIGI_STATE
          response.status(200).json({ followerCount: count });
          return;
        } else {
          debug.sigi = 'SIGI_STATE tag found, but no followerCount at expected paths';
        }
      } catch (e) {
        debug.sigi = `SIGI_STATE JSON parse error: ${e.message}`;
      }
    } else {
      debug.sigi = 'no SIGI_STATE tag';
    }

    //
    // 5) СПОСОБ №2: Парсим JSON из <script id="__NEXT_DATA__">…</script>
    //
    const nextRegex = /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([^<]+)<\/script>/;
    const nextMatch = html.match(nextRegex);
    if (nextMatch && nextMatch[1]) {
      debug.next = 'found __NEXT_DATA__ tag';
      try {
        const nextJson = JSON.parse(nextMatch[1]);
        // В новой структуре Next.js данные профиля могут лежать по пути:
        // nextJson.props.pageProps.userInfo.stats.followerCount
        // Иногда: nextJson.props.pageProps.userPage.userInfo.stats.followerCount
        let candidate = null;
        if (
          nextJson.props &&
          nextJson.props.pageProps &&
          nextJson.props.pageProps.userInfo &&
          nextJson.props.pageProps.userInfo.stats &&
          typeof nextJson.props.pageProps.userInfo.stats.followerCount === 'number'
        ) {
          candidate = nextJson.props.pageProps.userInfo.stats.followerCount;
        } else if (
          nextJson.props &&
          nextJson.props.pageProps &&
          nextJson.props.pageProps.userPage &&
          nextJson.props.pageProps.userPage.userInfo &&
          nextJson.props.pageProps.userPage.userInfo.stats &&
          typeof nextJson.props.pageProps.userPage.userInfo.stats.followerCount === 'number'
        ) {
          candidate = nextJson.props.pageProps.userPage.userInfo.stats.followerCount;
        }

        if (candidate !== null) {
          count = candidate;
          response.status(200).json({ followerCount: count });
          return;
        } else {
          debug.next = 'no followerCount at expected __NEXT_DATA__ paths';
        }
      } catch (e) {
        debug.next = `__NEXT_DATA__ JSON parse error: ${e.message}`;
      }
    } else {
      debug.next = 'no __NEXT_DATA__ tag';
    }

    //
    // 6) СПОСОБ №3 (РЕЗЕРВНЫЙ): Ищем через регулярку `"userInfo":{ … "stats":{ … "followerCount":<число>`
    //
    debug.regex = 'attempting fallback regex';
    // Строим шаблон, учитывая, что uniqueId может идти позже, но обязательно содержит имя пользователя
    const userInfoRegex = new RegExp(
      `"userInfo":\\{[^}]*"uniqueId":"${username}"[^}]*"stats":\\{[^}]*"followerCount":(\\d+)`,
      'i'
    );
    const userInfoMatch = html.match(userInfoRegex);
    if (userInfoMatch && userInfoMatch[1]) {
      const fallbackCount = parseInt(userInfoMatch[1], 10);
      count = fallbackCount;
      response.status(200).json({ followerCount: count });
      return;
    } else {
      debug.regex = 'no match on fallback regex';
    }

    //
    // 7) Если ни один способ не сработал, возвращаем подробный ответ об ошибке
    //
    response.status(404).json({
      error: 'followerCount not found',
      detail: debug
    });
  } catch (err) {
    // 8) В случае любой непредвиденной ошибки
    response.status(500).json({ error: 'internal error', details: err.message });
  }
}
