import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Standalone output is for the Docker image; it needs symlinks, which
  // Windows dev machines often can't create — so it's opt-in via env
  output: process.env.NEXT_STANDALONE === '1' ? 'standalone' : undefined,
  transpilePackages: ['@gamehub/sdk'],
};

export default withNextIntl(nextConfig);
