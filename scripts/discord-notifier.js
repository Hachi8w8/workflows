'use strict';
const fs = require('fs');
const https = require('https');

const ANALYZED_FILE = 'analyzed-articles.json';

function postWebhook(webhook, content) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhook);
    const data = JSON.stringify({ username: 'Zenn RSS Monitor', content });

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      res.on('data', () => {}); // レスポンスデータを消費
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Discord HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(ANALYZED_FILE)) {
    console.error('❌ analyzed-articles.json が見つかりません');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(ANALYZED_FILE, 'utf8'));
  const articles = Array.isArray(data.articles) ? data.articles : [];

  const aiArticles = articles.filter(a => a.category === 'AI関連');
  const otherArticles = articles.filter(a => a.category === 'AI以外');

  async function notifyEach(webhook, articles, label) {
    if (!webhook || !articles.length) return;
    for (const a of articles) {
      const msg = `**【${a.title}】**\n\n${a.summary}\n\n🔗 ${a.link}`;
      await postWebhook(webhook, msg);
    }
    console.log(`✅ ${label}: ${articles.length}件送信完了`);
  }

  await notifyEach(process.env.DISCORD_AI_WEBHOOK, aiArticles, 'AI関連');
  await notifyEach(process.env.DISCORD_OTHER_WEBHOOK, otherArticles, 'AI以外');

  console.log('🎉 全て送信完了');
}

main();