# Knock is the only store of Notifications

Cadence keeps no record of the Notifications it sends: no notifications table, no mirror and no outbox. Knock holds every Notification and its Read/Unread state. Cadence triggers a Notification after the domain change is written, without making the request wait, retrying 2–3 times and then logging and giving up. A Notification only repeats something Cadence already records (the refund, the comment, the Purchase), so losing one during a Knock outage costs little. Keeping our own copy would mean two sources of Unread state, plus a background job Cadence doesn't have.

## Considered Options

- **Outbox.** Write a pending row in the same transaction and send it later. Rejected because it needs a background job and a table only for delivery, and that reliability isn't worth it for in-app-only Notifications.
- **Full mirror.** Cadence's own `notifications` table as the source of truth, with Knock only delivering. Rejected because Read/Unread would live in two places, and it would undo most of the reason for using Knock's headless feed (ADR 0013).

## Consequences

- Facts the domain needs live on the domain object, not in a notification log. For example, a lesson records "Students notified on <date>".
- The one exception to "don't wait": the Instructor's **Notify enrolled Students** action waits for Knock, and marks the lesson notified only once Knock accepts. Otherwise a failed trigger would use up a once-per-lesson button with nobody notified.
- Switching provider starts everyone with empty feeds and default preferences. To keep that switch cheap, only Cadence's trigger transport (server) and one feed module (client) talk to Knock. Domain code never imports Knock.
- Recipient ids are user ids with `KNOCK_RECIPIENT_PREFIX` in front, which is set per developer checkout and unset in production. Autoincrement ids are reused after a reseed, so without the prefix, developers sharing a Knock environment would see each other's Notifications.
