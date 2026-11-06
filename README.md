# Chef's Nod

**The diner approves the money. The chef approves the food.**

AI assistants can order food for someone with an allergy. PayPal holds the money until the chef has read the allergy and said yes (capture), yes with changes (a lower partial capture), or no (void).

Built for the PayPal AI Hackathon 2026. PayPal sandbox only; no real money moves. The demo restaurant, Juniper & Ash, is fictional.

## Why

About 2.4 million UK adults have a clinically confirmed food allergy. Among adults with a food hypersensitivity, 63% of those who ordered remotely said they got any allergen information, against 73% in person. Food Standards Agency guidance for England, Wales and Northern Ireland says allergen information must be provided before purchase and again at delivery. However, AI assistants cannot guarantee safety because cross-contact and recipe swaps are decisions only a kitchen can make.

Chef's Nod provides a sign-off workflow for independent restaurants. It does not guarantee safety or provide certification. The app allows diners to see specific allergen statements for every dish. The chef makes the final decision on all substitutions and risks.

Sources: [University of Manchester on the FSA PAFA report](https://www.manchester.ac.uk/about/news/around-6-of-the-uk-adult-population-have-a-food-allergy-new-report-finds/), [FSA consumer survey](https://science.food.gov.uk/article/142308-allergen-information-for-non-prepacked-foods-consumer-experiences-behaviours-and-attitudes), [FSA allergen guidance, section 3.2](https://www.gov.uk/government/publications/allergen-guidance-for-food-businesses/allergen-guidance-for-food-businesses).

## Limits

- This app is for direct orders from independent restaurants only. Delivery platforms are out of scope.
- No restaurant has used this app yet and no pilot has been conducted.
- The following points are untested hypotheses: one tap during service may be easier than a phone call for the kitchen, and no refund is needed when no money moved.

## What it does

- Ordering: The diner builds a basket from the owner's confirmed menu and marks each person's allergies and severity. The rules engine shows the allergen statement for every dish, which the diner ticks as read before paying. An AI ordering assistant is built in, but it needs a hosted model and has not been shown working (see AI used).
- PayPal authorization: The app uses PayPal Orders v2 to hold funds without charging the diner. Approving in PayPal places the hold. Without sandbox keys this step is a labelled simulated stand-in.
- Kitchen screen: Orders appear live with a chime and a countdown. The rules engine shows which part of each dish carries the allergen and the owner-defined swaps that remove it. An AI model drafts the question for the chef; so far that has run only on a local model (qwen3.5:9b), in one test.
- Chef decision: The chef can approve the order, approve with a lower price and a note, or decline the order. If no response occurs within 10 minutes, the payment hold is voided.
- Diner updates: The diner's page updates live, and messages are translated by the AI model (tested on a local model, into Spanish). The app generates a printable sign-off record with a QR code for the delivery bag.
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

Verified PayPal webhooks can move the order too: `CHECKOUT.ORDER.APPROVED` places the hold if the diner never returns to the site, and declined, pending, reversed and refunded captures update it. Deliveries are deduplicated by event id.

## Safety by design

- The AI never decides on food safety. It only suggests questions and identifies potential allergens based on data the owner has confirmed.
- The chef makes the final decision on every order. Every order waits for the chef's Nod or Decline before any money is taken.
- The AI only builds baskets from confirmed dishes. It cannot suggest a dish whose allergen rows the owner has not confirmed.
- The AI can add an allergy but never remove one the diner declared, and an item for a name nobody declared takes every allergy in the party.
- The system uses a human-in-the-loop workflow. A human must approve the payment and the chef must confirm the final order before the money is captured.
- This is a sign-off workflow, not an allergen certification. The printed record says so.

## PayPal developer platform used

**Status: no call has reached PayPal yet.** Without sandbox keys the app runs in a labelled simulated-payments mode, and the demo video was recorded that way. Everything below is implemented against the sandbox and runs once `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` are set; `node scripts/sandbox.mjs <url>` then checks for real ids.

- Orders v2 (create with `AUTHORIZE`, authorize) and Payments v2 (capture, partial capture, void, refund) through the APIMatic-generated [PayPal Server SDK](https://www.npmjs.com/package/@paypal/paypal-server-sdk). The APIMatic Context Plugin's TypeScript guides were read while building.
- Webhooks with signature verification (`/v1/notifications/verify-webhook-signature`)
- Catalog Products API: each confirmed dish is synced as a PayPal product, and the product id is sent as the item `sku` on the order
- Transaction Search, and PayPal's hosted sandbox MCP server, for the owner's money assistant
- Published sandbox test cards for the "Friday service" replay

## AI used

- **Has run:** Claude Code, as a real agent, used the restaurant's MCP server (`/api/mcp`) to read the menu, check an allergy and place an order. A local open model (qwen3.5:9b through Ollama, `LOCAL_AI=1`) drafted a kitchen question and translated a diner message into Spanish; the rules engine still states the allergens.
- **Built in, not yet run on a hosted model:** an LLM (Claude or Gemini, set by environment variable) through the Vercel AI SDK for the ordering assistant, kitchen sign-off questions, translation, menu photo reading, the weekly menu risk report and the owner's money assistant, plus AG Studio's AI assistant through a custom adapter. On a local model the ordering assistant's suggestions were not good enough to show.

## Try it

- Live demo: _URL added at submission_
- Open the kitchen screen in a second window, then place an order and approve the hold with the PayPal sandbox buyer shown on the home page.

### Connect your own AI assistant

```bash
claude mcp add --transport http chefs-nod https://<your-deployment>/api/mcp
```

Then ask: "Order dinner from Juniper & Ash for me and Dan. Dan is allergic to sesame." Tested with Claude Code; other remote MCP clients have not been tried.

## Run it locally

Requirements: Node.js 24, pnpm.

```bash
pnpm install
cp .env.example .env.local   # add your PayPal sandbox keys and an AI key
pnpm dev                      # http://localhost:3000, simulated payments, no keys needed
pnpm check                    # allergen and swap logic self-check
```

Without PayPal keys the app runs in a clearly labelled simulated-payments mode. Set `STAFF_KEY` on any public server: the kitchen, owner and money routes need it, and they are open without it. Tests: `node scripts/smoke.mjs <url>` (simulated mode), `node scripts/sandbox.mjs <url> [staffKey]` (real sandbox ids). Register the webhook for a deployment with:

```bash
PUBLIC_URL=https://<your-deployment> pnpm tsx --env-file=.env.local scripts/register-webhook.ts
```

## Stack

Next.js 16, TypeScript, SQLite (`node:sqlite`), Vercel AI SDK, MCP TypeScript SDK, AG Grid and AG Studio, Tailwind CSS. `render.yaml` is a Render blueprint.

## Licence

MIT
