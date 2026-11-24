'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Hub from '@/components/hub';
import { gamePageForPath } from '@/components/game-platforms';

export default function GamesLayout({ children }: { children: ReactNode }) {
  const section = gamePageForPath(usePathname());
  return <><Hub section={section}/>{children}</>;
}
