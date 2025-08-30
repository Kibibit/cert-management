// NPM API Types

// Authentication
export interface INpmLoginRequest {
  identity: string;
  secret: string;
}

export interface INpmLoginResponse {
  token: string;
}

// Certificates
export interface INpmCertificate {
  id: string;
  created_on: string;
  modified_on: string;
  owner_user_id: number;
  is_deleted: boolean;
  provider: string;
  nice_name: string;
  domain_names: string[];
  expires_on: string;
  meta: {
    certificate: string;
    certificate_key: string;
  };
}

export interface INpmCreateCertificateRequest {
  provider: string;
  nice_name: string;
  domain_names: string[];
  meta: {
    certificate: string;
    certificate_key: string;
  };
}

// Hosts
export interface INpmHostBase {
  id: string;
  created_on: string;
  modified_on: string;
  owner_user_id: number;
  owner?: string;
  is_deleted: boolean;
  deleted_at?: string;
  status?: string;
  domain_names: string | string[];
  certificate_id: string | null;
  ssl_forced: boolean;
  http2_support: boolean;
  hsts_enabled: boolean;
  hsts_subdomains: boolean;
  enabled: boolean;
}

export type INpmAllHosts = INpmProxyHost | INpmRedirectionHost;

export interface INpmProxyHost extends INpmHostBase {
  forward_scheme: string;
  forward_host: string;
  forward_port: number;
  access_list_id: string | null;
  advanced_config: string;
  block_exploits: boolean;
  caching_enabled: boolean;
  allow_websocket_upgrade: boolean;
  // Can be detailed further if needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locations: any[];
  meta: {
    letsencrypt_agree: boolean;
    dns_challenge: boolean;
  };
}

export interface INpmRedirectionHost extends INpmHostBase {
  forward_domain_name: string;
  forward_scheme: string;
  forward_http_code: number;
  preserve_path: boolean;
  block_exploits: boolean;
  advanced_config: string;
  meta: {
    letsencrypt_agree: boolean;
    dns_challenge: boolean;
  };
}


// Host Groups Type
export type INpmHostGroup = 'proxy-hosts' | 'redirection-hosts';
