# Control-plane UI is public at platform.glombik26.de behind Traefik Basic Auth

The Operator surface is reached at `https://platform.glombik26.de` on the Platform VPS (`185.56.150.49`). The same Traefik that owns 80/443 terminates TLS: one extra ACME DNS-01 certificate for that name in the existing `acme.json`, HTTPS required, HTTP redirects. A single shared secret, checked by Traefik as HTTP Basic before any HTML, is the only HTTP gate. There is one Operator; two people on two networks share that secret. The Platform does not have a second identity. Device-code remains the Grok subscription, not this gate.

An SSH tunnel to localhost was rejected: two networks need a browser without the VPS key. A name under `*.dev|test|prod.glombik26.de` was rejected: those labels are Environments. A second TLS listener or certbot was rejected: Traefik already owns 80/443 and the IONOS issuer. No HTTP gate was rejected: once Grok is signed in, the surface can merge to `main` and Freigabe to PROD. Two Operator accounts were rejected: multi-user is out of scope. An in-app login form was rejected: the surface has no identity.

## Considered Options

- **Public `platform.glombik26.de`; same Traefik; DNS-01 cert; one Basic-Auth secret** (accepted)
- SSH tunnel to localhost
- Public hostname under an Environment wildcard
- Second TLS entry or certbot
- HTTP without TLS
- No HTTP gate (Device-code as access control)
- Two Operator identities
- Login form in the app
- IP allowlist
