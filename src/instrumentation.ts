// Releases unanswered holds on the server, so it happens even when no kitchen screen is open.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.STAFF_KEY) console.warn("STAFF_KEY is not set: the kitchen, owner and money routes are open to anyone who can reach this server.");
  const { expireStale } = await import("./lib/orders");
  setInterval(() => expireStale().catch((e) => console.error("expiry sweep failed", e)), 15_000);
}
