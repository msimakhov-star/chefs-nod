import {
  ApiError,
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
  PaymentsController,
  PaypalExperienceLandingPage,
  PaypalExperienceUserAction,
  PaypalWalletContextShippingPreference,
  TransactionSearchController,
} from "@paypal/paypal-server-sdk";
import type { Order, Restaurant } from "./types";

// Built with the APIMatic-generated PayPal Server SDK (@paypal/paypal-server-sdk).
// Every money action in Chef's Nod goes through this file.

export const PAYPAL_BASE = "https://api-m.sandbox.paypal.com";
export const isSimulated = () => !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET;

const g = globalThis as unknown as { __pp?: { client: Client; orders: OrdersController; payments: PaymentsController; search: TransactionSearchController } };

function sdk() {
  if (!g.__pp) {
    const client = new Client({
      environment: Environment.Sandbox,
      timeout: 30000,
      clientCredentialsAuthCredentials: {
        oAuthClientId: process.env.PAYPAL_CLIENT_ID!,
        oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET!,
      },
    });
    g.__pp = {
      client,
      orders: new OrdersController(client),
      payments: new PaymentsController(client),
      search: new TransactionSearchController(client),
    };
  }
  return g.__pp;
}

export const money = (minor: number, currency: string) => ({ currencyCode: currency, value: (minor / 100).toFixed(2) });

export class PayPalFailure extends Error {
  constructor(
    message: string,
    public status: number,
    public detail: unknown,
    public debugId?: string,
  ) {
    super(message);
  }
}

async function call<T>(label: string, fn: () => Promise<{ result: T }>): Promise<T> {
  try {
    return (await fn()).result;
  } catch (err) {
    if (err instanceof ApiError) {
      const body = typeof err.body === "string" ? safeJson(err.body) : err.result;
      const b = body as { message?: string; debug_id?: string; details?: { issue?: string; description?: string }[] } | undefined;
      const issue = b?.details?.[0]?.issue;
      throw new PayPalFailure(`${label} failed: ${issue ?? b?.message ?? `HTTP ${err.statusCode}`}`, err.statusCode, body, b?.debug_id);
    }
    throw err;
  }
}

const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

// ---------- Orders: hold the money, never charge at checkout ----------

export async function createHeldOrder(order: Order, restaurant: Restaurant, baseUrl: string) {
  const currency = order.currency;
  const itemTotal = order.items.reduce((s, i) => s + i.unitPriceMinor * i.qty, 0);
  if (isSimulated()) {
    const id = `SIM-${order.id.slice(-8).toUpperCase()}`;
    return { paypalOrderId: id, approvalUrl: `${baseUrl}/api/paypal/simulated-approve?token=${id}` };
  }
  const result = await call("Create order", () =>
    sdk().orders.createOrder({
      paypalRequestId: `${order.id}-create`,
      prefer: "return=representation",
      body: {
        intent: CheckoutPaymentIntent.Authorize,
        purchaseUnits: [
          {
            referenceId: order.id,
            customId: order.id,
            invoiceId: `CN-${order.id}`,
            description: `${restaurant.name}: held until the chef signs off`,
            softDescriptor: "CHEFSNOD",
            amount: { ...money(itemTotal, currency), breakdown: { itemTotal: money(itemTotal, currency) } },
            items: order.items.map((i) => ({
              name: `${i.dishName} (for ${i.forPerson})`.slice(0, 127),
              unitAmount: money(i.unitPriceMinor, currency),
              quantity: String(i.qty),
              sku: i.dishId,
            })),
          },
        ],
        paymentSource: {
          paypal: {
            experienceContext: {
              brandName: restaurant.name,
              shippingPreference: PaypalWalletContextShippingPreference.NoShipping,
              userAction: PaypalExperienceUserAction.PayNow,
              landingPage: PaypalExperienceLandingPage.Login,
              returnUrl: `${baseUrl}/api/paypal/return?order=${order.id}`,
              cancelUrl: `${baseUrl}/o/${order.id}?cancelled=1`,
            },
          },
        },
      },
    }),
  );
  const approvalUrl = result.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!result.id || !approvalUrl) throw new PayPalFailure("Create order returned no approval link", 500, result);
  return { paypalOrderId: result.id, approvalUrl };
}

/** After the diner approves in PayPal: place the hold. Nothing is charged yet. */
export async function authorizeHeldOrder(order: Order) {
  if (isSimulated()) return { authorizationId: `SIMAUTH-${order.id.slice(-8).toUpperCase()}`, status: "CREATED", expiresAt: null as string | null };
  const result = await call("Authorize order", () =>
    sdk().orders.authorizeOrder({ id: order.paypalOrderId!, paypalRequestId: `${order.id}-authorize`, prefer: "return=representation" }),
  );
  const auth = result.purchaseUnits?.[0]?.payments?.authorizations?.[0];
  if (!auth?.id) throw new PayPalFailure("Authorize returned no authorization", 500, result);
  return { authorizationId: auth.id, status: String(auth.status), expiresAt: auth.expirationTime ?? null };
}

/** The chef said yes. Capture the (possibly lower) final amount and close the authorization. */
export async function captureHold(order: Order, amountMinor: number, noteToPayer: string) {
  if (isSimulated()) return { captureId: `SIMCAP-${order.id.slice(-8).toUpperCase()}`, status: "COMPLETED" };
  const result = await call("Capture", () =>
    sdk().payments.captureAuthorizedPayment({
      authorizationId: order.authorizationId!,
      paypalRequestId: `${order.id}-capture`,
      prefer: "return=representation",
      body: {
        amount: money(amountMinor, order.currency),
        finalCapture: true,
        invoiceId: `CN-${order.id}`,
        noteToPayer: noteToPayer.slice(0, 255),
      },
    }),
  );
  if (!result.id) throw new PayPalFailure("Capture returned no id", 500, result);
  return { captureId: result.id, status: String(result.status) };
}

/** The chef said no, or nobody answered in time. Release the hold. */
export async function voidHold(order: Order) {
  if (isSimulated()) return { status: "VOIDED" };
  const result = await call("Void", () =>
    sdk().payments.voidPayment({ authorizationId: order.authorizationId!, paypalRequestId: `${order.id}-void`, prefer: "return=representation" }),
  );
  return { status: String(result?.status ?? "VOIDED") };
}

export async function refundCapture(order: Order, amountMinor: number, noteToPayer: string) {
  if (isSimulated()) return { refundId: `SIMREF-${order.id.slice(-8).toUpperCase()}`, status: "COMPLETED" };
  const result = await call("Refund", () =>
    sdk().payments.refundCapturedPayment({
      captureId: order.captureId!,
      paypalRequestId: `${order.id}-refund-${amountMinor}`,
      prefer: "return=representation",
      body: { amount: money(amountMinor, order.currency), noteToPayer: noteToPayer.slice(0, 255), invoiceId: `CN-${order.id}` },
    }),
  );
  return { refundId: result.id!, status: String(result.status) };
}

export async function getPaypalOrder(paypalOrderId: string) {
  return call("Get order", () => sdk().orders.getOrder({ id: paypalOrderId }));
}

export async function searchTransactions(startIso: string, endIso: string) {
  if (isSimulated()) return { transactionDetails: [] as unknown[] };
  return call("Transaction search", () =>
    sdk().search.searchTransactions({ startDate: startIso, endDate: endIso, fields: "transaction_info,payer_info,cart_info", pageSize: 100 }),
  );
}

// ---------- Plain REST for endpoints the SDK does not cover (Catalog, Webhooks) ----------

let token: { value: string; exp: number } | null = null;

export async function accessToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PayPalFailure("OAuth token failed", res.status, await res.text());
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

export async function rest<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${PAYPAL_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) throw new PayPalFailure(`${method} ${path} failed`, res.status, json, res.headers.get("paypal-debug-id") ?? undefined);
  return json as T;
}

/** Catalog Products API: each confirmed dish becomes a PayPal product. */
export async function upsertCatalogProduct(dish: { id: string; name: string; description: string }, baseUrl: string) {
  if (isSimulated()) return `SIMPROD-${dish.id}`;
  const id = `CN-${dish.id}`.slice(0, 50);
  try {
    await rest("GET", `/v1/catalogs/products/${id}`);
    await rest("PATCH", `/v1/catalogs/products/${id}`, [{ op: "replace", path: "/description", value: dish.description.slice(0, 256) || dish.name }]);
  } catch (e) {
    if (!(e instanceof PayPalFailure) || e.status !== 404) throw e;
    await rest("POST", "/v1/catalogs/products", {
      id,
      name: dish.name.slice(0, 127),
      description: (dish.description || dish.name).slice(0, 256),
      type: "PHYSICAL",
      category: "FOOD_RETAIL_AND_SERVICE",
      home_url: baseUrl.startsWith("https://") ? baseUrl : undefined,
    }, { "PayPal-Request-Id": `${id}-create` });
  }
  return id;
}

export async function verifyWebhook(headers: Headers, rawBody: string) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const res = await rest<{ verification_status: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: webhookId,
    webhook_event: JSON.parse(rawBody),
  });
  return res.verification_status === "SUCCESS";
}
