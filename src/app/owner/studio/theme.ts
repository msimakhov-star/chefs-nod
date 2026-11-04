// AG Studio theme built from Chef's Nod's design tokens (see globals.css).
import { studioTheme } from "ag-studio";

// Distinct hues with no red, so no series reads as "bad" by accident.
const PALETTE = ["#1f5a3d", "#d98a1c", "#5b7f95", "#8e6c9e", "#6fae86", "#c9a227", "#3f8f8a", "#9b8f80", "#163f2b", "#e9b872"];

// Charts cannot read CSS variables, so the caller passes the resolved font family.
export const chefsNodTheme = (font: string) =>
  studioTheme.withParams({
  fontFamily: font,
  fontSize: 13,
  textColor: "#1c1917",
  foregroundColor: "#1c1917",
  subtleTextColor: "#6b6359",
  backgroundColor: "#ffffff",
  borderColor: "#e8e0d4",
  accentColor: "#1f5a3d",
  rowHoverColor: "#fbf7f0",
  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: "#fbf7f0",
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: "#fbf7f0",
  studioCanvasPadding: 8,
  studioCanvasRowHeight: 18,
  studioWidgetBackgroundColor: "#ffffff",
  studioWidgetBorder: { width: 1, color: "#e8e0d4" },
  studioWidgetBorderRadius: 16,
  studioWidgetPadding: 12,
  studioWidgetTitleFontSize: 15,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: "#1c1917",
  ...Object.fromEntries(PALETTE.flatMap((c, i) => [[`chartPaletteFills${i + 1}Color`, c], [`chartPaletteStrokes${i + 1}Color`, c]])),
});
