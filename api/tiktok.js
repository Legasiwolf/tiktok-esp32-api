// api/tiktok.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
  // 1) Проверяем, передали ли “?user=…”
  const username = req.query.user;
  if (!username) {
    res.status(400).json({ error: 'missing user parameter' });
    return;
  }

  try {
    //------------------------------------------------
    // ШАГ A: СКАЧИВАЕМ СТАТИСТИКУ ИЗ TikTok (HTML)
    //------------------------------------------------
    // (этот код точно такой же, как у вас уже есть — он достаёт followerCount и heartCount)
    const profileUrl = `https://www.tiktok.com/@${username}?lang=en`;
    const htmlResp = await fetch(profileUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      cache: 'no-store'
    });
    if (!htmlResp.ok) {
      res
        .status(htmlResp.status)
        .json({ error: `failed to fetch TikTok page (status ${htmlResp.status})` });
      return;
    }
    const html = await htmlResp.text();

    //------------------------------------------------
    // ШАГ B: ИЗВЛЕКАЕМ `followerCount` И `heartCount`
    //------------------------------------------------
    const reFollowers = /"followerCount":\s*([0-9]+)/;
    const reHearts    = /"heartCount":\s*([0-9]+)/;
    const mF = html.match(reFollowers);
    const mH = html.match(reHearts);
    if (!mF || !mH) {
      res.status(404).json({
        error: 'followerCount or heartCount not found',
        detail: {
          attemptedUrl: profileUrl,
          note: 'tried regex /"followerCount":([0-9]+)/ and /"heartCount":([0-9]+)/'
        }
      });
      return;
    }

    const followerCount = parseInt(mF[1], 10);
    const heartCount    = parseInt(mH[1], 10);

    //------------------------------------------------
    // ШАГ C: ПОЛУЧАЕМ СПИСОК “recentFollowers”
    //------------------------------------------------
    // В идеале вы замените блок ниже на логику, 
    // которая из какого-то источника (своей базы или API TikTok) 
    // достаёт именно реальные последние N подписчиков. 
    //
    // В этом демонстрационном примере я просто верну фиктивный массив.
    // Как только у вас будет свой способ вытаскивать «последних подписчиков»,
    // вы помещаете их в этот массив.
    const recentFollowers = [
      "alice123",
      "bob_stream",
      "charlie_gamer",
      "diana_live",
      "ebanq"
    ];

    //------------------------------------------------
    // ШАГ D: ГЕНЕРИРУЕМ И ОТПРАВЛЯЕМ JSON-ОТВЕТ
    //------------------------------------------------
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      followerCount: followerCount,
      heartCount: heartCount,
      recentFollowers: recentFollowers
    });
  } catch (e) {
    res.status(500).json({
      error: 'internal error',
      details: e.message
    });
  }
}
