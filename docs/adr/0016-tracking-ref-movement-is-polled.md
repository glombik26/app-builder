# TEST and PROD notice Tracking Ref movement by poll; a failed apply keeps the last good stand

The Platform fetches every Project's bare clone on a 60-second loop and compares each Environment's Tracking Ref SHA. Freigabe and an Operator „jetzt ziehen“ run the same apply immediately, without waiting for the next tick. A GitHub webhook was rejected: the control-plane URL is still open, and a webhook is inbound surface plus per-Project registration for one Operator. Watching nothing and waiting for a human pull was rejected: it would make the branch motor depend on a glance.

Movement is any SHA change after fetch, including force-push and rewind; a missing ref is a visible break, not a stand to keep. Tags stay labels. Apply is one-at-a-time per Environment and coalesces to the latest SHA. A failed apply leaves the last good stand up; the Project page shows Bruch plus one error line, not logs. Poll does not re-apply the same SHA after a failure — that is „jetzt ziehen“ or a new SHA. One short retry is allowed only for a transient fetch.

## Considered Options

- **Poll every 60s + immediate apply on Freigabe and „jetzt ziehen“; last good stand on failure** (accepted)
- GitHub push webhook
- Only Freigabe plus a manual pull; no watch
- Only fast-forward counts as movement
- Take the stack down when the new SHA fails to come up
- Retry compose-up until it succeeds
