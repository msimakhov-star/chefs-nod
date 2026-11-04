// Releases unanswered holds on the server, so it happens even when no kitchen screen is open.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { expireStale } = await import("./lib/orders");
  setInterval(() => expireStale().catch((e) => console.error("expiry sweep failed", e)), 15_000);
}
