import type { Metadata, Viewport } from 'next';
import './globals.css';
import '../components/sync.css';
import '../components/news.css';
import { SyncProvider } from '@/components/sync-provider';
export const metadata: Metadata = { title: 'WOONG HUB · 나만의 일상, 하나의 공간', description: '오늘의 일정부터 오디오, 게임, 음악까지. 취미와 일상을 연결하는 개인 대시보드.', manifest: '/manifest.webmanifest', appleWebApp: { capable: true, title: 'WOONG HUB', statusBarStyle: 'black-translucent' } };
export const viewport: Viewport = { themeColor: '#101114', width: 'device-width', initialScale: 1 };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="ko" suppressHydrationWarning><body><SyncProvider>{children}</SyncProvider></body></html>; }
