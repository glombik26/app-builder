# implement keeps a fixed secret-path list off the Feature branch via the Project `.gitignore`

Closing a Ticket in implement already stages every non-ignored change. Besides `.scratch/`, the Platform keeps a closed list of secret paths off the Feature branch by appending any missing lines to the Project's `.gitignore` on the first Ticket close — the same seam as [ADR 0010](0010-implement-commits-locally-per-ticket.md): `.env`, `.env.*` except `.env.example` / `.env.sample` / `.env.template`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `id_ecdsa`. The files may stay on disk (Compose reads `.env`). Already-tracked files are left alone; there is no content scan, no silent unstage, and no refuse-close merely because such a file exists. `compose.override.yaml` and forgotten build or OS junk stay the Project's ignore policy.

Trusting only the Project's existing ignore, `.git/info/exclude`, unstaging after `git add -A`, refusing close when a listed path is on disk, `git rm --cached` of already-tracked secrets, a hygiene gitignore template, and scanning file contents for tokens were rejected.

## Considered Options

- **Fixed path list in the Project `.gitignore`; already-tracked left alone** (accepted)
- Only what the Project already ignores (plus `.scratch/`)
- `.git/info/exclude` for the extra paths
- Unstage matching paths after `git add -A`
- Refuse Ticket close when a listed path would appear in the commit
- `git rm --cached` already-tracked secrets
- Also keep `compose.override.yaml` off the branch
- Also keep `node_modules` / `dist` / `.DS_Store` / `.idea` off the branch
- Content scan (AWS keys in source)
