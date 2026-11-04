"use client";

import { useMemo, useState } from "react";
import { AgStudioAiModule, createAiHarness, enableStudioDevValidations, type AgAiHarnessSetup, type AgAiPromptStarter, type AgStudioMode } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import type { Dish, Order } from "@/lib/types";
import { buildStudioData } from "./data";
import { ownerReport } from "./report";
import { chefsNodTheme } from "./theme";
import { chefsNodAdapter } from "./adapter";

const STARTERS: AgAiPromptStarter[] = [
  { label: "Which dishes cost us sales?", prompt: "Which dishes are declined most often, and for which allergens? Add a chart." },
  { label: "Money released", prompt: "How much money was released back to diners, split by the chef's decision?" },
  { label: "Summarise this page", prompt: "Summarise what this page shows and what stands out." },
];
const ai: AgAiHarnessSetup = ({ api }) => createAiHarness(api, { adapter: chefsNodAdapter, promptStarters: STARTERS });

if (process.env.NODE_ENV !== "production") enableStudioDevValidations();

export default function Analytics({ orders, menu, aiEnabled }: { orders: (Order & { authorizedAt: string | null })[]; menu: Dish[]; aiEnabled: boolean }) {
  const [mode, setMode] = useState<AgStudioMode>("view");
  const data = useMemo(() => buildStudioData(orders, menu), [orders, menu]);
  const font = useMemo(() => `${getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim() || "system-ui"}, system-ui, sans-serif`, []);
  const theme = useMemo(() => chefsNodTheme(font), [font]);
  const initial = useMemo(() => ownerReport(font), [font]);
  const held = orders.filter((o) => o.authorizationId).length;
  if (!held) return <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-line text-sm text-muted">No held orders yet. Try Kitchen settings, then &ldquo;Fill a week of history&rdquo;.</div>;
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center justify-between bg-paper px-4 py-2 text-sm">
        <span className="text-muted">Built with AG Studio.{aiEnabled ? " Ask its AI assistant to build widgets for you, or" : ""} Switch to edit to build your own.</span>
        <button onClick={() => setMode((m) => (m === "view" ? "edit" : "view"))} className="rounded-full border border-line px-3 py-1 text-xs font-medium">
          {mode === "view" ? "Edit dashboard" : "Done editing"}
        </button>
      </div>
      <div style={{ height: 1100 }}>
        <AgStudioProvider licenseKey={process.env.NEXT_PUBLIC_AG_LICENSE_KEY} modules={aiEnabled ? [AgStudioAiModule] : undefined}>
          <AgStudio style={{ height: "100%", width: "100%" }} theme={theme} layout={{ widgetBorderEnabled: true }} data={data} initialState={initial} mode={mode} ai={aiEnabled ? ai : undefined} />
        </AgStudioProvider>
      </div>
    </div>
  );
}
