# A Preview lives until Freigabe, abort, reboot, or Operator stop; later ups are explicit

A running Preview does not idle out and is not evicted at the admission gate. It dies only on Freigabe DEV→TEST, abort, host reboot, or an Operator stop on the Feature chrome — Compose down, no confirm, Turn untouched. Stop leaves worktree, record, branch, and named volumes; Freigabe and abort remove the stack including those volumes. Auto-start fires once, when the worktree first fulfills the Compose contract; every later up (stop, reboot, refused admission, dead stack) is the Feature-chrome button and still passes the count-plus-RAM door. TEST and PROD are not this button.

An idle timeout was rejected: idle is ambiguous, and a Preview URL dying on its own is surprising. Abort as the only way to free a slot was rejected: abort deletes the Feature. Auto-start on the next Turn, on opening the Feature, or whenever the contract holds was rejected: stop would not stick, and reboot already does not revive Previews. Wiping volumes on stop was rejected: stop frees a slot, it is not a partial abort. A start button only after stop/reboot was rejected: refused admission and a dead stack would have no way back. List-row actions and a confirm dialog were rejected for the first cut — reversible, and lists stay status-only.

## Considered Options

- **No idle timeout; Operator stop; one-shot auto-start; later ups by button; volumes persist until Feature end** (accepted)
- Idle timeout
- Abort as the only way to free a slot
- Auto-restart on next Turn, Feature page, or whenever the contract holds
- Wipe named volumes on stop
- Start button only after stop or reboot
- Stop/start on the Project list or Home
- Confirm dialog before stop
