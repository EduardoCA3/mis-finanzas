import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mis Finanzas',
  description: 'Dashboard privado para organizar ingresos y gastos.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
