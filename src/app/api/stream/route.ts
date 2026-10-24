import { bus } from "@/lib/bus";

export const dynamic = "force-dynamic";

// Server-Sent Events: the kitchen screen subscribes to a restaurant, the diner page to one order.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const channel = url.searchParams.get("order") ? `o:${url.searchParams.get("order")}` : `r:${url.searchParams.get("restaurant")}`;
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      const onEvent = (e: unknown) => send(e);
      const ping = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 20000);
      bus.on(channel, onEvent);
      send({ type: "hello" });
      cleanup = () => {
        clearInterval(ping);
        bus.off(channel, onEvent);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
