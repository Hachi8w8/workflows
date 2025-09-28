'use strict';
const fs = require('fs');
const https = require('https');

const ANALYZED_FILE = 'analyzed-articles.json';
const MAX_MSG = 2000; // Discord 1メッセージ上限
const GAP_MS = 400; // 通常の連投間隔（軽いスロットリング）
const MAX_RETRY = 5; // 429時の最大リトライ

function truncate(s, max = MAX_MSG) {
  if (!s) return '';
  s = String(s);
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function buildMessage(a) {
  const title = `**【${a.title || 'No title'}】**`;
  const link = a.link ? `\n\n🔗 ${a.link}` : '';
  const head = `${title}\n\n`;
  const budget = Math.max(0, MAX_MSG - head.length - link.length);
  const summary = truncate(a.summary || a.contentSnippet || '', budget);
  return head + summary + link;
}

function postWebhookOnce(webhook, content) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhook);
    const data = JSON.stringify({username: 'Zenn RSS Monitor', content});

    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        // レスポンスを消費
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          if (
            (res.statusCode >= 200 && res.statusCode < 300) ||
            res.statusCode === 204
          ) {
            resolve();
          } else if (res.statusCode === 429) {
            // レート制限
            const ra = res.headers['retry-after'];
            // Retry-After: 秒が多いが、msのこともあるので両方考慮
            let waitMs = Number(ra);
            if (!(waitMs > 0)) waitMs = 1500; // ヘッダ無い/不正時のデフォルト
            if (waitMs < 50) waitMs = waitMs * 1000; // たぶん秒表記
            reject(Object.assign(new Error('RATE_LIMIT'), {waitMs}));
          } else {
            reject(new Error(`Discord HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function postWebhookWithRetry(webhook, content) {
  let attempt = 0;
  while (true) {
    try {
      await postWebhookOnce(webhook, content);
      return;
    } catch (e) {
      if (e.message === 'RATE_LIMIT' || e.message.includes('RATE_LIMIT')) {
        attempt++;
        if (attempt > MAX_RETRY) throw new Error('Rate limit retries exceeded');
        const backoff = Math.min(
          10000,
          (e.waitMs || 1500) * Math.pow(1.6, attempt - 1)
        );
        console.warn(
          `429: waiting ${Math.round(
            backoff
          )}ms then retry... (attempt ${attempt})`
        );
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw e; // その他のHTTPエラーは即座に落とす
    }
  }
}

async function notifyEach(webhook, articles, label) {
  if (!webhook || !articles.length) return;
  for (const a of articles) {
    const msg = buildMessage(a);
    await postWebhookWithRetry(webhook, msg);
    // 通常間隔（429時は上のリトライで待っているのでここは軽く）
    await new Promise((r) => setTimeout(r, GAP_MS));
  }
  console.log(`✅ ${label}: ${articles.length}件送信完了`);
}

(async function main() {
  try {
    if (!fs.existsSync(ANALYZED_FILE)) {
      console.error('❌ analyzed-articles.json が見つかりません');
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(ANALYZED_FILE, 'utf8'));
    const articles = Array.isArray(data.articles) ? data.articles : [];

    const aiArticles = articles.filter((a) => a.category === 'AI関連');
    const otherArticles = articles.filter((a) => a.category === 'AI以外');

    await notifyEach(process.env.DISCORD_AI_WEBHOOK, aiArticles, 'AI関連');
    await notifyEach(
      process.env.DISCORD_OTHER_WEBHOOK,
      otherArticles,
      'AI以外'
    );

    console.log('🎉 全て送信完了');
  } catch (e) {
    console.error('Discord通知エラー:', e);
    process.exit(1);
  }
})();
