# trust-chain-debug

A one-file Java console app that reproduces Authlete's OpenID Federation trust-chain resolution
locally, using the same Nimbus SDK. It resolves an RP up to a Trust Anchor and prints where it breaks.

## Run

- **IntelliJ:** open this folder (a Maven project) and run `TrustChainDebug.main`.
- **CLI:** `mvn -q compile exec:java`
- Optional args: `-Dexec.args="<rpEntityId> <trustAnchorEntityId>"`
  (defaults: RP `http://localhost:8092/agents/invoice-reconciler`, TA `https://localhost:8080`)
