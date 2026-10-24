"use client";

import { useMemo, useState } from "react";
import { enableStudioDevValidations, type AgStudioMode } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import type { Dish, Order } from "@/lib/types";
import { buildStudioData } from "./data";
import { ownerReport } from "./report";
import { chefsNodTheme } from "./theme";

if (process.env.NODE_ENV !== "production") enableStudioDevValidations();

export default function Analytics({ orders, menu }: { orders: (Order & { authorizedAt: string | null })[]; menu: Dish[] }) {
  const [mode, setMode] = useState<AgStudioMode>("view");
  const data = useMemo(() => buildStudioData(orders, menu), [orders, menu]);
  const held = orders.filter((o) => o.authorizationId).length;
  if (!held) return <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-line text-sm text-muted">No held orders yet. Try Kitchen settings, then &ldquo;Fill a week of history&rdquo;.</div>;
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center justify-between bg-paper px-4 py-2 text-sm">
        <span className="text-muted">Built with AG Studio. Switch to edit to build your own widgets.</span>
        <button onClick={() => setMode((m) => (m === "view" ? "edit" : "view"))} className="rounded-full border border-line px-3 py-1 text-xs font-medium">
          {mode === "view" ? "Edit dashboard" : "Done editing"}
        </button>
      </div>
      <div style={{ height: 1100 }}>
        <AgStudioProvider licenseKey={process.env.NEXT_PUBLIC_AG_LICENSE_KEY}>
          <AgStudio style={{ height: "100%", width: "100%" }} theme={chefsNodTheme} layout={{ widgetBorderEnabled: true }} data={data} initialState={ownerReport} mode={mode} />
        </AgStudioProvider>
      </div>
    </div>
  );
}
