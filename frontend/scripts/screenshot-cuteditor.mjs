import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', '..', 'scratch', 'cuteditor-shots');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

async function takeShots() {
  const browser = await chromium.launch({ headless: true });

  const targets = [
    { name: '375px-editMode', width: 375, height: 700, url: 'http://localhost:5173/WEBTOON/bubble-test?cuteditor=1&mode=edit' },
    { name: '412px-editMode', width: 412, height: 800, url: 'http://localhost:5173/WEBTOON/bubble-test?cuteditor=1&mode=edit' },
    { name: '1280px-editMode', width: 1280, height: 800, url: 'http://localhost:5173/WEBTOON/bubble-test?cuteditor=1&mode=edit' },
    { name: '375px-viewMode', width: 375, height: 700, url: 'http://localhost:5173/WEBTOON/bubble-test?cuteditor=1&mode=view' },
  ];

  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.width, height: t.height } });
    await page.goto(t.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const savePath = resolve(outDir, `${t.name}.png`);
    await page.screenshot({ path: savePath });
    console.log(`Saved: ${savePath}`);

    // 효과 버튼 클릭 후 선택 상태 스크린샷도 저장
    if (t.name === '375px-editMode') {
      const effectBtn = page.getByRole('button', { name: '효과', exact: true });
      if (await effectBtn.count() > 0) {
        await effectBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: resolve(outDir, '375px-editMode-selected.png') });
        console.log('Saved: 375px-editMode-selected.png');
      }
    }

    await page.close();
  }

  await browser.close();
  console.log('All screenshots completed!');
}

takeShots().catch(console.error);
