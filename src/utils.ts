import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'util';

export const sleep = promisify(setTimeout);

// Simple color helpers without adding new deps
export const color = {
  green: (text: string) => `\x1b[32m${ text }\x1b[0m`,
  red: (text: string) => `\x1b[31m${ text }\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${ text }\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${ text }\x1b[0m`,
  bold: (text: string) => `\x1b[1m${ text }\x1b[0m`
};

export function parseArgs(
  argv: string[]
): Record<string, string | boolean | string[]> {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const argument = argv[i];
    if (isCliFlag(argument)) {
      const { key, value } = getFlagKeyValue(argument);
      // eslint-disable-next-line no-undefined
      const isFlagBoolean = value === undefined;
      const isFlagArray = value.includes(',');

      if (isFlagBoolean) {
        args[key] = true;
      } else if (isFlagArray) {
        // Split comma-separated values into array, trim whitespace
        args[key] = value.split(',').map((item) => item.trim());
      } else {
        args[key] = value;
      }
    }
  }
  return args;
}

function isCliFlag(argument: string) {
  return argument.startsWith('--');
}

function getFlagKeyValue(argument: string) {
  const [ key, value ] = argument.replace(/^--/, '').split('=');
  return { key, value };
}

export function toDateString(dt: Date) {
  const y = dt.getFullYear();
  const m = `${ dt.getMonth() + 1 }`.padStart(2, '0');
  const d = `${ dt.getDate() }`.padStart(2, '0');
  return `${ y }-${ m }-${ d }`;
}

export function isExpired(expiresOn: string) {
  if (!expiresOn) return true;
  const t = new Date(expiresOn).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() > t;
}

export function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // fallback: parent of src/ or dist/
  return path.resolve(startDir, '..');
}

export function hostMatchesWildcard(hostDomain: string, wildcard: string) {
  // Match exactly one label before the base domain
  // e.g. '*.example.com' matches 'arcade.example.com' (3 labels),
  // but NOT 'audiobookshelf.home.example.com' (4 labels)
  const base = wildcard.replace(/^\*\./, '');
  if (!hostDomain.endsWith(`.${ base }`)) return false;
  const hostLabels: number = hostDomain.split('.').length;
  const baseLabels: number = base.split('.').length;

  return hostLabels === (baseLabels + 1);
}

export function normalizeDomainsField(domains: string | string[]): string[] {
  if (!domains) return [];
  if (Array.isArray(domains)) return domains;
  if (typeof domains === 'string') {
    return domains
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
