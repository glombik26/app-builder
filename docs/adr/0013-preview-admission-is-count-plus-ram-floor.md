# Running Previews are capped by a configurable count plus a 2 GiB RAM floor; the Platform refuses, it never evicts

A Preview starts only when two gates pass: fewer than N running Previews on the Platform, and `MemAvailable` at least 2 GiB. N defaults to 4, lives in a file under Platform-home, must be an integer ≥ 1, and has no hard maximum — the RAM floor is the ceiling. TEST and PROD sit outside N and have priority: a Preview never displaces them and must not push the host into the OOM killer. If either gate fails, this start is refused; the Feature and Guided Workflow continue without a Preview. Lowering N does not stop stacks that already run. There is no override, including at the RAM floor. Home shows `k/N`; the Feature shows why a Preview is missing. The first-cut surface does not edit N.

A soft “operator watches load” policy was rejected: there is no swap, Previews start automatically, and the kernel would pick an arbitrary victim — Traefik, TEST, or PROD included. A RAM ledger per container was rejected as a spec-time admission system. Evicting the oldest Preview was rejected: the gate is a door, not a bouncer, and idle lifetime is a different question. Counting TEST and PROD as Preview slots was rejected: they are standing Environments, not Feature stacks. Baking N into the spec as a constant was rejected so the Operator can raise it after seeing real headroom. A Home field that writes N was rejected for the first cut: changing N is rare, the file is enough.

## Considered Options

- **Configurable platform-wide N (default 4) plus a fixed 2 GiB `MemAvailable` floor; refuse** (accepted)
- Soft visibility only; no gate
- Hard count only, no RAM floor
- RAM ledger / reservation per stack
- Evict the oldest Preview at the gate
- TEST and PROD consume the same slots as Previews
- N fixed in the spec; no Operator knob
- Operator override (“start anyway”)
- First-cut UI edits N
