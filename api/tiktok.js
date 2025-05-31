// api/tiktok.js

import fetch from 'node-fetch';

export default async function handler(request, response) {
  const username = request.query.user;
  if (!username) {
    response.status(400).json({ error: 'missing user parameter' });
    return;
  }

  // Для отладки запомним, какие способы мы пытались
  const debug = {
    attemptUserDetail: 'not attempted',
    attemptHtmlScraping: 'not attempted'
  };

  try {
    //------------------------------------
    // 2) СПОСОБ №1: “user/detail” API
    //------------------------------------
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
            return response.status(200).json({
              followerCount: json.userInfo.stats.followerCount
            });
          } else {
            debug.attemptUserDetail += ' → no followerCount field';
          }
        } catch (e) {
          debug.attemptUserDetail += ` → parse error: ${e.message}`;
        }
      } else {
        debug.attemptUserDetail += ' → empty body';
      }
    } else {
      debug.attemptUserDetail += ' → HTTP not OK';
    }

    //------------------------------------
    // 3) СПОСОБ №2: HTML-скрейп (регулярка)
    //------------------------------------
    debug.attemptHtmlScraping = 'started';
    const htmlResp = await fetch(
      `https://www.tiktok.com/@${username}?lang=en`,
      {
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
      }
    );

    if (!htmlResp.ok) {
      debug.attemptHtmlScraping += ` → HTTP ${htmlResp.status}`;
      return response.status(htmlResp.status).json({
        error: 'failed to fetch HTML for scraping',
        detail: debug
      });
    }

    const html = await htmlResp.text();
    debug.attemptHtmlScraping += ' → fetched HTML';

    const simpleRegex = /"followerCount":\s*([0-9]+)/;
    const simpleMatch = html.match(simpleRegex);
    if (simpleMatch && simpleMatch[1]) {
      const fallbackCount = parseInt(simpleMatch[1], 10);
      return response.status(200).json({ followerCount: fallbackCount });
    } else {
      debug.attemptHtmlScraping += ' → regex not found';
    }

    //------------------------------------
    // 4) Нечего больше пробовать → 404 + debug
    //------------------------------------
    return response.status(404).json({
      error: 'followerCount not found',
      detail: debug
    });
  } catch (err) {
    //------------------------------------
    // 5) Любая внутренняя ошибка
    //------------------------------------
    return response.status(500).json({
      error: 'internal error',
      details: err.message,
      debug: debug
    });
  }
}
