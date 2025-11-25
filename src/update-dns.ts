import { chromium } from 'playwright';

interface IUpdateDNSOptions {
  username: string;
  password: string;
  entry: string;
  challengeString: string;
  domain: string;
  debug?: boolean;
}

async function updateDNSChallenge(options: IUpdateDNSOptions) {
  let { username, password, entry, challengeString, domain } = options;
  entry = entry.replace(`.${ domain }`, '');

  // Launch browser
  const browser = await chromium.launch({
    headless: !options.debug
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to login page
    await page.goto('https://www.uniteddomains.com/login');

    // Fill in login form
    await page.getByRole('textbox', { name: 'Email Address' }).fill(username);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);

    // Submit login form
    await page.getByRole('button', { name: 'Log In' }).click();

    // Wait for navigation to portfolio page
    await page.waitForURL('**/portfolio');

    // Find and click the DNS link for the domain
    const dnsLink = page.getByRole('link', { name: 'DNS' });
    await dnsLink.click();

    // Wait for DNS page to load
    await page.waitForURL(`**/portfolio/dns/${ domain }`);

    // Wait for Custom Resource Records section
    await page.waitForSelector('text=Custom Resource Records', { timeout: 10000 });

    // Look for existing _acme-challenge record
    console.log(`Looking for existing record: ${ entry }`);
    const existingRecord = page.getByRole('row', { name: new RegExp(`^${ entry } TXT`) });

    if (await existingRecord.count() > 0) {
      // Update existing record
      await existingRecord.getByRole('button', { name: 'edit' }).click();
      await page.getByRole('textbox', { name: 'Text' }).fill(challengeString);
      await page.getByRole('cell', { name: 'Save' }).getByRole('button').click();
    } else {
      // Fill in new record form
      await page.getByRole('textbox', { name: '@' }).fill(entry);
      await page.getByRole('combobox').selectOption('TXT');
      await page.getByRole('textbox', { name: 'Text' }).fill(challengeString);
      await page.getByRole('button', { name: 'Add' }).click();
    }

    // Wait for success message
    await page.waitForSelector('text=DNS Records saved successfully', { timeout: 10000 });

    // Verify the record was updated correctly
    const records = await page.$$eval('tr', (rows) => {
      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll('td'));
        return cells.map((cell) => cell.textContent?.trim());
      }).filter((cells) => cells[1] === 'TXT');
    });

    if (!records.length) {
      throw new Error('DNS record verification failed - record not found or incorrect value');
    }

    console.log('DNS record updated and verified successfully');
  } catch (error) {
    console.error('Error updating DNS record:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

// Example usage:
// updateDNSChallenge({
//   username: 'your-username',
//   password: 'your-password',
//   domain: 'example.com',
//   challengeString: 'your-challenge-string'
// });

export { updateDNSChallenge, IUpdateDNSOptions as UpdateDNSOptions };
