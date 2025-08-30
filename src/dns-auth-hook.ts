/* eslint-disable */
import { spawn } from 'child_process';
import { updateDNSChallenge } from './update-dns';

// authoritative nameservers for United Domains (no caching):
const UD_NS = ['ns.udag.de'];

// The zone you manage in UD’s UI:
const ZONE_ROOT = process.env.DOMAIN || '';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function digTxtFqdnOnce(fqdn: string, ns: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const p = spawn('dig', ['+short', fqdn, 'TXT', '@' + ns]);
    let out = ''; let err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => {
      if (code !== 0) return reject(new Error(err || `dig exited ${code}`));
      const lines = out.trim().split('\n').filter(Boolean).map(s => s.replace(/^"|"$/g, ''));
      resolve(lines);
    });
  });
}

async function waitForAuthoritativeTXT(fqdn: string, expected: string) {
  const maxAttempts = 30;           // ~15 minutes total if 30*30s
  const delayMs = 30_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const ns of UD_NS) {
      try {
        const vals = await digTxtFqdnOnce(fqdn, ns);
        if (vals.includes(expected)) return;
      } catch { /* ignore and try next ns */ }
    }
    if (attempt < maxAttempts) await sleep(delayMs);
  }
  throw new Error(`TXT not propagated for ${fqdn} to all UD NSs`);
}

async function main() {
  const [, , certbotDomain, token] = process.argv;
  if (!process.env.UD_USERNAME || !process.env.UD_PASSWORD) {
    throw new Error('UD_USERNAME and UD_PASSWORD must be set');
  }

  // Build the *host* entry used in UD’s zone editor for ZONE_ROOT
  // Examples:
  //   CERTBOT_DOMAIN = example.com         -> entry = _acme-challenge
  //   CERTBOT_DOMAIN = home.example.com    -> entry = _acme-challenge.home
  //   CERTBOT_DOMAIN = apps.example.com    -> entry = _acme-challenge.apps
  const entryHost = `_acme-challenge.${certbotDomain}`.replace(`.${ZONE_ROOT}`, '');

  // Update via Playwright automation (your existing function)
  await updateDNSChallenge({
    username: process.env.UD_USERNAME!,
    password: process.env.UD_PASSWORD!,
    entry: entryHost,
    challengeString: token,
    domain: ZONE_ROOT
  });

  await sleep(5000);

  // Now wait for authoritative propagation
  const fqdn = `_acme-challenge.${certbotDomain}.`;
  // await waitForAuthoritativeTXT(fqdn, token);
  process.exit(0);
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
