import puppeteer, { Page } from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const GITHUB_PASSWORD = process.env.GITHUB_PASSWORD;
const GITHUB_ORG = process.env.GITHUB_ORG;
const APP_PREFIX = process.env.APP_PREFIX;

if (!GITHUB_USERNAME || !GITHUB_PASSWORD) {
  console.error('Please set GITHUB_USERNAME and GITHUB_PASSWORD in your .env file.');
  process.exit(1);
}

if (!APP_PREFIX) {
  console.error('Please set APP_PREFIX in your .env file.');
  process.exit(1);
}

async function getAppsOnPage(page: Page) {
  return await page.$$eval('.Box.js-navigation-container.js-active-navigation-container.clearfix.mt-3 .Box-row.d-flex.flex-items-center', rows => {
    return rows.map(row => {
      const name = (row.querySelector('.text-bold') as HTMLElement).innerText;
      const deleteButton = row.querySelector('.btn-danger') as HTMLElement;
      const editLink = (row.querySelector('.btn.btn-sm') as HTMLAnchorElement).href;
      return { name, deleteButton, editLink };
    });
  });
}

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Log in to GitHub
  await page.goto('https://github.com/login');
  await page.type('#login_field', GITHUB_USERNAME);
  await page.type('#password', GITHUB_PASSWORD);
  await page.click('[name="commit"]');
  await page.waitForNavigation();

  // Wait for the user to manually handle 2FA
  console.log('Please complete the 2FA process in the browser.');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });

  // Navigate to GitHub apps page
  let currentPage = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    if (GITHUB_ORG) {
      await page.goto(`https://github.com/organizations/${GITHUB_ORG}/settings/apps?page=${currentPage}`);
    } else {
      await page.goto(`https://github.com/settings/apps?page=${currentPage}`);
    }

    // Get the list of apps on the current page
    const apps = await getAppsOnPage(page);
    console.log(apps);

    // Navigate to the edit page of each app
    for (const app of apps) {
      if (app.name.startsWith(APP_PREFIX)) {
        await page.goto(`${app.editLink}/advanced`);
        // Perform deletion or other actions
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const deleteButton = buttons.find(button => button.textContent?.includes('Delete GitHub App'));
          if (deleteButton) {
            deleteButton.click();
          }
        });
        await page.waitForSelector('dialog[aria-modal="true"]');
        await page.type('input#confirm-delete-app', app.name);
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const confirmDeleteButton = buttons.find(button => button.textContent?.includes('I understand the consequences, delete this GitHub App'));
          if (confirmDeleteButton) {
            confirmDeleteButton.click();
          }
        });
        await page.waitForNavigation();
      }
    }

    // Check if there is a next page
    hasNextPage = await page.$('.pagination a.next_page') !== null;
    currentPage++;
  }

  await browser.close();
})();