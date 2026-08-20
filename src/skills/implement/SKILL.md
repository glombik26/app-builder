---
name: implement
description: Implement the Ticket named in the slash arguments.
disable-model-invocation: true
---

Implement the work described by the Ticket file in the slash arguments (a path under `.scratch/issues/`).

Use test-driven development at the seams the Ticket names. Run typechecking and the tests for the files you touch as you go, and the full test suite once at the end.

Do not commit. The Platform commits when the Operator closes the Ticket.
