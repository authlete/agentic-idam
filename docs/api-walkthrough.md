# Trust Controller Walkthrough

This walkthrough lets you run the Trust Controller demo yourself and see the agent identity lifecycle
in action, first in the user interface and then through the API, against our sandbox environment. The walkthrough is accompanied by a demo video.

The recording shows two agents from the simulated agent marketplace. The first, the Invoice Reconciler, is
taken through its lifecycle using the user interface. The second, the Incident Response Agent, is
driven through the API. The two are deliberately different: the Invoice Reconciler runs in a sandbox with no
delegation, while the Incident Response Agent runs in production and requests delegation. This lets you see how
governance produces different trust marks and different downstream effects for each. This document follows the
same two parts, so you can watch the video and then run the demo yourself.

The simulated marketplace also includes other sample agents. Any of them can be driven the same way.


## Sandbox Environment

Everything below points at a hosted sandbox. You only need `curl` and `python3` to run the demo steps.

- User interface: `https://console.trust.authlete.dev`
- Trust Controller API: `https://tc.trust.authlete.dev`
- Federation Bridge API: `https://bridge.trust.authlete.dev`
- Vouch API: `https://vouch.trust.authlete.dev` (OpenAPI docs: `https://vouch.trust.authlete.dev/docs`)
- Bearer token for the Vouch API: `12c53257012049d83e1616259d713850128c72f11a8d6d9b2b4d582bf8eee7fb`

The bearer token is a shared credential for this sandbox only. It authorizes calls to the Vouch API.


## Demo Components

Four components appear in the console UI, each matching a tab along the top.

1. Agent Marketplace. A simulated marketplace. It simulates handing over an agent manifest (identity metadata,
   environment, capabilities, owner) to the Trust Controller.
2. Trust Controller. The governance control plane. It owns the agent identity lifecycle,
   certification state, and capability policy. This is the component you (the Identity Platform Team) own and operate. It never
   issues or sees tokens; it governs the identity.
3. Vouch. The Authlete API that performs the OpenID Federation work the Trust Controller relies on: issuing
   trust marks, publishing the agent into the federation, and resolving trust chains. The Trust
   Controller calls Vouch on your behalf, and you can also call Vouch directly to inspect the
   federation state.
4. Federation Bridge. Turns a governed, certified agent identity into a registered OAuth client at
   your authorization server, using standard Dynamic Client Registration. This is just one bridge, but the same pattern can be used by other bridges to handle workload identity or authorization policy.

## Part 1: Demo using the UI

This is the first half of the recording. Open `https://console.trust.authlete.dev` and follow along.

1. Open the Agent Marketplace tab. Select the Invoice Reconciler from the catalog, confirm the owner,
   then choose Emit Manifest. The agent is now onboarded.
2. Open the Trust Controller tab. The new agent appears with the state pending approval. Select it to
   see its entity identifier, owner, environment, capability envelope, and trust marks.
3. Choose Approve. The Trust Controller issues the certification trust marks, publishes the agent into
   the federation, and moves the state to approved. The Representations panel now shows the federation
   publication, and within a moment the registered client identifier appears.
4. Open the Federation Bridge tab. You can see the verified trust chain and the OAuth client that was
   registered for the agent.
5. Back in the Trust Controller tab, exercise the rest of the lifecycle with Suspend, Reapprove,
   Revoke, and Retire. Each action updates the certification and the downstream registration to match.


## Part 2: Demo using the API

This is the second half of the recording, onboarding a second agent using only the API. Each step
corresponds to an equivalent action in the UI, so you can keep a browser tab open and watch the
same changes appear in the UI.

### Set up your terminal

```bash
TC=https://tc.trust.authlete.dev
BRIDGE=https://bridge.trust.authlete.dev
VOUCH=https://vouch.trust.authlete.dev
RP=https://rp.trust.authlete.dev
BEARER=12c53257012049d83e1616259d713850128c72f11a8d6d9b2b4d582bf8eee7fb
```

Entity identifiers are URLs, which must be URL encoded when used in a path. This helper encodes them:

```bash
AGENT=incident-response-agent
EID="$RP/agents/$AGENT"
EID_ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$EID")
TC_ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$TC")
```

### Step 1: Onboard the agent

In the UI, this is the Agent Marketplace, Emit Manifest action.

```bash
curl -sS -X POST "$TC/identities" -H 'content-type: application/json' -d "{
  \"agentRef\": \"$AGENT\",
  \"displayName\": \"Incident Response Agent\",
  \"owner\": { \"subject\": \"sre-oncall@example.com\", \"team\": \"Platform Reliability\" },
  \"environment\": \"production\",
  \"capabilities\": [\"read:logs\", \"read:alerts\", \"update:slack\"],
  \"delegationRequested\": true
}"
```

These values match the Incident Response Agent in the marketplace, so onboarding through the API
produces the same result you would get by selecting it in the Agent Marketplace tab.

In the UI: open the Trust Controller tab and refresh. The agent appears with the state
pending approval.

### Step 2: Review the agent identity

In the UI, this is selecting the agent in the Trust Controller tab.

```bash
curl -sS "$TC/identities/$EID_ENC"
```

The response is the governed identity: its state, owner, environment, capability envelope, trust
marks, and the downstream representations that will be filled in on approval.

### Step 3: Approve the agent

In the UI, this is the Approve button.

```bash
curl -sS -X POST "$TC/identities/$EID_ENC/transition/approve"
```

This single call runs an [orchestration workflow](#trust-controller-approval-workflow): the Trust Controller issues the
certification trust marks, publishes the agent into the federation through Vouch, and records the
approved state. Read the identity again to see the state change to approved and the trust marks turn
active. Because this agent runs in production and requests delegation, it receives three trust marks: agent
certified, production approved, and delegation permitted. The Invoice Reconciler in Part 1, a sandbox agent with
no delegation, received only agent certified and sandbox only. At this stage, the agent can be onboarded
automatically to an AS powered by Authlete, which natively supports OpenID Federation. For Ping Federate, the
Federation Bridge creates an OAuth client using DCR.

```bash
curl -sS "$TC/identities/$EID_ENC"
```

In the UI: refresh the Trust Controller tab. The state is now approved and the
Representations panel shows the federation publication.

### Step 4: See the federation result

The Federation Bridge registers the OAuth client automatically after approval. Read its record:

```bash
curl -sS "$BRIDGE/clients/$EID_ENC"
```

You will see the governance decision, the client metadata, and the assigned client identifier. Because delegation
was granted, the client metadata includes the token exchange grant type, which is the downstream effect of the
delegation permitted trust mark. A sandbox agent without delegation would not have it. In the UI, this is the
Federation Bridge tab.

You can also fetch the agent's own published entity configuration, which is standard OpenID
Federation and is public:

```bash
curl -sS "$EID/.well-known/openid-federation"
```

### Step 5: Inspect the federation through the Vouch API

The Trust Controller uses Authlete Vouch for all federation operations. You can call Vouch directly with the
bearer token to see the same federation from the outside.

Resolve the agent's trust chain:

```bash
curl -sS -X POST "$VOUCH/v1/anchors/cba-agents/resolve" \
  -H "Authorization: Bearer $BEARER" -H 'content-type: application/json' \
  -d "{\"parameters\":\"sub=$EID_ENC&trust_anchor=$TC_ENC\"}"
```

View the trust anchor's own entity configuration:

```bash
curl -sS -X POST "$VOUCH/v1/anchors/cba-agents/entity-configuration" \
  -H "Authorization: Bearer $BEARER" -H 'content-type: application/json' -d '{}'
```

The Vouch API docs are available at `https://vouch.trust.authlete.dev/docs`.

### Step 6: Continue the lifecycle

Each of these mirrors a button in the Trust Controller tab. Run one, then refresh the interface to
watch the state and the downstream registration change.

```bash
curl -sS -X POST "$TC/identities/$EID_ENC/transition/suspend"
curl -sS -X POST "$TC/identities/$EID_ENC/transition/reapprove"
curl -sS -X POST "$TC/identities/$EID_ENC/transition/revoke"
curl -sS -X POST "$TC/identities/$EID_ENC/transition/retire"
```

Suspend and Revoke withdraw the agent from the federation and remove its OAuth client. Reapprove
restores it. Retire is the final state.


## Trust Controller Approval Workflow

When you approve an agent, whether from the interface or the API, the Trust Controller performs a
single governed sequence:

1. It issues the certification trust marks for the agent.
2. It publishes the agent's entity configuration into the federation.
3. It registers the agent as a subordinate of the trust anchor, which makes the trust chain
   resolvable.
4. It records the approved state and emits an `evt:published` event, which different bridges can consume to create downstream representations. In the demo, the Federation Bridge only handles downstream OAuth client creation via DCR. That client is what your Ping AS, the runtime plane, uses to issue tokens.

The Federation Bridge listens for the `evt:published` event, then verifies the trust chain independently, registers the OAuth client at the
authorization server, and records the client identifier back on the agent identity. At that point the
agent is governed, certified, published in the federation, and registered as a client, which is the
state you see across the Trust Controller and Federation Bridge tabs.
