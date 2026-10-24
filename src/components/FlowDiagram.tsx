// How an order moves: who holds the money at each step, and which PayPal call moves it.
export default function FlowDiagram() {
  const box = "fill-paper stroke-line";
  return (
    <svg viewBox="0 0 1000 300" className="h-auto w-full" role="img" aria-label="Order flow: diner or AI agent, PayPal hold, chef decision, capture or void">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#6b6359" />
        </marker>
      </defs>
      {/* nodes */}
      <g fontFamily="var(--font-inter)" fontSize="13" fill="#1c1917">
        <rect x="10" y="40" width="170" height="90" rx="14" className={box} strokeWidth="1.5" />
        <text x="95" y="72" textAnchor="middle" fontWeight="600">Diner or AI agent</text>
        <text x="95" y="94" textAnchor="middle" fill="#6b6359">chat, voice, or MCP</text>
        <text x="95" y="113" textAnchor="middle" fill="#6b6359">place_order</text>

        <rect x="230" y="40" width="190" height="90" rx="14" className={box} strokeWidth="1.5" />
        <text x="325" y="72" textAnchor="middle" fontWeight="600">Chef&apos;s Nod</text>
        <text x="325" y="94" textAnchor="middle" fill="#6b6359">owner-confirmed allergens</text>
        <text x="325" y="113" textAnchor="middle" fill="#6b6359">statement before payment</text>

        <rect x="470" y="40" width="190" height="90" rx="14" fill="#e8f1fc" stroke="#0070e0" strokeWidth="1.5" />
        <text x="565" y="72" textAnchor="middle" fontWeight="600" fill="#003087">PayPal holds</text>
        <text x="565" y="94" textAnchor="middle" fill="#003087">Orders v2 intent AUTHORIZE</text>
        <text x="565" y="113" textAnchor="middle" fill="#003087">diner approves once</text>

        <rect x="710" y="40" width="280" height="90" rx="14" fill="#fdf1dc" stroke="#d98a1c" strokeWidth="1.5" />
        <text x="850" y="72" textAnchor="middle" fontWeight="600">Kitchen screen</text>
        <text x="850" y="94" textAnchor="middle" fill="#6b6359">AI writes the question,</text>
        <text x="850" y="113" textAnchor="middle" fill="#6b6359">the chef answers it</text>

        <rect x="470" y="200" width="160" height="80" rx="14" fill="#e4f0e8" stroke="#1f5a3d" strokeWidth="1.5" />
        <text x="550" y="230" textAnchor="middle" fontWeight="600" fill="#1f5a3d">Nod</text>
        <text x="550" y="252" textAnchor="middle" fill="#1f5a3d">capture full amount</text>

        <rect x="650" y="200" width="170" height="80" rx="14" fill="#e4f0e8" stroke="#1f5a3d" strokeWidth="1.5" />
        <text x="735" y="230" textAnchor="middle" fontWeight="600" fill="#1f5a3d">Nod with changes</text>
        <text x="735" y="252" textAnchor="middle" fill="#1f5a3d">partial capture + note</text>

        <rect x="840" y="200" width="150" height="80" rx="14" fill="#fde8e6" stroke="#b42318" strokeWidth="1.5" />
        <text x="915" y="230" textAnchor="middle" fontWeight="600" fill="#b42318">Decline / timeout</text>
        <text x="915" y="252" textAnchor="middle" fill="#b42318">void the hold</text>

        <rect x="10" y="200" width="420" height="80" rx="14" className={box} strokeWidth="1.5" />
        <text x="220" y="230" textAnchor="middle" fontWeight="600">Diner gets a live status page and a signed record</text>
        <text x="220" y="252" textAnchor="middle" fill="#6b6359">webhooks confirm every step · capture ID on the bag ticket</text>
      </g>
      {/* edges */}
      <g stroke="#6b6359" strokeWidth="1.5" fill="none" markerEnd="url(#arr)">
        <path d="M180 85H226" />
        <path d="M420 85H466" />
        <path d="M660 85H706" />
        <path d="M850 130V160H550V196" />
        <path d="M850 160H735V196" />
        <path d="M850 160H915V196" />
        <path d="M470 240H434" />
      </g>
    </svg>
  );
}
