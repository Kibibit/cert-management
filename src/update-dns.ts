import { chromium, Page } from 'playwright';

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

  const browser = await chromium.launch({
    headless: !options.debug
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to united-domains.de login page
    await page.goto('https://www.united-domains.de/login');

    // Dismiss cookie consent banner if present
    try {
      const cookieBtn = page.getByRole('button', { name: 'Alle Cookies ablehnen' });
      await cookieBtn.click({ timeout: 5000 });
    } catch {
      // Cookie banner may not appear (e.g. already dismissed)
    }

    // Fill in login form (German labels on .de site)
    await page.getByRole('textbox', { name: 'E-Mail-Adresse' }).fill(username);
    await page.getByRole('textbox', { name: 'Passwort' }).fill(password);

    // Submit login form
    await page.getByRole('button', { name: 'Anmelden' }).click();

    // Wait for navigation to portfolio page
    await page.waitForURL('**/portfolio/**', { timeout: 30000 });

    // Navigate to DNS settings for the domain
    const dnsSettingsLink = page.getByRole('link', {
      name: `Configure DNS settings for ${ domain }`
    });
    await dnsSettingsLink.click();

    // Wait for DNS configuration overview page
    await page.waitForURL('**/config/dns/**', { timeout: 15000 });

    // Click "DNS Records" to enter the record editing page
    await page.getByRole('link', { name: /DNS Records/ }).click();

    // Wait for DNS records editing page
    await page.waitForURL('**/domain-admin/dns/**', { timeout: 15000 });

    // Wait for the TXT records section to load
    await page.waitForSelector('#dns-txt-records-section', { timeout: 15000 });

    console.log(`Looking for existing record: ${ entry }`);

    // Try to find and update an existing record, or create a new one
    const updated = await updateOrCreateTxtRecord(page, entry, challengeString);

    if (!updated) {
      throw new Error('Failed to update or create TXT record');
    }

    console.log('DNS record updated successfully');
  } catch (error) {
    console.error('Error updating DNS record:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Finds an existing TXT record by hostname within the TXT section and updates
 * its value, or creates a new record if none exists.
 */
async function updateOrCreateTxtRecord(
  page: Page,
  entry: string,
  challengeString: string
): Promise<boolean> {
  const txtSection = page.locator('#dns-txt-records-section');

  // Mark the record container that has a readonly input matching our entry
  const found = await page.evaluate((entryName) => {
    const section = document.querySelector('#dns-txt-records-section');
    if (!section) return false;

    const readonlyInputs = section.querySelectorAll('input[readonly]');
    for (const input of readonlyInputs) {
      if ((input as HTMLInputElement).value === entryName) {
        // Walk up to the nearest record container element
        let container: HTMLElement | null = input as HTMLElement;
        while (container && container !== section) {
          const tag = container.tagName.toLowerCase();
          if (tag === 'dns-record-entry' || container.classList.contains('dns-record')) {
            break;
          }
          container = container.parentElement;
        }
        // Fallback: use the grandparent row if no named container found
        if (!container || container === section) {
          container = (input as HTMLElement).closest('.row') ||
                      (input as HTMLElement).parentElement?.parentElement as HTMLElement;
        }
        if (container) {
          container.setAttribute('data-cert-target', 'update');
          return true;
        }
      }
    }
    return false;
  }, entry);

  if (found) {
    console.log(`Found existing ${ entry } record — updating value`);
    const targetRow = page.locator('[data-cert-target="update"]');

    // The text/data field is a textarea in the same record container
    const textarea = targetRow.locator('textarea').first();
    if (await textarea.count() > 0) {
      await textarea.fill(challengeString);
    } else {
      // Fallback: last non-readonly input that is not the TTL field
      const editableInputs = targetRow.locator('input:not([readonly])');
      const count = await editableInputs.count();
      for (let i = count - 1; i >= 0; i--) {
        const placeholder = await editableInputs.nth(i).getAttribute('placeholder');
        if (placeholder !== '600') {
          await editableInputs.nth(i).fill(challengeString);
          break;
        }
      }
    }

    // Click the row's Save button (becomes enabled after value change)
    const saveBtn = targetRow.getByRole('button', { name: 'Save' });
    await saveBtn.click();

    // Wait for save to complete
    await page.waitForTimeout(2000);

    // Clean up marker attribute
    await page.evaluate(() => {
      document.querySelector('[data-cert-target]')?.removeAttribute('data-cert-target');
    });

    return true;
  }

  // Record does not exist — create a new one
  console.log(`No existing ${ entry } record found — creating new TXT record`);

  // Click the Add button within the TXT section
  await txtSection.locator('button.ud-dns_addbutton, button:has-text("Add")').first().click();
  await page.waitForTimeout(500);

  // Mark the new empty record row (the one with an editable, empty hostname input)
  const newRowFound = await page.evaluate(() => {
    const section = document.querySelector('#dns-txt-records-section');
    if (!section) return false;

    // Find editable (non-readonly) inputs with empty value — the new record hostname
    const inputs = section.querySelectorAll('input:not([readonly])');
    for (const input of inputs) {
      const el = input as HTMLInputElement;
      if (el.value === '' && el.placeholder !== '600') {
        let container: HTMLElement | null = el;
        while (container && container !== section) {
          const tag = container.tagName.toLowerCase();
          if (tag === 'dns-record-entry' || container.classList.contains('dns-record')) {
            break;
          }
          container = container.parentElement;
        }
        if (!container || container === section) {
          container = el.closest('.row') ||
                      el.parentElement?.parentElement as HTMLElement;
        }
        if (container) {
          container.setAttribute('data-cert-target', 'new');
          return true;
        }
      }
    }
    return false;
  });

  if (!newRowFound) {
    throw new Error('Could not find new record form after clicking Add');
  }

  const newRow = page.locator('[data-cert-target="new"]');

  // Fill hostname (first editable input in the new row)
  const hostnameInput = newRow.locator('input:not([readonly])').first();
  await hostnameInput.fill(entry);

  // Fill text/data value
  const textarea = newRow.locator('textarea').first();
  if (await textarea.count() > 0) {
    await textarea.fill(challengeString);
  } else {
    const editableInputs = newRow.locator('input:not([readonly])');
    const count = await editableInputs.count();
    for (let i = count - 1; i >= 0; i--) {
      const placeholder = await editableInputs.nth(i).getAttribute('placeholder');
      if (placeholder !== '600') {
        await editableInputs.nth(i).fill(challengeString);
        break;
      }
    }
  }

  // Save the new record
  const saveBtn = newRow.getByRole('button', { name: 'Save' });
  await saveBtn.click();

  // Wait for save to complete
  await page.waitForTimeout(2000);

  // Clean up marker
  await page.evaluate(() => {
    document.querySelector('[data-cert-target]')?.removeAttribute('data-cert-target');
  });

  return true;
}

export { updateDNSChallenge, IUpdateDNSOptions as UpdateDNSOptions };
