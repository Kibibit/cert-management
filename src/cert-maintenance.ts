#!/usr/bin/env node
/* eslint-disable */
'use strict';

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'child_process';
import { ensureDir, findProjectRoot, isExpired, willExpireSoon, parseArgs, sleep, toDateString } from './utils';
import { logErr, logInfo, logOk, logStep, logWarn } from './logger';
import { NpmService } from './npm.service';
import { INpmCertificate } from './types';

let npmService: NpmService;

const projectRoot = findProjectRoot(__dirname);

updateWildcardCertificates()
  .catch((error: Error) => {
    logErr(error.stack || error.message || String(error));

    process.exitCode = 1;
  });

async function updateWildcardCertificates() {
  const args = parseArgs(process.argv);
  const baseUrl = (args['base-url'] || process.env.NPM_BASE_URL) as string;
  const identity = (args.identity || process.env.NPM_IDENTITY) as string;
  const secret = (args.secret || process.env.NPM_SECRET || '') as string;
  const dryRun = Boolean(args['dry-run']);
  const domain = (args.domain || process.env.DOMAIN) as string;
  // Wildcards can be provided as comma-separated list: --wildcards=*.example.com,*.test.com
  let wildcards = (args.wildcards || process.env.WILDCARDS?.split(',') || []) as string[];
  wildcards = (Array.isArray(wildcards) ? wildcards : [ wildcards ]);

  if (wildcards.length === 0) {
    logWarn('No wildcards provided. Set via --wildcards=...');
    process.exitCode = 1;
    return;
  }

  if (!baseUrl || !identity || !secret || !domain) {
    logWarn('NPM base URL, identity, secret, and domain must be provided.');
    logWarn('Set via --base-url=... --identity=... --secret=... --domain=...');
    logWarn('or set environment variables NPM_BASE_URL, NPM_IDENTITY, NPM_SECRET, and DOMAIN');
    process.exitCode = 1;
    return;
  }

  if (!process.env.UD_USERNAME || !process.env.UD_PASSWORD) {
    logWarn('UD_USERNAME and UD_PASSWORD must be set');
    process.exitCode = 1;
    return;
  }

  logStep('Authenticating to Nginx Proxy Manager');
  npmService = new NpmService(baseUrl, identity, secret);
  logOk('Authenticated.');

  for (const wildcard of wildcards) {
    try {
      const { certId } = await ensureValidCertificate(wildcard, { dryRun });
      const changed = await npmService.updateHostsForWildcard(wildcard, certId, { dryRun });
      if (changed > 0) {
        logOk(`Updated ${ changed } host(s) for ${ wildcard }.`);
      } else {
        logInfo(`No updates needed for ${ wildcard }.`);
      }
    } catch (error) {
      logErr(`Error handling ${ wildcard }: ${ error.message || error }`);
    }
  }

  // await npmService.cleanupUnusedCertificates(wildcards, { dryRun });

  logOk('Done.');
}



function getCertbotCommandForWildcard(wildcard: string) {
  const baseDomain = wildcard.replace(/^\*\./, '');
  return `sudo certbot certonly --manual --preferred-challenges dns --email neilkalman@gmail.com --agree-tos --no-eff-email -d "${ wildcard }" --config-dir ~/kb-certs`;
}


async function verifyDNSChallenge(
  domain: string,
  expectedValue: string
): Promise<boolean> {
  logStep('Verifying DNS record propagation...');
  const maxAttempts = 20;  // Increase max attempts
  const delaySeconds = 240;  // Increase delay between attempts

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        console.log(`Digging for ${domain}`);
        // Use local resolver and force recursive lookup
        const dig = spawn('dig', [`_acme-challenge.${domain}`, 'TXT', '+trace']);
        let output = '';
        
        dig.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        dig.on('close', (code) => {
          if (code === 0) {
            // Extract TXT record from trace output
            const txtMatch = output.match(/_acme-challenge\.[^"]*\s+TXT\s+"([^"]+)"/);
            if (txtMatch) {
              resolve(txtMatch[1]);
            } else {
              resolve(''); // No match found
            }
          } else {
            reject(new Error(`dig exited with code ${code}`));
          }
        });
      });

      console.log(`DNS result: ${result}`);
      console.log(`Expected value: ${expectedValue}`);

      if (result === expectedValue) {
        logOk('DNS challenge verified!');
        return true;
      }

      logInfo(`DNS not propagated yet (attempt ${attempt}/${maxAttempts}), waiting ${delaySeconds}s...`);
      await sleep(delaySeconds * 1000);
    } catch (error) {
      logWarn(`DNS check failed: ${error.message}`);
      await sleep(delaySeconds * 1000);
    }
  }

  throw new Error('DNS challenge verification timed out');
}

async function runCertbot(wildcard: string, dryRun = false): Promise<{ success: boolean }> {
  if (dryRun) {
    logInfo('Dry-run: would run certbot for DNS challenge');
    return { success: true };
  }


  const certRoot = path.join(projectRoot, 'kb-certs');
  // delete the cert root directory
  fs.rmSync(certRoot, { recursive: true, force: true });
  const configDir = certRoot;
  const workDir   = path.join(certRoot, 'work');
  const logsDir   = path.join(certRoot, 'logs');
  [configDir, workDir, logsDir].forEach(ensureDir);

  const authHook  = path.join(projectRoot, 'auth-hook.sh');
  const cleanHook = path.join(projectRoot, 'cleanup-hook.sh');
  fs.chmodSync(authHook, 0o755);
  fs.chmodSync(cleanHook, 0o755);

  const args = [
    'certonly',
    '--manual',
    '--preferred-challenges', 'dns',
    '--email', 'neilkalman@gmail.com',
    '--agree-tos',
    '--no-eff-email',
    '--non-interactive',
    '--manual-auth-hook', authHook,
    '--manual-cleanup-hook', cleanHook,
    '-d', wildcard,
    '--config-dir', configDir,
    '--work-dir', workDir,
    '--logs-dir', logsDir,
  ];

  return new Promise((resolve, reject) => {
    const certbotProcess = spawn('certbot', args, { stdio: 'inherit' });
    certbotProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        reject(new Error(`Certbot failed with code ${code}`));
      }
    });
  });
}

function getLiveCertPathsForWildcard(wildcard: string) {
  const baseDomain = wildcard.replace(/^\*\./, '');
  const liveDir = path.join(projectRoot, 'kb-certs', 'live', baseDomain);
  return {
    fullchain: path.join(liveDir, 'fullchain.pem'),
    privkey: path.join(liveDir, 'privkey.pem'),
  };
}

function filterCertificatesForWildcard(wildcard: string, certs: INpmCertificate[]) {
  return certs
    .filter((certificate) =>
      Array.isArray(certificate.domain_names) &&
      certificate.domain_names.includes(wildcard)
    );
}

function filterValidCertificates(certs: INpmCertificate[]) {
  return certs.filter((certificate) => {
    const expired = isExpired(certificate.expires_on);
    const expiringSoon = willExpireSoon(certificate.expires_on);
    return !expired && !expiringSoon;
  });
}

function getLongestValidCertificate(certs: INpmCertificate[]) {
  return certs
    .sort((a, b) => new Date(b.expires_on).getTime() - new Date(a.expires_on).getTime())[0];
}

async function ensureValidCertificate(
  wildcard: string,
  { dryRun }: { dryRun: boolean }
): Promise<{ certId: string | null, created: boolean }> {
  logStep(`Checking certificates for ${wildcard}`);
  const certs = await npmService.npmGetCertificates();

  const relevantCertificates = filterCertificatesForWildcard(wildcard, certs);
  const valid = filterValidCertificates(relevantCertificates);

  if (valid.length > 0) {
    const best = getLongestValidCertificate(valid);
    logOk(`Found valid certificate id=${best.id} for ${wildcard} expires_on=${best.expires_on}`);

    return { certId: best.id, created: false };
  }

  // Check if there are any certificates that are not expired but will expire soon
  const expiringCerts = relevantCertificates.filter(cert => !isExpired(cert.expires_on) && willExpireSoon(cert.expires_on));
  
  if (expiringCerts.length > 0) {
    const expiringCert = getLongestValidCertificate(expiringCerts);
    logWarn(`Certificate for ${wildcard} will expire soon (on ${expiringCert.expires_on}). Starting preemptive renewal...`);
  } else {
    logWarn(`No valid certificate found for ${wildcard}. Starting automated renewal...`);
  }

  if (dryRun) {
    logInfo('Dry-run: would attempt automated certificate renewal');
    return { certId: null, created: false };
  }

  try {
    // Run certbot and handle DNS challenge
    await runCertbot(wildcard, dryRun);

    // Read and upload the new certificate
    const { fullchain, privkey } = getLiveCertPathsForWildcard(wildcard);
    if (!fs.existsSync(fullchain) || !fs.existsSync(privkey)) {
      throw new Error(`Expected certificate files not found: ${fullchain} / ${privkey}`);
    }

    const certificate = fs.readFileSync(fullchain, 'utf8');
    const certificate_key = fs.readFileSync(privkey, 'utf8');

      const nice_name = `${wildcard} - ${toDateString(new Date())}`;
      // Log certificate details for debugging
      logInfo(`Certificate length: ${certificate.length}`);
      logInfo(`Private key length: ${certificate_key.length}`);

      const payload = {
        provider: 'other',
        nice_name,
        domain_names: [wildcard],
        meta: {
          certificate: certificate.trim(),
          certificate_key: certificate_key.trim()
        }
      };

    logStep(`Uploading new certificate to NPM: ${nice_name}`);
    await npmService.npmCreateCertificate(payload);
    logOk('Upload complete.');

    // Re-fetch and return the new id
    const after = await npmService.npmGetCertificates();
    const created = after.find((c) => c.nice_name === nice_name);
    if (!created) throw new Error('Uploaded certificate not found after creation');
    logOk(`New certificate id=${created.id} ready.`);
    return { certId: created.id, created: true };
  } catch (error) {
    logErr(`Certificate renewal failed: ${error.message}`);
    throw error;
  }
}


