'use client';

// Shared data loading for the two agent-scoped views (Trust Controller, Federation Bridge).
// Both need the same three things: the agent list, a refresh, and a "select an agent" action
// that loads its detail AND keeps ?agent= in the URL (so the selection survives a tab switch).
//
// The caller passes `loadDetail` — the per-view function that fetches whatever that view shows
// for one agent. This hook wraps it with URL syncing and error handling.

import { useCallback, useEffect, useState } from 'react';
import { api, type AgentIdentity } from './api';
import { useAgentUrl } from './useAgentUrl';

export function useAgentList(loadDetail: (entityId: string) => Promise<void> | void) {
  const [list, setList] = useState<AgentIdentity[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setList(await api.listIdentities());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const load = useCallback(
    async (entityId: string) => {
      setError(null);
      try {
        await loadDetail(entityId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [loadDetail],
  );

  const select = useAgentUrl(load); // load + keep ?agent= in sync across tabs

  return { list, reload, select, error, setError };
}
