import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Share Otomatis WA - Jadwal & Broadcast WhatsApp',
  description: 'Aplikasi otomatisasi kirim chat, jadwal, dan broadcast file WhatsApp secara berkala dan otomatis.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
