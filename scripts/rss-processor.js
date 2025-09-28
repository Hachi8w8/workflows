'use strict';
const Parser = require('rss-parser');
const fs = require('fs');
const path = require('path');

const parser = new Parser();
const RSS_URL = process.env.RSS_URL || 'https://zenn.dev/feed';
const CACHE_FILE = 'cache/rss-processed.json';
const OUTPUT_FILE = 'new-articles.json';

function keyOf(item) {
  return item?.guid || item?.id || item?.link || item?.title || '';
}

async function detectNewArticles() {
  try {
    const feed = await parser.parseURL(RSS_URL);
    const items = Array.isArray(feed.items) ? feed.items : [];

    console.log(`Feed title: ${feed.title || ''}`);
    console.log(`Total items in feed: ${items.length}`);

    let processedIds = [];
    if (fs.existsSync(CACHE_FILE)) {
      try {
        processedIds = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (!Array.isArray(processedIds)) processedIds = [];
        console.log(`Found ${processedIds.length} processed articles in cache`);
      } catch (e) {
        console.warn('Cache file exists but invalid, starting fresh');
        processedIds = [];
      }
    } else {
      console.log('No cache file found, starting fresh');
    }

    const newArticles = [];
    for (const item of items) {
      const id = keyOf(item);
      if (!id) continue;
      if (!processedIds.includes(id)) {
        console.log(`\n--- New Article ${newArticles.length + 1} ---`);
        console.log(`Title: ${item.title || ''}`);
        console.log(`Link: ${item.link || ''}`);
        console.log(`Published: ${item.pubDate || item.isoDate || ''}`);
        console.log(`GUID: ${id}`);
        
        newArticles.push({
          title: item.title || '',
          link: item.link || '',
          pubDate: item.pubDate || item.isoDate || '',
          content: item.content || '',
          contentSnippet: item.contentSnippet || '',
          guid: id,
        });
      }
    }

    console.log(`Found ${newArticles.length} new articles`);

    // 出力ファイル（後続ジョブ用）
    if (newArticles.length > 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(newArticles, null, 2));
      console.log(`✅ Saved ${newArticles.length} new articles to ${OUTPUT_FILE}`);

      // 既読IDを更新（重複除去して最新50件）
      const nextSet = new Set([...processedIds, ...newArticles.map(a => a.guid)]);
      const next = Array.from(nextSet).slice(-50);

      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(next, null, 2));
      console.log(`📝 Updated cache with ${next.length} processed IDs`);
    }

    // ---- GitHub Actions outputs（新方式）----
    const ghOut = process.env.GITHUB_OUTPUT;
    if (ghOut) {
      fs.appendFileSync(ghOut, `has-new-articles=${newArticles.length > 0}\n`);
      fs.appendFileSync(ghOut, `new-articles-count=${newArticles.length}\n`);
    } else {
      // フォールバック（ローカル実行デバッグ用）
      console.log(`has-new-articles=${newArticles.length > 0}`);
      console.log(`new-articles-count=${newArticles.length}`);
    }

  } catch (error) {
    console.error('RSS processing failed:', error);
    process.exit(1);
  }
}

detectNewArticles();