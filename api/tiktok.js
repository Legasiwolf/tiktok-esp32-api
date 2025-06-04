// api/tiktok.js

import fetch from 'node-fetch';

export default async function handler(request, response) {
  // 1) Проверяем параметр ?user=...
  const username = request.query.user;
  if (!username) {
    response.status(400).json({ error: 'missing user parameter' });
    return;
  }

  try {
    //------------------------------------
    // ШАГ А: СКАЧИВАЕМ HTML СТРАНИЦЫ ПРОФИЛЯ
    //------------------------------------
    // Обратите внимание: убрали лишнюю кавычку перед ?lang=en
    const profileUrl = `https://www.tiktok.com/@${username}?lang=en`;

    // Притворяемся браузером, чтобы TikTok не подсовывал «страницу защиты»
    const htmlResp = await fetch(profileUrl, {
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
      // Если TikTok вернул ошибку (404, 503 и т. д.)
      response
        .status(htmlResp.status)
        .json({ error: `failed to fetch TikTok page (status ${htmlResp.status})` });
      return;
    }

    const html = await htmlResp.text();

    //------------------------------------
    // ШАГ Б: ИЩЕМ ВСТАВОЧНЫЙ JSON-СКРИПТ "stats":{...}
    //------------------------------------
    // Регулярка: ищем "stats":{ ... "followerCount":12345 ... "heartCount":67890 ... }
    const statsRegex = /"stats":\s*\{[^}]*?"followerCount":\s*([0-9]+)[^}]*?"heartCount":\s*([0-9]+)[^}]*?\}/;

    const statsMatch = html.match(statsRegex);

    if (statsMatch && statsMatch[1] && statsMatch[2]) {
      const followerCount = parseInt(statsMatch[1], 10);
      const heartCount    = parseInt(statsMatch[2], 10);

      // Возвращаем оба числа
      response.status(200).json({
        followerCount: followerCount,
        heartCount:    heartCount
      });
      return;
    }

    //------------------------------------
    // ШАГ В: Если не удалось найти оба поля — возвращаем debug
    //------------------------------------
    response.status(404).json({
      error: 'followerCount or heartCount not found',
      detail: {
        attemptedUrl: profileUrl,
        note: 'tried regex /"stats":\\s*\\{[^}]*"followerCount":([0-9]+)[^}]*"heartCount":([0-9]+)[^}]*\\}/'
      }
    });
  } catch (err) {
    //------------------------------------
    // ШАГ Г: Ловим все непредвиденные ошибки
    //------------------------------------
    response.status(500).json({
      error: 'internal error',
      details: err.message
    });
  }
}
