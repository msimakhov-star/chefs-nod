// Usage: PUBLIC_URL=https://your-app.onrender.com pnpm tsx --env-file=.env.local scripts/register-webhook.ts
// Registers (or finds) the PayPal sandbox webhook for this deployment and prints PAYPAL_WEBHOOK_ID.
import { rest } from "../src/lib/paypal";

const url = `${process.env.PUBLIC_URL}/api/paypal/webhook`;
const events = ["CHECKOUT.ORDER.APPROVED", "PAYMENT.AUTHORIZATION.CREATED", "PAYMENT.AUTHORIZATION.VOIDED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.DECLINED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.REVERSED"];

const list = await rest<{ webhooks: { id: string; url: string }[] }>("GET", "/v1/notifications/webhooks");
const existing = list.webhooks.find((w) => w.url === url);
if (existing) console.log(`PAYPAL_WEBHOOK_ID=${existing.id}  (already registered for ${url})`);
else {
  const created = await rest<{ id: string }>("POST", "/v1/notifications/webhooks", { url, event_types: events.map((name) => ({ name })) });
  console.log(`PAYPAL_WEBHOOK_ID=${created.id}  (registered ${url})`);
}
