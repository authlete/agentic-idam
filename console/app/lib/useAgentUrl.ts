'use client';

// Keeps the selected agent in the ?agent= query param, shared by the Trust Controller and
// Federation Bridge views. On first load it restores the agent from the URL; the returned
// `select` loads an agent AND writes it back to the URL, so the nav links and the other tab
// stay in sync. `load` fetches + sets state for one agent and must be stable (useCallback).

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function useAgentUrl(load: (entityId: string) => void): (entityId: string) => void {
  const router = useRouter();
  const pathname = usePathname();
  const restored = useRef(false);

  const select = useCallback((entityId: string) => {
    load(entityId);
    router.replace(`${pathname}?agent=${encodeURIComponent(entityId)}`, { scroll: false });
  }, [load, router, pathname]);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const fromUrl = new URLSearchParams(window.location.search).get('agent');
    if (fromUrl) select(fromUrl);
  }, [select]);

  return select;
}
