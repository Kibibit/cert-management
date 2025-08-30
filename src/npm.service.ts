import axios, { AxiosInstance } from 'axios';
import * as FormData from 'form-data';

import { logErr, logInfo, logOk, logStep, logWarn } from './logger';
import {
  INpmAllHosts,
  INpmCertificate,
  INpmCreateCertificateRequest,
  INpmHostGroup,
  INpmLoginRequest,
  INpmLoginResponse,
  INpmProxyHost,
  INpmRedirectionHost
} from './types';
import { hostMatchesWildcard, isExpired, normalizeDomainsField } from './utils';

export class NpmService {
  private readonly npmAxiosInstance: AxiosInstance;
  private tokenPromise: Promise<string>;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string
  ) {
    this.baseUrl = baseUrl;
    this.npmAxiosInstance = axios.create({
      baseURL: baseUrl,
      validateStatus: () => true,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async npmLogin(
    baseUrl: string,
    identity: string,
    secret: string
  ): Promise<string> {
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    const request: INpmLoginRequest = { identity, secret };
    const { data } = await this.npmAxiosInstance.post<INpmLoginResponse>(
      'api/tokens',
      request
    );
    if (!data || !data.token) throw new Error('NPM login failed: no token returned');

    this.npmAxiosInstance
      .defaults
      .headers
      .common
      .Authorization = `Bearer ${ data.token }`;

    this.tokenPromise = Promise.resolve(data.token);
    return data.token;
  }

  async npmGetCertificates(): Promise<INpmCertificate[]> {
    await this.npmLogin(this.baseUrl, this.username, this.password);
    const { data } = await this.npmAxiosInstance
      .get<INpmCertificate[]>('api/nginx/certificates');

    return data;
  }

  private async validateCertificate(
    certificate: string,
    certificateKey: string
  ): Promise<void> {
    const formData = new FormData();
    formData.append('certificate', Buffer.from(certificate), {
      filename: 'fullchain.pem',
      contentType: 'application/x-x509-ca-cert'
    });
    formData.append('certificate_key', Buffer.from(certificateKey), {
      filename: 'privkey.pem',
      contentType: 'application/x-x509-ca-cert'
    });

    const { status, data } = await this.npmAxiosInstance.post(
      'api/nginx/certificates/validate',
      formData,
      {
        headers: {
          ...formData.getHeaders()
        }
      }
    );

    if (status !== 200) {
      throw new Error(
        `Certificate validation failed: ${ JSON.stringify(data) }`
      );
    }
  }

  private async createEmptyCertificate(niceName: string): Promise<string> {
    const { status, data } = await this.npmAxiosInstance.post<INpmCertificate>(
      'api/nginx/certificates',
      {
        nice_name: niceName,
        provider: 'other'
      }
    );

    if (status !== 201 && status !== 200) {
      throw new Error(
        `Failed to create certificate record: ${ JSON.stringify(data) }`
      );
    }

    return data.id;
  }

  private async uploadCertificateFiles(
    certId: string,
    certificate: string,
    certificateKey: string
  ): Promise<void> {
    const formData = new FormData();
    formData.append('certificate', Buffer.from(certificate), {
      filename: 'fullchain.pem',
      contentType: 'application/x-x509-ca-cert'
    });
    formData.append('certificate_key', Buffer.from(certificateKey), {
      filename: 'privkey.pem',
      contentType: 'application/x-x509-ca-cert'
    });

    const { status, data } = await this.npmAxiosInstance.post(
      `api/nginx/certificates/${ certId }/upload`,
      formData,
      {
        headers: {
          ...formData.getHeaders()
        }
      }
    );

    if (status !== 200) {
      throw new Error(`Certificate upload failed: ${ JSON.stringify(data) }`);
    }
  }

  async npmCreateCertificate(
    payload: INpmCreateCertificateRequest
  ): Promise<INpmCertificate> {
    try {
      await this.npmLogin(this.baseUrl, this.username, this.password);

      // Step 1: Validate certificate files
      await this.validateCertificate(
        payload.meta.certificate,
        payload.meta.certificate_key
      );

      // Step 2: Create empty certificate record
      const certId = await this.createEmptyCertificate(payload.nice_name);

      // Step 3: Upload certificate files
      await this.uploadCertificateFiles(
        certId,
        payload.meta.certificate,
        payload.meta.certificate_key
      );

      // Get and return the created certificate
      const certificates = await this.npmGetCertificates();
      const created = certificates.find((c) => c.id === certId);
      if (!created) {
        throw new Error('Created certificate not found after upload');
      }

      return created;
    } catch (error) {
      if (error.response) {
        logErr(
          `Certificate creation failed with status ${ error.response.status }`
        );
        logErr(`Error response: ${ JSON.stringify(error.response.data) }`);
      }
      throw error;
    }
  }

  async npmDeleteCertificate(id: string): Promise<number> {
    const { status } = await this.npmAxiosInstance
      .delete(`api/nginx/certificates/${ id }`);

    return status;
  }

  async npmListHosts<T extends INpmAllHosts>(
    group: INpmHostGroup
  ): Promise<T[]> {
    const { data } = await this.npmAxiosInstance
      .get<T[]>(`api/nginx/${ group }`);
    return data;
  }

  async npmGetHost<T extends INpmAllHosts>(
    group: INpmHostGroup,
    id: string
  ): Promise<T> {
    const { data } = await this.npmAxiosInstance
      .get<T>(`api/nginx/${ group }/${ id }`);
    return data;
  }

  async npmUpdateHost<T extends INpmProxyHost | INpmRedirectionHost>(
    group: INpmHostGroup,
    id: string,
    body: Partial<T>
  ): Promise<number> {
    const { status } = await this.npmAxiosInstance
      .put<T>(`api/nginx/${ group }/${ id }`, body);
    return status;
  }

  async cleanupUnusedCertificates(
    targetWildcards: string[],
    { dryRun }: { dryRun: boolean }
  ): Promise<number> {
    logStep('Cleanup: scanning for unused or expired certificates');
    const certificates = await this.npmGetCertificates();
    const proxy = await this.npmListHosts('proxy-hosts');
    const redir = await this.npmListHosts('redirection-hosts');
    const used = new Set();
    proxy.forEach((h) => { if (h.certificate_id) used.add(h.certificate_id); });
    redir.forEach((h) => { if (h.certificate_id) used.add(h.certificate_id); });

    const targetSet = new Set(targetWildcards);
    let deletions = 0;
    for (const certificate of certificates) {
      const domains = Array.isArray(certificate.domain_names) ?
        certificate.domain_names :
        [];
      const matchesTarget = domains.some((d) => targetSet.has(d));
      const expired = isExpired(certificate.expires_on);
      const referenced = used.has(certificate.id);

      // Skip if:
      // 1. Certificate doesn't match our target domains
      // 2. Certificate is referenced and not expired
      // 3. Certificate was created in the last 5 minutes (grace period for host updates)
      if (!matchesTarget) continue;
      if (referenced && !expired) continue;

      const gracePeriod = 5 * 60 * 1000;
      const certificateCreatedAgo =
        new Date().getTime() - new Date(certificate.created_on).getTime();
      const createdWithinGracePeriod = certificate.created_on &&
        (certificateCreatedAgo < gracePeriod);

      if (createdWithinGracePeriod) {
        logInfo([
          `Skip delete cert id=${ certificate.id }`,
          '(created within grace period)'
        ].join(' '));
        continue;
      }

      const reason = expired ? 'expired' : 'unreferenced';
      if (dryRun) {
        logInfo([
          'Dry-run: would delete certificate',
          `id=${ certificate.id }`,
          JSON.stringify(domains),
          `(${ reason })`
        ].join(' '));
        deletions += 1;
        continue;
      }
      const status = await this.npmDeleteCertificate(certificate.id);
      if (status >= 200 && status < 300) {
        logOk([
          `Deleted certificate id=${ certificate.id }`,
          JSON.stringify(domains),
          `(${ reason })`
        ].join(' '));
        deletions += 1;
      } else {
        logWarn([
          `Skip delete cert id=${ certificate.id }`,
          `(${ reason }) status=${ status })`
        ].join(' '));
      }
    }
    if (deletions === 0) logInfo('Cleanup: nothing to delete.');
    return deletions;
  }

  async updateHostsForWildcard(
    wildcard: string,
    newCertId: string,
    { dryRun }: { dryRun: boolean }
  ): Promise<number> {
    // , 'redirection-hosts'
    const groups: INpmHostGroup[] = [ 'proxy-hosts' ];
    let updates = 0;
    for (const group of groups) {
      logStep(`Scanning ${ group } for domains matching ${ wildcard }`);
      const list = group === 'proxy-hosts' ?
        await this.npmListHosts<INpmProxyHost>(group) :
        await this.npmListHosts<INpmRedirectionHost>(group);
      for (const host of list) {
        const domains = normalizeDomainsField(host.domain_names);
        const matches = domains.some((d) => hostMatchesWildcard(d, wildcard));
        if (!matches) continue;
        if (host.certificate_id === newCertId) {
          logInfo([
            '[skip]',
            `${ group } id=${ host.id }`,
            `already uses cert ${ newCertId }`
          ].join(' '));
          continue;
        }

        logInfo([
          `${ group } id=${ host.id }`,
          JSON.stringify(domains),
          `switching certificate → ${ newCertId }`
        ].join(' '));
        if (dryRun) {
          logInfo('Dry-run: would update host');
          updates += 1;
          continue;
        }

        const detail = group === 'proxy-hosts' ?
          await this.npmGetHost<INpmProxyHost>(group, host.id) :
          await this.npmGetHost<INpmRedirectionHost>(group, host.id);
        let updateBody;
        if (group === 'redirection-hosts') {
          // Get current host data and preserve most fields
          const current = await this.npmGetHost<INpmRedirectionHost>(
            group,
            host.id
          );

          if (!current) {
            logErr([
              'Failed to get current host data',
              `${ group } id=${ host.id }`
            ].join(' '));
            continue;
          }

          // Keep everything exactly as is, just update certificate_id
          updateBody = {
            domain_names: current.domain_names,
            forward_domain_name: current.forward_domain_name,
            forward_scheme: current.forward_scheme,
            forward_http_code: current.forward_http_code,
            certificate_id: newCertId,
            ssl_forced: current.ssl_forced,
            block_exploits: current.block_exploits,
            advanced_config: current.advanced_config,
            meta: current.meta,
            http2_support: current.http2_support,
            enabled: current.enabled,
            hsts_enabled: current.hsts_enabled,
            hsts_subdomains: current.hsts_subdomains,
            preserve_path: current.preserve_path
          };
        } else {
          // Proxy hosts: mutate detail and strip read-only fields
          const body = { ...detail, certificate_id: newCertId };
          delete body.id;
          delete body.created_on;
          delete body.modified_on;
          delete body.owner_user_id;
          delete body.owner;
          delete body.is_deleted;
          delete body.deleted_at;
          delete body.status;

          updateBody = body;
        }

        try {
          logInfo([
            `Updating ${ group } id=${ host.id }`
          ].join(' '));
          const status = await this.npmUpdateHost(group, host.id, updateBody);
          if (status >= 200 && status < 300) {
            logOk([
              `${ group } id=${ host.id }`,
              `updated to certificate ${ newCertId }`
            ].join(' '));
            updates += 1;
          } else {
            logErr([
              `${ group } id=${ host.id }`,
              `update failed (status ${ status })`
            ].join(' '));
            // Get error details if available
            const errorDetail = await this.npmGetHost(group, host.id);
            logErr([
              'Current host state:',
              JSON.stringify(errorDetail)
            ].join(' '));
          }
        } catch (error) {
          logErr([
            `${ group } id=${ host.id }`,
            `update error: ${ error.message }`
          ].join(' '));
          if (error.response) {
            logErr([
              'Response data:',
              JSON.stringify(error.response.data)
            ].join(' '));
          }
        }
      }
    }
    return updates;
  }
}
