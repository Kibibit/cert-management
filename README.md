<p align="center">
  <a href="https://github.com/kibibit/cert-management" target="blank">
    <img src="https://kibibit.io/kibibit-assets/SVG/kb-certificate.svg" width="150" alt="cert-management Logo" />
  </a>
  <h2 align="center">
    @kibibit/cert-management
  </h2>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@kibibit/cert-management"><img src="https://img.shields.io/npm/v/@kibibit/cert-management/latest.svg?style=for-the-badge&logo=npm&color=CB3837"></a>
</p>
<p align="center">
<a href="https://github.com/kibibit/cert-management/actions/workflows/main.yml">
  <img src="https://github.com/kibibit/cert-management/actions/workflows/main.yml/badge.svg?style=flat-square" alt="Main Workflow">
</a>
<a href="https://github.com/semantic-release/semantic-release">
  <img src="https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg" alt="semantic-release">
</a>
</p>
<p align="center">
  Automated SSL Certificate Management with DNS Challenge Support
</p>
<hr>

## Description

A robust certificate management solution that:
- Automates wildcard SSL certificate issuance and renewal using DNS challenges
- Integrates with Nginx Proxy Manager (NPM) for certificate management
- Supports United Domains DNS provider
- Handles certificate renewals non-interactively after initial setup

## Features

- 🔒 **Wildcard Certificates**: Support for multiple wildcard domains
- 🤖 **Automated DNS Challenges**: Handles DNS verification automatically
- 🔄 **Auto Renewal**: Non-interactive renewal process
- 🔌 **NPM Integration**: Direct integration with Nginx Proxy Manager
- 📝 **TypeScript Support**: Written in TypeScript for better maintainability

## Prerequisites

- Node.js 20+
- Nginx Proxy Manager instance
- United Domains account
- `certbot` installed on the system
- `dig` command available for DNS verification

## Environment Variables

Required environment variables:

```bash
# United Domains Credentials
UD_USERNAME=your-ud-username
UD_PASSWORD=your-ud-password

# Nginx Proxy Manager Configuration
NPM_BASE_URL=http://your-npm-instance:81
NPM_IDENTITY=your-npm-email
NPM_SECRET=your-npm-password

# Domain Configuration
DOMAIN=your-base-domain.com
WILDCARDS="*.your-domain.com,*.subdomain.your-domain.com"
```

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/kibibit/cert-management.git
   cd cert-management
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Usage

### Using Docker (Recommended)

1. Pull the Docker image:
   ```bash
   docker pull kibibitopensrc/cert-management:latest
   ```

   Available tags:
   - `latest`: Latest stable release
   - `vX.Y.Z`: Specific version (e.g., `v1.0.0`)
   - `vX.Y`: Minor version (e.g., `v1.0`)
   - `vX`: Major version (e.g., `v1`)

   View all available tags on [Docker Hub](https://hub.docker.com/r/kibibitopensrc/cert-management/tags)

2. Run the container with your environment variables:
   ```bash
   docker run -d \
     -e NPM_BASE_URL=http://your-npm-instance:81 \
     -e NPM_IDENTITY=your-npm-email \
     -e NPM_SECRET=your-npm-password \
     -e UD_USERNAME=your-ud-username \
     -e UD_PASSWORD=your-ud-password \
     -e WILDCARDS="*.your-domain.com,*.subdomain.your-domain.com" \
     -v /path/to/certificates:/root/kb-certs \
     kibibitopensrc/cert-management:latest
   ```

### Using Node.js Directly

1. Set up your environment variables (see above section)

2. Run the certificate maintenance script:
   ```bash
   # Using npm
   npm run start

   # Using ts-node (development)
   npm run start:dev
   ```

### Command Line Arguments

You can also provide configuration via command line arguments:

```bash
npx ts-node src/cert-maintenance.ts \
  --base-url=http://your-npm-instance:81 \
  --identity=your-npm-email \
  --secret=your-npm-password \
  --domain=your-domain.com \
  --wildcards="*.your-domain.com,*.other-domain.com" \
  --dry-run
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run start:dev

# Build the project
npm run build

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## How It Works

1. The script checks for existing valid certificates in NPM for each wildcard domain
2. If a certificate needs renewal:
   - Initiates certbot DNS challenge
   - Uses United Domains API to set required DNS records
   - Verifies DNS propagation
   - Obtains the certificate from Let's Encrypt
   - Uploads the new certificate to NPM
   - Updates NPM proxy hosts to use the new certificate
3. Cleanup is performed automatically

## Important Notes

- First-time certificate issuance requires DNS verification
- The script expects certbot configuration in `kb-certs` directory
- DNS propagation checks can take several minutes
- Uses dig with trace for reliable DNS verification
- Certificates are stored in NPM after issuance

## Stay in touch

- Author - [Neil Kalman](https://github.com/thatkookooguy)
- Website - [https://github.com/kibibit](https://github.com/kibibit)
- StackOverflow - [thatkookooguy](https://stackoverflow.com/users/1788884/thatkookooguy)
- Twitter - [@thatkookooguy](https://twitter.com/thatkookooguy)
- Twitter - [@kibibit_opensrc](https://twitter.com/kibibit_opensrc)

## License

This project is [MIT licensed](LICENSE).