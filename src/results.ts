// Results-grid assembly and CSV serialization (ticket 011's decision):
// one row per lane x compound over the full grid, `nd` rows for absent
// bands, censored amounts empty with amount_display carrying "> top",
// standards as ordinary rows.

import { type Calibration, invertArea } from "./analysis/calibrate";
import type { Lane } from "./state";

export interface CellMeasure {
  area: number;
  y: number;
  rescued: boolean;
  manual: boolean;
  saturated: boolean;
}

export interface ResultRow {
  laneNumber: number;
  laneLabel: string;
  isStandard: boolean;
  compound: string;
  rf: number | null;
  areaOd: number | null;
  amount: number | null;
  amountDisplay: string;
  flags: string[];
}

const fmt = (v: number, dp: number) => {
  const s = v.toFixed(dp);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

export function buildRows(
  sortedLanes: Lane[],
  compounds: string[],
  cells: Map<string, CellMeasure>,
  calibrations: (Calibration | null)[],
  rfOf: (y: number) => number | null,
): ResultRow[] {
  const rows: ResultRow[] = [];
  sortedLanes.forEach((lane, li) => {
    compounds.forEach((compound, row) => {
      const cell = cells.get(`${lane.id}:${row}`);
      const base: ResultRow = {
        laneNumber: li + 1,
        laneLabel: lane.label,
        isStandard: lane.isStandard,
        compound,
        rf: null,
        areaOd: null,
        amount: null,
        amountDisplay: "",
        flags: [],
      };
      if (!cell) {
        base.flags.push("nd");
        rows.push(base);
        return;
      }
      base.rf = rfOf(cell.y);
      base.areaOd = cell.area;
      const cal = calibrations[row] ?? null;
      if (cal) {
        const q = invertArea(cal, cell.area);
        if (q.kind === "aboveTop") {
          base.amountDisplay = `> ${fmt(cal.topAmount, 3)}`;
          base.flags.push("above_top_standard");
        } else {
          base.amount = q.amount;
          base.amountDisplay = fmt(q.amount, 3);
          if (q.belowBottom) base.flags.push("below_bottom_standard");
        }
      }
      if (cell.saturated) base.flags.push("saturated");
      if (cell.rescued) base.flags.push("rescued");
      if (cell.manual) base.flags.push("manual");
      rows.push(base);
    });
  });
  return rows;
}

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCSV(rows: ResultRow[], plate: string, unit: string, provenance: string): string {
  const lines = [
    `# ${provenance}`,
    "plate,lane_number,lane_label,is_standard,compound,rf,area_od,amount,unit,amount_display,flags",
  ];
  for (const r of rows)
    lines.push(
      [
        esc(plate),
        String(r.laneNumber),
        esc(r.laneLabel),
        r.isStandard ? "true" : "false",
        esc(r.compound),
        r.rf === null ? "" : fmt(r.rf, 3),
        r.areaOd === null ? "" : fmt(r.areaOd, 4),
        r.amount === null ? "" : fmt(r.amount, 4),
        esc(unit),
        esc(r.amountDisplay),
        esc(r.flags.join(";")),
      ].join(","),
    );
  return lines.join("\n") + "\n";
}
