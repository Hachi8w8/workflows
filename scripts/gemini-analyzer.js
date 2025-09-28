'use strict';
const fs = require('fs');

const OUTPUT_FILE = 'analyzed-articles.json';

async function processAnalysisResults() {
  try {
    console.log('Processing Gemini analysis results...');

    // 環境変数からGemini出力を取得
    const envJson = process.env.GEMINI_JSON || '';
    if (!envJson.trim()) {
      console.error('GEMINI_JSON environment variable is empty.');
      process.exit(1);
    }

    console.log(
      'Raw Gemini output (first 300 chars):',
      envJson.substring(0, 300)
    );

    let result = {};
    try {
      const parsed = JSON.parse(envJson);
      
      // Geminiが{"response": "```json\n{...}\n```"}形式で返す場合の対応
      if (parsed.response && typeof parsed.response === 'string') {
        const jsonMatch = parsed.response.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[1]);
        } else {
          result = JSON.parse(parsed.response);
        }
      } else {
        result = parsed;
      }
    } catch (parseError) {
      console.error('Failed to parse Gemini JSON:', parseError.message);
      console.error('Raw content:', envJson);
      result = { articles: [] };
    }

    // Gemini出力のバリデーションと正規化
    const geminiArticles = Array.isArray(result?.articles)
      ? result.articles
      : [];
    console.log(`Found ${geminiArticles.length} articles from Gemini`);

    const validatedArticles = geminiArticles
      .map((article, index) => {
        // 必須フィールドのバリデーション
        if (!article || typeof article !== 'object') {
          console.warn(`Article ${index} is invalid, skipping`);
          return null;
        }

        return {
          title: String(article.title || ''),
          link: String(article.link || ''),
          pubDate: String(article.pubDate || ''),
          guid: String(article.guid),
          category: article.category === 'AI関連' ? 'AI関連' : 'AI以外',
          summary: String(article.summary || ''),
          analyzedAt: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    console.log(
      `📊 Analysis Results: ${validatedArticles.length} articles processed`
    );

    // 最終結果を保存
    const final = {
      articles: validatedArticles,
      metadata: {
        totalCount: validatedArticles.length,
        aiRelatedCount: validatedArticles.filter((a) => a.category === 'AI関連')
          .length,
        otherCount: validatedArticles.filter((a) => a.category === 'AI以外')
          .length,
        processedAt: new Date().toISOString(),
        source: 'gemini',
      },
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(final, null, 2));
    console.log(
      `✅ Processed and saved ${validatedArticles.length} analyzed articles`
    );

    // GitHub Actions outputs
    const ghOut = process.env.GITHUB_OUTPUT;
    if (ghOut) {
      fs.appendFileSync(ghOut, `analyzed-count=${validatedArticles.length}\n`);
    } else {
      console.log(`analyzed-count=${validatedArticles.length}`);
    }
  } catch (error) {
    console.error('Analysis result processing failed:', error);
    process.exit(1);
  }
}

processAnalysisResults();
