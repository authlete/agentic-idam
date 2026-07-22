'use client';

// Top nav. Client component so the Trust Controller and Federation Bridge links carry the
// currently-selected agent (?agent=<entityId>): pick an agent in one view and it stays selected
// when you switch to the other. Overview and Agent Marketplace are not agent-scoped.

import { useSearchParams } from 'next/navigation';

export default function Nav() {
  const agent = useSearchParams().get('agent');
  const q = agent ? `?agent=${encodeURIComponent(agent)}` : '';
  return (
    <nav>
      <a href="/">Overview</a>
      <a href="/marketplace">Agent Marketplace</a>
      <a href={`/trust-controller${q}`}>Trust Controller</a>
      <a href={`/federation-bridge${q}`}>Federation Bridge</a>
    </nav>
  );
}
