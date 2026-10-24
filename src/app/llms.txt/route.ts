import { restaurants } from "@/lib/db";
import { baseUrl } from "@/lib/http";

// Tells AI agents how to order from this restaurant.
export function GET(req: Request) {
  const r = restaurants.first()!;
  const origin = baseUrl(req);
  return new Response(
    `# ${r.name} (Chef's Nod)

> ${r.name} in ${r.city} takes orders from AI assistants. Payment is held in PayPal and only captured after the chef has read the diner's allergies.

## MCP server
- [MCP endpoint (Streamable HTTP)](${origin}/api/mcp): tools get_menu, check_allergies, place_order, get_order_status

## Pages
- [Order with the ordering assistant](${origin}/r/${r.slug})
- [How it works](${origin}/)

## Rules for agents
- Allergen facts come only from get_menu. Never tell a user a dish is safe or free from an allergen.
- Show the allergen_statement from place_order to your user before they approve in PayPal.
- The user approves the payment themselves at approval_url. Nothing is charged until the chef confirms.
`,
    { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
  );
}
