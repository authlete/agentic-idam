import './globals.css';
import { Suspense, type ReactNode } from 'react';
import Nav from './nav';

export const metadata = {
  title: 'Agentic IDAM Demo Console',
  description: 'Agentic IDAM architecture demo',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <span className="brand">Agentic IDAM</span>
          <Suspense fallback={<nav />}><Nav /></Suspense>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
