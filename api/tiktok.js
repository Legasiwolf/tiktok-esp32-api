// api/tiktok.js

import fetch from 'node-fetch';

export default async function handler(request, response) {
  // 1) Проверяем: передан ли параметр ?user=...
  const username = request.query.user;
  if (!username) {
    response.status(400).json({ error: 'missing user parameter' });
    return;
  }

  // Объект для отладки: запишем сюда, что сработало, а что нет
  const debug = {
    attemptUserDetail: 'not attempted',
    attemptMobileJson: 'not attempted',
    attemptHtmlScraping: 'not attempted'
  };

  try {
    //--------------------------------------
    // 2) СПОСОБ №1: «user/detail» API (точное значение, но иногда тело пустое)
    //--------------------------------------
    const apiUrl = `https://www.tiktok.com/api/user/detail/?uniqueId=${username}`;
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

    debug.attemptUserDetail = `status ${apiResp.status}, content-length ${apiResp.headers.get('content-length')}`;

    if (apiResp.ok) {
      const text = await apiResp.text();

      if (text && text.trim().length > 0) {
        try {
          const json = JSON.parse(text);
          if (
            json.userInfo &&
            json.userInfo.stats &&
            typeof json.userInfo.stats.followerCount === 'number'
          ) {
            const count = json.userInfo.stats.followerCount;
            response.status(200).json({ followerCount: count });
            return;
          } else {
            debug.attemptUserDetail += ' → no followerCount field';
          }
        } catch (parseErr) {
          debug.attemptUserDetail += ` → JSON parse error: ${parseErr.message}`;
        }
      } else {
        debug.attemptUserDetail += ' → empty body';
      }
    } else {
      debug.attemptUserDetail += ' → non-OK HTTP status';
    }

    //--------------------------------------
    // 3) СПОСОБ №2: «мобильный» JSON (m.tiktok.com/h5/share/user) — часто «живой» счётчик
    //--------------------------------------
    const mobileUrl = `https://m.tiktok.com/h5/share/user/@${username}`;
    const mobileResp = await fetch(mobileUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/91.0.4472.77 Mobile Safari/537.36',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      cache: 'no-store'
    });

    debug.attemptMobileJson = `status ${mobileResp.status}`;

    if (mobileResp.ok) {
      const mobileText = await mobileResp.text();
      if (mobileText && mobileText.trim().length > 0) {
        try {
          const mobileJson = JSON.parse(mobileText);
          // В мобильном JSON путь к followerCount: mobileJson.userInfo.stats.followerCount
          if (
            mobileJson.userInfo &&
            mobileJson.userInfo.stats &&
            typeof mobileJson.userInfo.stats.followerCount === 'number'
          ) {
            const count = mobileJson.userInfo.stats.followerCount;
            response.status(200).json({ followerCount: count });
            return;
          } else {
            debug.attemptMobileJson += ' → no followerCount in JSON';
          }
        } catch (parseErr) {
          debug.attemptMobileJson += ` → JSON parse error: ${parseErr.message}`;
        }
      } else {
        debug.attemptMobileJson += ' → empty body';
      }
    } else {
      debug.attemptMobileJson += ' → non-OK HTTP status';
    }

    //--------------------------------------
    // 4) СПОСОБ №3: Скрейпинг HTML (наиболее простой regex)
    //--------------------------------------
    debug.attemptHtmlScraping = 'started';
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
      debug.attemptHtmlScraping += ` → failed to fetch HTML, status ${htmlResp.status}`;
      response.status(htmlResp.status).json({
        error: 'failed to fetch HTML for scraping',
        detail: debug
      });
      return;
    }

    const html = await htmlResp.text();
    debug.attemptHtmlScraping += ' → fetched HTML';

    const simpleRegex = /"followerCount":\s*([0-9]+)/;
    const simpleMatch = html.match(simpleRegex);

    if (simpleMatch && simpleMatch[1]) {
      const fallbackCount = parseInt(simpleMatch[1], 10);
      response.status(200).json({ followerCount: fallbackCount });
      return;
    } else {
      debug.attemptHtmlScraping += ' → regex not found';
    }

    //--------------------------------------
    // 5) Ничего не сработало → возвращаем 404 + debug
    //--------------------------------------
    response.status(404).json({
      error: 'followerCount not found by any method',
      detail: debug
    });
  } catch (err) {
    //--------------------------------------
    // 6) Весьма неожиданная внутренняя ошибка
    //--------------------------------------
    response.status(500).json({
      error: 'internal error',
      details: err.message,
      debug: debug
    });
  }
}
