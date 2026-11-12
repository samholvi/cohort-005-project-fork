# Refund Request and Refund are separate records

A Refund Request (Open → Approved | Declined | Withdrawn) records the team's decision; approving it creates a separate Refund (Pending → Issued | Failed) that records what happened to the money. We keep them apart because they change at different times, for different reasons, and by different people (admins decide, Finance sends), and because a Failed Refund must not change the fact that the request was approved.

## Considered Options

- **One record with an extended status** (`open | approved | declined | issued | failed`): rejected; a failed transfer would overwrite "approved", losing the decision, and a retry has nowhere to live.

## Consequences

- The existing `refunds` table holds Refund Requests; its `amountRefunded` column moves to the new Refund record.
- If a payment provider is integrated later, it sets Issued or Failed on the Refund in place of Finance, without touching the Refund Request lifecycle.
