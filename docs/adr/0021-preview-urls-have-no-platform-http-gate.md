# Preview URLs have no platform HTTP gate

Each public HTTP service of a Preview is reachable from the network as soon as Traefik has a router: `https://<service>--<feature>--<project-slug>.dev.glombik26.de`. The Platform injects no HTTP Basic, no other shared secret, and no IP allowlist in front of that hostname. Who has the URL, or guesses the readable label, sees the app. The Feature's own login is not a Platform gate; webhooks and OAuth callbacks on a public service work because nothing sits in front.

A Platform gate using the control-plane Basic-Auth secret was rejected: that secret can merge to `main` and Freigabe to PROD, and sharing a Preview must not require it. A second shared secret for all Previews was rejected: one Operator, and it would deafen the same public services a Feature needs for callbacks. Per-Preview or per-service toggles were rejected: all public Preview services, same rule. TEST/PROD access is a different decision.

## Considered Options

- **No platform HTTP gate** (accepted)
- Same Basic Auth as the control plane
- Separate Basic Auth secret for all Previews
- IP allowlist
- Gate only on some Previews or some services
