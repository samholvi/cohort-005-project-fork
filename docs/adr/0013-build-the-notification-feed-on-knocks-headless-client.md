# Build the Notification feed on Knock's headless client

Knock is Cadence's notification provider, but Cadence does not use Knock's ready-made feed components (`NotificationIconButton`, `NotificationFeedPopover`). The bell and dropdown are Cadence's own components, built on Knock's headless feed (`KnockProvider`/`KnockFeedProvider` and the feed client). Cadence builds each Notification's text from the feed item's `data`, never from Knock's rendered `blocks` HTML, because Knock does not escape trigger data. User-written text such as a question body would otherwise be rendered as markup.

## Considered Options

- **Theme Knock's ready-made feed with its CSS variables.** Rejected because almost every default would need overriding. Its rows render `blocks` HTML, its badge counts unseen items rather than Unread ones, opening it marks everything as seen, and it brings an archive action and its own header. Cadence has no "seen" state, no archive and no feed header.

## Consequences

Do not "simplify" the feed by switching to Knock's components or rendering `blocks[].rendered`. Doing so brings back unescaped user text and a seen state that Cadence deliberately does not have. Each notification kind needs Cadence code that turns its item `data` into text and a link target.
