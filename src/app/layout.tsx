import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pin2Plate (P2P) — From Saved Pins to Cooked Dinners',
  description:
    'Turn Pinterest recipe videos and images into clear step-by-step cooking plans and consolidated UK supermarket baskets.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#FAF7F2] text-[#1C1917] font-sans antialiased selection:bg-[#D93B22]/15 selection:text-[#B82D17]">
        {children}
      </body>
    </html>
  );
}
