/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@whiskeysockets/baileys', 'pino', 'node-cron', 'qrcode'],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
