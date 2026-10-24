// The built-in report: money held vs captured, and what the kitchen did with allergy orders.
import type { AgPageState, AgReportState, AgWidgetLayoutState } from "ag-studio";

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const avg = (id: string) => ({ id, aggregation: "avg" as const });
const FONT = "var(--font-inter), system-ui, sans-serif";
const typo = (fontSize: number, fontWeight: "normal" | "bold" = "normal") => ({ fontFamily: FONT, fontSize, fontWeight, fontStyle: "normal" as const });
const kpi = (text: string, value: { id: string; aggregation?: "sum" | "avg" }, sparklineX?: string) => ({
  type: "value" as const,
  dataMapping: { value: [value], ...(sparklineX && { sparklineX: [{ id: sparklineX }] }) },
  format: { title: { enabled: true, text, typography: typo(13, "bold") }, caption: { enabled: true, text: "", typography: typo(0) }, style: { typography: typo(24) } },
});

const money: AgPageState = {
  id: "money",
  widgets: {
    "kpi-held": kpi("Held in PayPal", sum("orders.held"), "calendar::day"),
    "kpi-captured": kpi("Captured after sign-off", sum("orders.captured"), "calendar::day"),
    "kpi-released": kpi("Released to diners", sum("orders.released"), "calendar::day"),
    "kpi-nod": kpi("Average seconds to nod", avg("orders.nodSeconds")),
    "held-vs-captured": {
      type: "combo-chart-grouped-column-line",
      dataMapping: { categoryKey: [{ id: "calendar::day" }], valueKey: [sum("orders.held"), sum("orders.captured")], secondaryValueKey: [{ id: "captureRate" }] },
      format: { ...title("Held and captured by day, with capture rate"), style: { theme: { common: { legend: { enabled: true } } } } },
    },
    "capture-rate": {
      type: "radial-gauge",
      dataMapping: { value: [{ id: "captureRate" }] },
      format: { ...title("Capture rate"), style: { scaleLabel: { min: 0, max: 1 }, label: { typography: typo(24, "bold") }, secondaryLabel: { enabled: true, text: "of held money captured", typography: typo(12) } } },
    },
    "by-outcome": {
      type: "donut-chart",
      dataMapping: { categoryKey: [{ id: "orders.outcome" }], valueKey: [sum("orders.held")] },
      format: { ...title("Held money by the chef's decision"), style: { custom: { pieDataLabel: { enabled: true }, totalLabel: { enabled: true } } } },
    },
    "by-channel": {
      type: "column-chart-stacked",
      dataMapping: { categoryKey: [{ id: "orders.channel" }], valueKey: [sum("orders.one")], legendKey: [{ id: "orders.outcome" }] },
      format: { ...title("Orders by channel and decision"), style: { theme: { common: { legend: { enabled: true } } } } },
    },
    ledger: {
      type: "grid",
      dataMapping: { cols: [{ id: "orders.createdAt" }, { id: "orders.diner" }, { id: "orders.channel" }, { id: "orders.outcome" }, sum("orders.held"), sum("orders.captured"), sum("orders.released"), avg("orders.nodSeconds")] },
      sort: [{ field: { id: "orders.createdAt" }, direction: "desc" }],
      format: title("Every held order"),
    },
  },
  widgetLayout: {
    "kpi-held": at(0, 0, 6, 7),
    "kpi-captured": at(6, 0, 6, 7),
    "kpi-released": at(12, 0, 6, 7),
    "kpi-nod": at(18, 0, 6, 7),
    "held-vs-captured": at(0, 7, 16, 17),
    "capture-rate": at(16, 7, 8, 17),
    "by-outcome": at(0, 24, 10, 18),
    "by-channel": at(10, 24, 14, 18),
    ledger: at(0, 42, 24, 20),
  },
};

const allergies: AgPageState = {
  id: "allergies",
  widgets: {
    "kpi-allergy": kpi("Allergy orders", sum("orders.allergyOrder")),
    "kpi-conflicts": kpi("Dishes with a declared allergen", sum("lines.conflict")),
    "kpi-fixed": kpi("Fixed by the chef's swaps", sum("lines.allergenRemoved")),
    "kpi-declined": kpi("Declined", sum("orders.declined")),
    declared: {
      type: "bar-chart-grouped",
      dataMapping: { categoryKey: [{ id: "declarations.allergen" }], valueKey: [sum("declarations.one")] },
      sort: [{ field: sum("declarations.one"), direction: "desc" }],
      format: title("Allergies diners declare"),
    },
    "fix-rate": {
      type: "radial-gauge",
      dataMapping: { value: [{ id: "fixRate" }] },
      format: { ...title("Conflicts removed with swaps"), style: { scaleLabel: { min: 0, max: 1 }, label: { typography: typo(24, "bold") }, secondaryLabel: { enabled: true, text: "instead of declining", typography: typo(12) } } },
    },
    "dish-conflicts": {
      type: "column-chart-stacked",
      dataMapping: { categoryKey: [{ id: "lines.dish" }], valueKey: [sum("lines.conflict")], legendKey: [{ id: "lines.conflictAllergens" }] },
      sort: [{ field: sum("lines.conflict"), direction: "desc" }],
      format: { ...title("Which dishes trigger sign-offs, by allergen"), style: { theme: { common: { legend: { enabled: true } } } } },
    },
    pivot: {
      type: "pivot-grid",
      dataMapping: { rows: [{ id: "lines.dish" }], columns: [{ id: "orders.outcome" }], values: [sum("lines.qty")] },
      format: { ...title("Dishes by the chef's decision"), style: { totalColumns: true, totalColumnsPlacement: "before", grandTotalRow: { enabled: true } } },
    },
  },
  widgetLayout: {
    "kpi-allergy": at(0, 0, 6, 7),
    "kpi-conflicts": at(6, 0, 6, 7),
    "kpi-fixed": at(12, 0, 6, 7),
    "kpi-declined": at(18, 0, 6, 7),
    declared: at(0, 7, 14, 18),
    "fix-rate": at(14, 7, 10, 18),
    "dish-conflicts": at(0, 25, 24, 18),
    pivot: at(0, 43, 24, 20),
  },
};

export const ownerReport: AgReportState = { selectedPageId: money.id, pages: [money, allergies] };
