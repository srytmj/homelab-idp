import puppeteer from 'puppeteer-core';
import path from 'path';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
  });

  const page = await browser.newPage();

  console.log('Capturing 01-login.png...');
  await page.goto('http://localhost:4000/login', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.resolve('docs/screenshots/01-login.png') });

  console.log('Logging in...');
  await page.type('input[type="text"]', 'admin');
  await page.type('input[type="password"]', 'change_this_master_password');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);

  // Wait a moment for dashboard items to render
  await new Promise((r) => setTimeout(r, 1200));

  console.log('Capturing 02-vault-dashboard-grid.png...');
  await page.screenshot({ path: path.resolve('docs/screenshots/02-vault-dashboard-grid.png') });

  console.log('Capturing 03-vault-dashboard-table.png...');
  // Click table view button (the second button inside the view switcher)
  const buttons = await page.$$('button[title="Table View"]');
  if (buttons.length > 0) {
    await buttons[0].click();
    await new Promise((r) => setTimeout(r, 600));
    await page.screenshot({ path: path.resolve('docs/screenshots/03-vault-dashboard-table.png') });
  }

  console.log('Capturing 04-vault-modal.png...');
  // Click Add Entry button
  const addButtons = await page.$$('button');
  for (const btn of addButtons) {
    const text = await page.evaluate((el) => el.textContent, btn);
    if (text && text.includes('Add Entry')) {
      await btn.click();
      await new Promise((r) => setTimeout(r, 600));
      break;
    }
  }
  await page.screenshot({ path: path.resolve('docs/screenshots/04-vault-modal.png') });

  console.log('Capturing 05-oidc-consent.png...');
  await page.goto(
    'http://localhost:4000/consent?client_id=komga-oidc&client_name=Komga&redirect_uri=https://komga.homelab.internal/login/oauth2/code/homelab-idp&scope=openid%20profile%20email',
    { waitUntil: 'networkidle0' }
  );
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.resolve('docs/screenshots/05-oidc-consent.png') });

  console.log('All screenshots captured successfully!');
  await browser.close();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
