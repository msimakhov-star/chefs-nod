"use client";

import { useMemo, useRef, useState } from "react";
import { AgStudioAiModule, createAiHarness, enableStudioDevValidations, type AgAiHarnessSetup, type AgAiPromptStarter, type AgStudioApi, type AgStudioMode } from "ag-studio";
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
  const [page, setPage] = useState("money");
  const apiRef = useRef<AgStudioApi | null>(null);
  const openPage = (id: string) => {
    setPage(id);
    const api = apiRef.current;
    if (api) api.setState({ ...api.getState(), selectedPageId: id });
  };
  const data = useMemo(() => buildStudioData(orders, menu), [orders, menu]);
  const font = useMemo(() => `${getComputedStyle(document.documentElement).getPropertyValue("--font-inter").trim() || "system-ui"}, system-ui, sans-serif`, []);
  const theme = useMemo(() => chefsNodTheme(font), [font]);
  const initial = useMemo(() => ownerReport(font), [font]);
  const held = orders.filter((o) => o.authorizationId).length;
  if (!held) return <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-line text-sm text-muted">No held orders yet. Try Kitchen settings, then &ldquo;Fill a week of history&rdquo;.</div>;
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center justify-between bg-paper px-4 py-2 text-sm">
        <div className="flex gap-1">
          {[
            ["money", "Money"],
            ["allergies", "Allergies & sign-offs"],
          ].map(([id, label]) => (
            <button key={id} onClick={() => openPage(id)} className={`rounded-full px-3 py-1 text-xs font-medium ${page === id ? "bg-basil text-white" : "text-muted hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="hidden text-xs text-muted md:inline">Built with AG Studio.{aiEnabled ? " Ask its AI assistant to build widgets, or" : ""} Edit to build your own.</span>
        <button onClick={() => setMode((m) => (m === "view" ? "edit" : "view"))} className="rounded-full border border-line px-3 py-1 text-xs font-medium">
          {mode === "view" ? "Edit dashboard" : "Done editing"}
        </button>
      </div>
      <div style={{ height: 1220 }}>
        <AgStudioProvider licenseKey={process.env.NEXT_PUBLIC_AG_LICENSE_KEY} modules={aiEnabled ? [AgStudioAiModule] : undefined}>
          <AgStudio style={{ height: "100%", width: "100%" }} theme={theme} layout={{ widgetBorderEnabled: true }} data={data} initialState={initial} mode={mode} ai={aiEnabled ? ai : undefined} onApiReady={(e) => (apiRef.current = e.api)} />
        </AgStudioProvider>
      </div>
    </div>
  );
}
