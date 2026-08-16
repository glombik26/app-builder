# A Project carries its own GitHub credential; the Platform has none

A private Project is cloned with a fine-grained PAT that belongs to that Project alone. Public Projects clone with no credential. There is no Platform-wide GitHub token and no shared Operator PAT that can see every Project — a leaked credential is one `owner/name`, not the Operator's GitHub. One Operator PAT for all repos, a GitHub App, and per-Project deploy keys were rejected: the first is the wrong blast radius, the App is extra surface for one Operator, and deploy keys add a second protocol beside HTTPS.

## Considered Options

- **Per-Project fine-grained PAT, no Platform PAT** (accepted)
- One Operator PAT on the VPS for every clone
- GitHub App
- Deploy key per Project
- Public clone only
