# Split refund duties between admins and Finance

Admins decide Refund Requests; people holding Finance send the money and mark each Refund Issued or Failed, retry Failed Refunds, and reconcile. Nobody decides their own Refund Request, and an Exception Refund Request (raised by an admin for a purchase without Refund Eligibility) must be decided by a different admin. This gives a light four-eyes check on real money without a hard rule that would stall a small team, and keeps the owning instructor (whose revenue a Refund reduces) out of the decision.

Finance is a permission held alongside a user's role, not a fourth value of `users.role`, because on a small team the same person is often an admin or instructor and also handles the money; a single-value role would force second accounts that break the audit trail.

## Considered Options

- **Admins do everything**: rejected; one person can approve and send with nobody else looking.
- **Owning instructor can decide**: rejected; conflict of interest.
- **Approver can never mark the Refund Issued**: deferred; revisit if refund volume justifies the extra friction.
- **Finance as a fourth role**: rejected; see above.
