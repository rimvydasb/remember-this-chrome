// Generates Chrome Web Store images into store-assets/ from docs/screenshots.
// Run: node scripts/store-assets.mjs   (JPEG output: opaque, no alpha channel)
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'store-assets');
mkdirSync(out, { recursive: true });

const img = (p) => `data:image/png;base64,${readFileSync(resolve(root, p)).toString('base64')}`;
const shot = (n) => img(`docs/screenshots/${n}`);
const icon = img('public/icons/icon-128.png');

const base = `
  *{box-sizing:border-box;margin:0}
  body{font-family:-apple-system,"Inter","Segoe UI",sans-serif;color:#fff;overflow:hidden;
    background:linear-gradient(135deg,#2b2f8f 0%,#4f56d9 55%,#7a6df0 100%)}
  .frame{border-radius:12px;box-shadow:0 24px 60px rgba(10,12,60,.55),0 0 0 1px rgba(255,255,255,.18);display:block}
`;

const screenshots = [
  ['01-save', 'popup', 'Save any YouTube transcript in one click'],
  ['02-library', 'img.png', 'Your transcripts, organized in catalogs'],
  ['03-summary', 'img_1.png', 'AI summaries, sentiment and tags for every video'],
  ['04-questions', 'img_3.png', 'Ask questions answered from the transcript only'],
  ['05-filters', 'img_7.png', 'Find anything: full-text search and smart filters'],
];

// Popup crops: [source, x, width, height]. Only the toolbar and popup are kept,
// so no third-party page content shows.
const S = 1.2;
const crop = ([file, h]) =>
  `<div class="crop" style="width:${357 * S}px;height:${h * S}px"><img src="${shot(file)}" style="width:${1323 * S}px;margin-left:-${797 * S}px"></div>`;
const popupBody = `<div class="pair">${crop(['img_8.png', 311])}<div class="arrow">&rarr;</div>${crop(['img_9.png', 511])}</div>`;

const shotHtml = (file, title) => `<style>${base}
  .pair{display:flex;align-items:flex-start;gap:36px}
  .crop{overflow:hidden;border-radius:12px;box-shadow:0 24px 60px rgba(10,12,60,.55),0 0 0 1px rgba(255,255,255,.18);background:#fff}
  .crop img{display:block}
  .arrow{font-size:64px;font-weight:700;opacity:.9;align-self:center;margin-top:-40px}
  body{width:1280px;height:800px;display:flex;flex-direction:column;align-items:center}
  h1{font-size:44px;font-weight:700;letter-spacing:-.5px;margin:54px 0 38px;text-align:center;padding:0 60px;line-height:1.15}
  .frame{max-width:1160px;max-height:560px}
</style><h1>${title}</h1>${file === 'popup' ? popupBody : `<img class="frame" src="${shot(file)}">`}`;

const tileHtml = `<style>${base}
  body{width:440px;height:280px;position:relative}
  .t{position:absolute;left:28px;top:30px;width:230px}
  .t img{width:56px;height:56px;border-radius:13px;box-shadow:0 6px 18px rgba(10,12,60,.4)}
  h1{font-size:34px;line-height:1.05;margin:14px 0 10px;letter-spacing:-.5px}
  p{font-size:15px;line-height:1.35;opacity:.92}
  .frame{position:absolute;left:250px;top:44px;width:420px;border-radius:9px;transform:rotate(-4deg)}
  .frame.b{top:150px;left:272px;transform:rotate(3deg)}
</style><div class="t"><img src="${icon}"><h1>Remember This</h1><p>YouTube transcripts in a private, searchable library.</p></div>
<img class="frame" src="${shot('img_1.png')}"><img class="frame b" src="${shot('img.png')}">`;

const marqueeHtml = `<style>${base}
  body{width:1400px;height:560px;position:relative}
  .t{position:absolute;left:80px;top:120px;width:560px}
  .t img{width:84px;height:84px;border-radius:20px;box-shadow:0 8px 24px rgba(10,12,60,.4)}
  h1{font-size:68px;line-height:1;margin:22px 0 16px;letter-spacing:-1.5px}
  p{font-size:26px;line-height:1.35;opacity:.92}
  .frame{position:absolute;width:760px;border-radius:14px}
  .a{left:640px;top:48px;transform:rotate(-3deg)}
  .b{left:700px;top:290px;transform:rotate(2.5deg)}
</style><div class="t"><img src="${icon}"><h1>Remember This</h1><p>Save YouTube transcripts into a private, searchable library with local AI summaries.</p></div>
<img class="frame a" src="${shot('img_1.png')}"><img class="frame b" src="${shot('img.png')}">`;

const browser = await chromium.launch();
async function render(html, w, h, name) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(html);
  await page.screenshot({ path: resolve(out, `${name}.jpg`), type: 'jpeg', quality: 95 });
  await page.close();
  console.log(`${name}.jpg ${w}x${h}`);
}
for (const [name, file, title] of screenshots) await render(shotHtml(file, title), 1280, 800, `screenshot-${name}`);
await render(tileHtml, 440, 280, 'promo-small-440x280');
await render(marqueeHtml, 1400, 560, 'promo-marquee-1400x560');
await browser.close();
