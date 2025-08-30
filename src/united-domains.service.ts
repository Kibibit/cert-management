import { logErr, logOk, logStep } from './logger';
import { updateDNSChallenge } from './update-dns';

export async function updateUnitedDomainsDNS(
  domain: string,
  challenge: string
): Promise<boolean> {
  const username = process.env.UD_USERNAME;
  const password = process.env.UD_PASSWORD;

  if (!username || !password) {
    throw new Error('UD_USERNAME and UD_PASSWORD environment variables must be set');
  }

  try {
    logStep('Updating DNS record using Playwright...');
    const entry = `_acme-challenge.${ domain }`;
    await updateDNSChallenge({
      username,
      password,
      entry,
      challengeString: challenge,
      domain
    });

    logOk('DNS record updated successfully');
    return true;
  } catch (error) {
    logErr(`Failed to update DNS: ${ error.message }`);
    if (error.stack) {
      logErr(`Stack trace: ${ error.stack }`);
    }
    return false;
  }
}
