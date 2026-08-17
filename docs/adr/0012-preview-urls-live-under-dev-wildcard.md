# Preview URLs live under *.dev.glombik26.de with one Traefik DNS-01 wildcard

Each public HTTP service of a Preview is reached at `https://<service>--<feature>--<project-slug>.dev.glombik26.de`. One wildcard A-record points `*.dev.glombik26.de` at the Platform VPS (`185.56.150.49`). `*.preview.glombik26.de` stays on the other host. Names flatten to one DNS label so a single wildcard certificate covers them; if the label would exceed 63 characters the whole label becomes a short Platform id; two operator names that slug to the same label are rejected. Traefik ACME issues `*.dev.glombik26.de` once via IONOS DNS-01; the parent name is not on the certificate; there is no certbot and no certificate per Preview hostname.

Reusing the existing `*.preview` wildcard was rejected: it points at 87.106.34.240. HTTP-01 per hostname was rejected: Let's Encrypt's 50-certificates-per-registered-domain week is shared with that other host. A second issuer on the box was rejected: Traefik already owns 80/443. Multi-label names (`service.feature.project.dev…`) were rejected: neither a single wildcard A nor a single wildcard cert can cover them.

## Considered Options

- **One-label names under `*.dev.glombik26.de`; Traefik ACME DNS-01 wildcard via IONOS** (accepted)
- Reuse `*.preview.glombik26.de` (other host)
- HTTP-01 / TLS-ALPN-01 per Preview hostname
- certbot (or another host tool) issues; Traefik only loads files
- Multi-label hostnames
- Always-opaque Platform ids (no readable host)
- HTTP without TLS on DEV
