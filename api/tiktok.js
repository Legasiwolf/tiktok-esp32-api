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
      response.status(htmlResp.status).json({ error: `failed to fetch TikTok page (status ${htmlResp.status})` });
      return;
    }

    const html = await htmlResp.text();

    //------------------------------------
    // ШАГ Б: ГЛОБАЛЬНЫЙ РЕГУЛЯРНЫЙ ПОИСК "followerCount":<число>
    //------------------------------------
    // Будем искать первое вхождение <quote>"followerCount":</quote> и захватывать цифры после двоеточия.
    const simpleRegex = /"followerCount":\s*([0-9]+)/;
    const simpleMatch = html.match(simpleRegex);

    if (simpleMatch && simpleMatch[1]) {
      // Нашли число (например, "followerCount":42500)
      const count = parseInt(simpleMatch[1], 10);
      response.status(200).json({ followerCount: count });
      return;
    }

    //------------------------------------
    // ШАГ В (дополнительно, чисто для отладки):
    // Если простая регулярка не сработала, вернём debug-ответ
    //------------------------------------
    response.status(404).json({
      error: 'followerCount not found (simple regex)',
      detail: {
        attemptedUrl: profileUrl,
        // Для простоты не пытаем SIGI_STATE/ __NEXT_DATA__ / node/share
        // Просто говорим, что искали "followerCount" глобально и не нашли
        note: 'simpleRegex tried: /"followerCount":\\s*([0-9]+)/'
      }
    });
  } catch (err) {
    // Ловим все непредвиденные ошибки
    response.status(500).json({
      error: 'internal error',
      details: err.message
    });
  }
}
