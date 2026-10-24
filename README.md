# Chef's Nod

**The diner approves the money. The chef approves the food.**

AI assistants can order food for someone with an allergy. PayPal holds the money until the chef has read the allergy and said yes (capture), yes with changes (a lower partial capture), or no (void).

Built for the PayPal AI Hackathon 2026. Runs on the PayPal sandbox; no real money moves. The demo restaurant, Juniper & Ash, is fictional.

## Why

AI assistants cannot guarantee that a dish is free of allergens. Decisions about cross-contact, shared fryers, and recipe swaps belong only to the kitchen. Currently, agent-placed orders either go through without verification or restaurants refuse them entirely. This is a problem for people ordering for others, such as parents or carers.

UK Food Standards Agency guidance requires allergen information to be available before purchase and at delivery for remote sales. Chef's Nod provides a sign-off workflow for this requirement. The chef makes the final safety decision. The system ensures the AI only suggests options the owner has confirmed.

## What it does

- Ordering assistant: The diner speaks or types in any language to specify who is eating and their dietary needs. The AI builds a basket from confirmed dishes and shows the allergen statement for every dish, which the diner ticks as read before paying.
- PayPal authorization: The app uses PayPal Orders v2 to hold funds without charging the diner. The diner must approve the payment in PayPal to create the order.
- Kitchen screen: Orders appear live with a chime and a countdown. The AI generates specific questions for the chef and suggests ingredient swaps based on the owner's defined rules.
- Chef decision: The chef can approve the order, approve with a lower price and a note, or decline the order. If no response occurs within 10 minutes, the payment hold is voided.
- Diner updates: The diner's page updates live with translations. The app generates a printable sign-off record with a QR code for the delivery bag.
- AI agents and owner dashboard: The app provides an MCP server for AI agents to place orders and a dashboard for owners to manage orders, analytics, and menu imports.

## How the money moves

| Step | PayPal call | What the diner sees |
|---|---|---|
| Diner (or their AI agent) places the order | `POST /v2/checkout/orders` with `intent: AUTHORIZE` | Allergen statement, then the PayPal approval page |
| Diner approves in PayPal | `POST /v2/checkout/orders/{id}/authorize` | "PayPal is holding the money. The chef is reading your allergies." |
| Chef nods | `POST /v2/payments/authorizations/{id}/capture` (full amount, `final_capture: true`) | Confirmed, charged |
| Chef nods with changes | same call with a lower `amount`, `final_capture: true` and a `note_to_payer` explaining the change | Confirmed with changes, charged less |
| Chef declines, or 10 minutes pass | `POST /v2/payments/authorizations/{id}/void` | Hold released, not charged |
| Owner refunds later | `POST /v2/payments/captures/{id}/refund` | Refund with a note |

Every step is confirmed by verified PayPal webhooks (`PAYMENT.AUTHORIZATION.CREATED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.AUTHORIZATION.VOIDED`, `PAYMENT.CAPTURE.REFUNDED`).

## Safety by design

- The AI never decides on food safety. It only suggests questions and identifies potential allergens based on data the owner has confirmed.
- The chef makes the final decision on every order. Every order waits for the chef's Nod or Decline before any money is taken.
- The AI only builds baskets from confirmed dishes. It cannot suggest a dish whose allergen rows the owner has not confirmed.
- The system uses a human-in-the-loop workflow. A human must approve the payment and the chef must confirm the final order before the money is captured.
- This is a sign-off workflow, not an allergen certification. The printed record says so.

## PayPal developer platform used

- Orders v2 (create with `AUTHORIZE`, authorize) and Payments v2 (capture, partial capture, void, refund) through the APIMatic-generated [PayPal Server SDK](https://www.npmjs.com/package/@paypal/paypal-server-sdk), built with the APIMatic Context Plugin for PayPal
- Webhooks with signature verification (`/v1/notifications/verify-webhook-signature`)
- Catalog Products API: each confirmed dish is synced as a PayPal product
- Transaction Search, and PayPal's hosted sandbox MCP server, for the owner's money assistant
- Published sandbox test cards for the "Friday service" replay

## AI used

- An LLM (Claude or Gemini, set by environment variable) through the Vercel AI SDK: ordering assistant, kitchen sign-off questions, translation, menu photo reading, weekly menu risk report, owner money assistant
- Model Context Protocol: the restaurant exposes an MCP server (`/api/mcp`) and the owner assistant consumes PayPal's MCP server
- AG Studio's AI assistant, connected to the same provider through a custom adapter

## Try it

- Live demo: _URL added at submission_
- Open the kitchen screen in a second window, then place an order and approve the hold with the PayPal sandbox buyer shown on the home page.

### Connect your own AI assistant

```bash
claude mcp add --transport http chefs-nod https://<your-deployment>/api/mcp
```

Then ask: "Order dinner from Juniper & Ash for me and Dan. Dan is allergic to sesame."

## Run it locally

Requirements: Node.js 24, pnpm.

```bash
pnpm install
cp .env.example .env.local   # add your PayPal sandbox keys and an AI key
pnpm dev                      # http://localhost:3000
pnpm check                    # allergen and swap logic self-check
```

Without PayPal keys the app runs in a clearly labelled simulated-payments mode. Register the webhook for a deployment with:

```bash
PUBLIC_URL=https://<your-deployment> pnpm tsx --env-file=.env.local scripts/register-webhook.ts
```

## Stack

Next.js 16, TypeScript, SQLite (`node:sqlite`), Vercel AI SDK, MCP TypeScript SDK, AG Grid and AG Studio, Tailwind CSS, Render.

## Licence

MIT
