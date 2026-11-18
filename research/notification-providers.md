# Which notification providers meet Cadence's constraints?

Research for [#12](https://github.com/samholvi/cohort-005-project-fork/issues/12) (map: [#11](https://github.com/samholvi/cohort-005-project-fork/issues/11)). Sources were read on 2026-11-18. Every claim below cites the official vendor page it comes from. Pricing pages change, so check them again before signing up.

This document states facts only. It makes no recommendation.

## Constraints checked

1. Hosted SaaS only, with no self-hosting.
2. A free tier usable without a credit card.
3. A Node server SDK.
4. A prebuilt React in-app feed (bell, unread count, inbox) that can be restyled.
5. Recipients identified by Cadence's own user id, which must work with fake DevUI users. Records whether secure-feed signing is required and how it is done.
6. Email and push can be added later.

Also recorded:

- Support for delayed or scheduled workflow steps, needed for inactivity prompts.
- Free-tier limits.

## Knock

- **Hosted:** Yes. Knock is SaaS only.
- **Free tier:** The Developer plan costs $0 a month and needs no credit card. It includes 10,000 messages a month, where one message is one delivery to one user on one channel. It also includes unlimited stored profiles, unlimited feeds per recipient, unlimited feed retention and 30-day log retention. Knock does not hard-cap usage. If you go over the limits, Knock contacts you about adding billing. Knock branding cannot be removed on this plan. Source: https://knock.app/pricing
- **Node SDK:** Yes, `@knocklabs/node`. Its `signUserToken` helper is imported from `@knocklabs/node/lib/tokenSigner`. Source: https://docs.knock.app/in-app-ui/security-and-authentication
- **React feed:** Yes, `@knocklabs/react`. It provides three components:
  - `NotificationIconButton`, a bell button with a badge count. Set `badgeCountType="unread"` to count unread items.
  - `NotificationFeedPopover`.
  - `NotificationFeed`.

  Restyling options:
  - Override the `--rnf-*` CSS variables, or replace Knock's CSS entirely. All feed classes start with `rnf-`.
  - Use `renderItem` to supply custom notification cells.
  - Set `colorMode="dark"` for dark mode.

  Source: https://docs.knock.app/in-app-ui/react/feed
- **Recipient id and signing:**
  - Recipients are your own user ids. A trigger accepts either a user id string you identified earlier, or a full recipient object that Knock "identifies inline" during the run. Source: https://docs.knock.app/send-notifications/triggering-workflows/api
  - The client passes `user={{ id }}` with a public API key.
  - Enhanced security mode is **off by default**. Without it, "a request with your public key can act as any user", so fake DevUI ids work as they are.
  - When enhanced security mode is on, Knock rejects client requests that lack a signed user token. The token is an **RS256 JWT** with `sub` set to the user id, signed with a private signing key from the Knock dashboard, and passed to the feed provider as `userToken`. Knock recommends turning this mode on in production.

  Source: https://docs.knock.app/in-app-ui/security-and-authentication
- **Email and push later:** Yes. Delivery channels are unlimited on the free plan, and the pricing page gives email providers as an example. Source: https://knock.app/pricing
- **Delay or schedule:**
  - The delay step supports a fixed interval of up to 365 days.
  - The delay can also come from trigger data, as an ISO-8601 timestamp, a duration or a window rule.
  - A pending run can be cancelled through the cancel API, using a `cancellation_key` passed at trigger time.
  - The docs mention no plan restriction on delays.

  Sources: https://docs.knock.app/designing-workflows/delay-function and https://docs.knock.app/send-notifications/triggering-workflows/api

## Novu (cloud)

- **Hosted:** Novu Cloud is hosted, with US and EU data residency. Source: https://novu.co/pricing
- **Free tier:** The Free plan costs $0 a month and needs no credit card. Its limits:
  - 10,000 workflow runs a month.
  - **Up to 5 workflows.**
  - Unlimited subscribers.
  - 60 events per second.
  - 2 environments.
  - 3 team members.
  - **24-hour activity-feed retention.**

  Channels on the plan are email, in-app, SMS, chat and push. Source: https://novu.co/pricing
- **Node SDK:** Yes, `@novu/api`. You trigger a workflow with `novu.trigger({ workflowId, to: { subscriberId }, payload })`. Source: https://docs.novu.co/platform/sdks/server/typescript
- **React feed:** Yes, `@novu/react` `<Inbox />`. It includes:
  - A bell with a real-time unread count.
  - A popover with the notification list.
  - Preferences, tabs and filters, and snoozing.

  You can override styles and replace any UI element or icon. Headless hooks are available if you want to build the UI yourself. Source: https://docs.novu.co/platform/inbox/overview
- **Recipient id and signing:**
  - Novu recommends using your app's internal user id as the `subscriberId`.
  - Subscribers are created just-in-time when a workflow is triggered to an unknown id. Source: https://docs.novu.co/platform/concepts/subscribers
  - The Inbox needs only `applicationIdentifier` and `subscriberId`, so it works with fake DevUI ids.
  - HMAC is an **optional** toggle in the In-App provider settings. When it is on, the Inbox does not load without `subscriberHash`. The hash is a lowercase hex HMAC-SHA256 of the `subscriberId`, keyed with `NOVU_SECRET_KEY` and computed on the server.
  - Without the hash, anyone who guesses a subscriber's id can read that subscriber's feed.

  Source: https://docs.novu.co/platform/inbox/prepare-for-production
- **Email and push later:** Yes. Both are listed among the Free plan's channels. Source: https://novu.co/pricing
- **Delay or schedule:**
  - The delay step can be fixed, scheduled (until a time in the subscriber's time zone), or dynamic (from the payload).
  - **The maximum delay is 1 day on Free**, 7 days on Pro and 30 days on Team.
  - A pending run can be cancelled with `DELETE /v1/events/trigger/{transactionId}`.

  Sources: https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/delay and https://docs.novu.co/api-reference/events/cancel-triggered-event

## MagicBell

- **Hosted:** Yes, SaaS.
- **Free tier:** The free plan, called "Builder" on the pricing page, costs $0 a month. It includes:
  - **1,000 deliveries a month.**
  - 1 project.
  - Unlimited users.
  - All integrations.

  Deliveries above the included amount are billed per use, and the pricing page gives no rate for Builder. Source: https://www.magicbell.com/pricing

  The homepage says "No credit card required." Source: https://www.magicbell.com/
- **Node SDK:** Yes. `magicbell-js` provides `Client` from `magicbell-js/project-client` for server use. Source: https://www.magicbell.com/docs/libraries/magicbell-js
- **React feed:** Yes, `@magicbell/react`. Its components are `ContextProvider`, `FloatingInbox` (whose default trigger is a bell, `InboxButton`), `Inbox`, `InlineNotification`, toasts and preferences.

  Styling uses CSS files you import, `--magicbell-*` variables and predefined class names. An `unstyled` option is also available.

  The React docs page I read does not document a dedicated unread-count badge component. Source: https://www.magicbell.com/docs/libraries/magicbell-react
- **Recipient id and signing:**
  - **A signed user JWT is required.** `ContextProvider` takes `token`, described as "The MagicBell User JWT". Source: https://www.magicbell.com/docs/libraries/magicbell-react
  - The JWT is **HS256**, signed with the project Secret Key. Its claims are `user_external_id` (your user id) and/or `user_email`, plus `api_key`. It is generated on your backend. Source: https://www.magicbell.com/docs/api/authentication/user
  - Fake DevUI ids work, provided Cadence's server mints a token for whichever DevUI user is selected.
- **Email and push later:** Yes. All channels are included on the free plan, including APNs, FCM and Expo push. Sources: https://www.magicbell.com/pricing and https://www.magicbell.com/
- **Delay or schedule:**
  - Workflows have a `wait` command that pauses for a given number of seconds. They also have `pause` (resumed through the API) and `abort`.
  - MagicBell's examples use waits of 1 to 3 days.
  - The page does not say which plans include Workflows.

  Source: https://www.magicbell.com/workflows

## Courier

- **Hosted:** Yes, SaaS, with a separate EU datacenter endpoint.
- **Free tier:** The Developer plan is free for up to 10,000 sends a month.
  - Sends from test environments count the same as production sends.
  - A template that delivers across several channels counts as one send.
  - Journeys are included. Digest and batching are listed only under Enterprise.
  - Above 10,000 sends you move to Business, at $0.005 per send.

  Source: https://www.courier.com/pricing

  **Credit card: not confirmed from a primary page.** The pricing page says only "Add a credit card to move to Courier's Business plan." Sources: https://www.courier.com/pricing and https://www.courier.com/docs/overview
- **Node SDK:** Yes, `@trycourier/courier`. Source: https://www.courier.com/docs/overview
- **React feed:** Yes, `@trycourier/courier-react` for React 18 and later. It provides:
  - `<CourierInbox />`.
  - `<CourierInboxPopupMenu />`.
  - `<CourierToast />`.
  - `<CourierPreferences />`.

  The unread count is available as `inbox.totalUnreadCount`. Theming uses the `CourierInboxTheme` objects. Source: https://www.courier.com/docs/sdk-libraries/courier-react-web

  The Inbox overview lists "Unread counts and badges". Source: https://www.courier.com/docs/platform/inbox/inbox-overview
- **Recipient id and signing:**
  - **A JWT is required.** Without `signIn`, the components render empty.
  - Your backend calls `POST /auth/issue-token` with your API key and a scope that starts with `user_id:<id>`, and adds `inbox:read:messages inbox:write:events`.
  - The client then calls `signIn({ userId, jwt })`.
  - If you omit `expires_in`, the token never expires.

  Source: https://www.courier.com/docs/platform/inbox/authentication

  Fake DevUI ids work, provided Cadence's server mints a token per selected user. I did not confirm whether a user must exist before a send.
- **Email and push later:** Yes. The pricing page describes one template delivering across email, SMS, push, Slack and in-app. Source: https://www.courier.com/pricing
- **Delay or schedule:**
  - The Send API supports `delay.duration` in milliseconds, `delay.until` with an ISO timestamp, or an opening-hours window. **A delay can run up to 31 days.** Source: https://www.courier.com/docs/platform/sending/delay
  - Journeys have a delay node. Runs can be cancelled by `runId`. Source: https://www.courier.com/docs/journeys/build
  - A search summary of the Journeys step docs gives a 93-day maximum for a single delay node. I did not read that limit on the page itself.

## Extra candidate: SuprSend (partly checked)

- **Free tier:** $0 a month for 10,000 notifications a month, with "No Credit Card required". The in-app feed carries SuprSend branding. Source: https://www.suprsend.com/pricing
- **React:** `@suprsend/react`, offered as drop-in or headless. I did not check the component names or styling. Source: https://docs.suprsend.com/docs/inbox-react
- **Signing:** Enhanced security mode uses an ES256 JWT with `entity_id` set to the user id. The docs say it is needed in production and imply that a public-key-only setup works when the mode is off. Source: https://docs.suprsend.com/docs/client-authentication
- **Delay:** The delay node supports fixed, dynamic and relative delays, and the docs mention re-engagement. They state no maximum duration. Source: https://docs.suprsend.com/docs/delay
- **Not verified:** the Node SDK, and push and email support on the free tier.

## Comparison

| | Knock | Novu Cloud | MagicBell | Courier | SuprSend (partial) |
|---|---|---|---|---|---|
| Hosted SaaS | Yes | Yes | Yes | Yes | Yes |
| Free tier, no card | Yes | Yes | Yes (homepage) | Not confirmed | Yes |
| Free volume | 10k messages/mo, soft cap | 10k runs/mo, 5 workflows, 24h activity retention | 1k deliveries/mo | 10k sends/mo, test sends count | 10k notifications/mo |
| Node SDK | `@knocklabs/node` | `@novu/api` | `magicbell-js` | `@trycourier/courier` | not verified |
| React bell + unread + inbox | Yes (`NotificationIconButton` + popover) | Yes (`<Inbox />`) | Bell trigger + inbox; no documented unread badge component | Inbox + popup menu; `totalUnreadCount` | Drop-in exists; details not verified |
| Restyling | CSS vars, replaceable CSS, `renderItem` | Style overrides, replaceable elements, headless | CSS vars, classes, `unstyled` | Theme objects, hooks | not verified |
| Own user id as recipient | Yes (inline identify) | Yes (just-in-time subscriber) | Yes (`user_external_id`) | Yes (`user_id`) | Yes (`entity_id`) |
| Signing required? | Optional (RS256 JWT) | Optional (HMAC-SHA256) | **Required** (HS256 JWT) | **Required** (JWT from `/auth/issue-token`) | Optional (ES256 JWT) |
| Email / push later | Yes | Yes | Yes | Yes | Email/push not verified |
| Delay step | Yes, up to 365 days, cancellable | Yes, **max 1 day on Free**, cancellable | `wait` (seconds); plan not stated | Send delay up to 31 days; Journeys delay node | Yes; max not stated |

## Open points

- Courier: whether the Developer signup needs a credit card.
- Courier: the Journeys delay maximum.
- MagicBell: whether Workflows are on the Builder plan, and the overage rate.
- Novu: whether Free-plan Inbox carries Novu branding. The pricing table was ambiguous when extracted.
