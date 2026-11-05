import type { AllergenId } from "./allergens";

export type Component = { id: string; name: string; allergens: AllergenId[] };

export type Swap = {
  id: string;
  label: string; // "Plain sourdough bun instead of sesame brioche"
  priceDeltaMinor: number; // 0 or negative; positive deltas would need the diner to re-approve
  replaces: string; // component id
  with: { name: string; allergens: AllergenId[] } | null; // null = leave the component out
};

export type Dish = {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  category: string;
  priceMinor: number;
  ingredients: string[];
  components: Component[]; // allergens live on components, so a swap removes exactly what it removes
  contains: AllergenId[]; // derived: union of component allergens
  mayContain: AllergenId[];
  swaps: Swap[];
  confirmed: boolean; // only owner-confirmed rows are ever shown to diners or agents
  confidence: number; // AI extraction confidence, 0..1
  paypalProductId: string | null;
  available: boolean;
};

export type Restaurant = {
  id: string;
  slug: string;
  name: string;
  city: string;
  currency: string;
  signoffMinutes: number;
  readyMinutes?: number; // owner's usual time from the chef's nod to collection
  kitchenNotes: string; // shared fryer etc., used by the sign-off agent
};

export type Person = { name: string; allergies: AllergenId[]; notes?: string };

export type OrderStatus =
  | "awaiting_payment"
  | "awaiting_chef"
  | "captured"
  | "voided"
  | "expired"
  | "refunded"
  | "failed";

export type OrderItem = {
  id: string;
  dishId: string;
  dishName: string;
  forPerson: string;
  qty: number;
  unitPriceMinor: number;
};

export type KitchenCheck = {
  risk: "none" | "check" | "high";
  headline: string; // one line for the ticket
  questions: { itemId: string; question: string; suggestedSwapIds: string[] }[];
  extraRisks?: string[]; // cross-contact risks the AI read in the kitchen notes
  dinerSummary: string; // what the diner was shown before paying
};

export type ChefDecision = {
  outcome: "approved" | "approved_with_changes" | "declined";
  appliedSwaps: { itemId: string; swapId: string }[];
  reason: string;
  decidedAt: string;
};

export type Order = {
  id: string;
  restaurantId: string;
  channel: "web" | "agent" | "replay";
  agentName: string | null;
  dinerName: string;
  language: string;
  party: Person[];
  items: OrderItem[];
  status: OrderStatus;
  authorizedMinor: number;
  capturedMinor: number | null;
  captureStatus?: string; // PayPal's status when it is not plainly COMPLETED
  pendingCapture?: { amountMinor: number; note: string; changes: string; decision: ChefDecision; tries?: number; nextTryAt?: number }; // sent to PayPal, answer not yet known
  refundStatus?: string; // PayPal's status for the latest refund
  refundedMinor?: number;
  currency: string;
  paypalOrderId: string | null;
  authorizationId: string | null;
  captureId: string | null;
  approvalUrl: string | null;
  check: KitchenCheck | null;
  decision: ChefDecision | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderEvent = {
  id: number;
  orderId: string;
  type: string;
  message: string;
  data: unknown;
  at: string;
};
