# Keep a learner's progress after a Refund

When a Refund Request is approved, the learner's Enrollment is ended rather than deleted, and their lesson progress, video watch events and quiz attempts for the course are kept, dormant, rather than deleted. Refund Eligibility is judged from that history (the 2-hour watch limit reads video watch events), so deleting it would let a learner buy, watch, get a Refund and buy again with a clean record; keeping it also means a learner who buys again picks up where they left off, and enrollment analytics stay true to what happened.

## Considered Options

- **Delete progress at approval**: rejected; irreversible, and it resets the history that Refund Eligibility depends on.
- **Keep progress for a fixed period, then delete**: rejected; the abuse loop simply waits out the period, and it adds a purge job for no clear gain.

## Consequences

- Access checks must count only active Enrollments, not any Enrollment.
- A GDPR erasure request is a separate process and overrides this decision.
