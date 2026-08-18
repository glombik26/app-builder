# TEST and PROD URLs have no platform HTTP gate

Each public HTTP service of TEST and of PROD is reachable from the network as soon as Traefik has a router: `https://<service>--<project-slug>.test.glombik26.de` and the same label under `*.prod.glombik26.de`. The Platform injects no HTTP Basic, no other shared secret, and no IP allowlist in front of those hostnames. Who has the URL, or guesses the readable label, sees the app. All Projects, all public services, same rule. The Project's own login is not a Platform gate; webhooks and OAuth callbacks on a public service work because nothing sits in front. Sharing TEST or PROD is copying the link — not the control-plane secret.

This is the same principle as [ADR 0021](0021-preview-urls-have-no-platform-http-gate.md), decided separately because TEST and PROD could have split (TEST gated, PROD open). A Platform gate using the control-plane Basic-Auth secret was rejected: that secret can merge to `main` and Freigabe TEST→PROD. A second shared secret for all TEST/PROD hosts was rejected: one Operator, and it would deafen the same public services a Project needs for callbacks. Gating only TEST was rejected: TEST has the same callback need, and sharing it would otherwise require the control-plane secret. Per-service or per-Project toggles and an IP allowlist were rejected.

## Considered Options

- **No platform HTTP gate on TEST or PROD** (accepted)
- Same Basic Auth as the control plane
- Separate Basic Auth secret for all TEST/PROD hosts
- Gate TEST, leave PROD open
- Gate only on some services or some Projects
- IP allowlist
