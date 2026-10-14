// 비회원 댓글 로그인 복귀 테스트
import { chromium } from 'playwright';

const BASE = 'https://ssagda.com/WEBTOON';
const TOKEN = 'b99293ca-8dc1-4c61-b8ce-5421a53ef663';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/154.0.0.0 Mobile',
});
const page = await ctx.newPage();

// 비로그인 상태로 뷰어 접근
await page.goto(`${BASE}/view/${TOKEN}#comments`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.evaluate(() => document.getElementById('comments')?.scrollIntoView());
await page.waitForTimeout(1000);

// '댓글을 쓰려면 로그인' 버튼
const loginBtn = await page.$('button:has-text("댓글을 쓰려면 로그인")');
if (!loginBtn) {
  console.log('FAIL: 로그인 버튼 없음');
  await browser.close();
  process.exit(1);
}
console.log('로그인 버튼 발견');

await loginBtn.click();
await page.waitForTimeout(2000);

const url = page.url();
const isLoginPage = url.includes('/login');
console.log('로그인 페이지 도달:', isLoginPage, '— URL:', url);

const redirect = await page.evaluate(() => sessionStorage.getItem('login_redirect'));
console.log('sessionStorage login_redirect:', redirect);
const hasComments = redirect && redirect.includes('#comments');

console.log('\n=== RESULT ===');
console.log(JSON.stringify({
  login_page: isLoginPage,
  login_redirect: redirect,
  has_comments_hash: hasComments,
  verdict: isLoginPage && hasComments ? 'PASS' : 'FAIL',
}, null, 2));

await browser.close();
