import './style.css';

export const metadata = {
  title: 'Realtime Chat',
  description: 'Private messaging and calls',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="az">
      <body>{children}</body>
    </html>
  );
}