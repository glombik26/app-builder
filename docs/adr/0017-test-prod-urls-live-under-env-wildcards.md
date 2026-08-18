# TEST and PROD URLs live under *.test / *.prod wildcards with Traefik DNS-01

Each public HTTP service of a TEST stack is reached at `https://<service>--<project-slug>.test.glombik26.de`; PROD uses the same label under `*.prod.glombik26.de`. One wildcard A-record per zone points at the Platform VPS (`185.56.150.49`). `*.dev.glombik26.de` stays Previews; `*.preview.glombik26.de` stays on the other host. Slug rules match Preview: flatten to one DNS label so a single wildcard certificate covers each zone; if the label would exceed 63 characters the whole label becomes a short Platform id; two names that slug to the same label are rejected. Traefik ACME issues `*.test.glombik26.de` and `*.prod.glombik26.de` via IONOS DNS-01 into the same `acme.json`; the parent names are not on the certificates and have no A-record; HTTPS is required and HTTP redirects; there is no certbot and no certificate per hostname. Custom / vanity domains are out of scope for this map.

Reusing `*.dev.glombik26.de` was rejected: TEST and PROD would lie about their Environment and a Feature named `test` would collide with the Preview pattern. HTTP-01 per hostname was rejected: Let's Encrypt's 50-certificates-per-registered-domain week is shared with the other host, and Traefik already has a DNS-01 issuer. Path-based routing or a single "primary" public service was rejected: the compose contract already marks every public HTTP service. Multi-label names were rejected: neither a single wildcard A nor a single wildcard cert can cover them.

## Considered Options

- **One-label names under `*.test.glombik26.de` and `*.prod.glombik26.de`; two Traefik ACME DNS-01 wildcards via IONOS** (accepted)
- Reuse `*.dev.glombik26.de` (mix Environments, collide with Feature slugs)
- Custom / vanity hostname per Project (especially PROD)
- HTTP-01 / TLS-ALPN-01 per TEST/PROD hostname
- certbot (or another host tool) issues; Traefik only loads files
- One hostname per Project and Environment; extra services by path or dropped
- Multi-label hostnames (`service.project.test…`)
- Parent names `test.glombik26.de` / `prod.glombik26.de` as landing hosts
- HTTP without TLS on TEST/PROD
