import { describe, expect, it } from "vitest";
import { fitCalibration } from "./analysis/calibrate";
import { bandsToSaved, parseAnalysis, savedToBands, serializeAnalysis } from "./io";
import { buildRows, type CellMeasure, toCSV } from "./results";
import type { Lane, PlacedBand } from "./state";

const lanes: Lane[] = [
  { id: 1, x: 100, label: "G", isStandard: false, amount: "" },
  { id: 2, x: 200, label: "1", isStandard: true, amount: "1" },
];
const compounds = ["Daidzein", "Genistein"];
const cal = fitCalibration([0.5, 1, 2, 4].map((a) => ({ amount: a, area: 2 * a })))!;

function cells(): Map<string, CellMeasure> {
  return new Map<string, CellMeasure>([
    ["1:0", { area: 3, y: 300, rescued: true, manual: false, saturated: false }],
    ["1:1", { area: 20, y: 500, rescued: false, manual: true, saturated: true }],
    ["2:0", { area: 2, y: 305, rescued: false, manual: false, saturated: false }],
    // 2:1 absent -> nd
  ]);
}

describe("buildRows", () => {
  const rows = buildRows(lanes, compounds, cells(), [cal, cal], (y) => (600 - y) / 600);

  it("emits the full lane x compound grid", () => {
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => `${r.laneNumber}/${r.compound}`)).toEqual([
      "1/Daidzein",
      "1/Genistein",
      "2/Daidzein",
      "2/Genistein",
    ]);
  });

  it("quantifies bracketed bands and carries QC flags", () => {
    const r = rows[0];
    expect(r.amount).toBeCloseTo(1.5, 3);
    expect(r.amountDisplay).toBe("1.5");
    expect(r.flags).toEqual(["rescued"]);
    expect(r.rf).toBeCloseTo(0.5, 3);
  });

  it("censors above the top standard: empty amount, display carries > top", () => {
    const r = rows[1];
    expect(r.amount).toBeNull();
    expect(r.amountDisplay).toBe("> 4");
    expect(r.flags).toEqual(["above_top_standard", "saturated", "manual"]);
  });

  it("standards appear as ordinary quantified rows", () => {
    const r = rows[2];
    expect(r.isStandard).toBe(true);
    expect(r.amount).toBeCloseTo(1, 3);
  });

  it("absent bands emit an nd row with empty amount", () => {
    const r = rows[3];
    expect(r.flags).toEqual(["nd"]);
    expect(r.amount).toBeNull();
    expect(r.areaOd).toBeNull();
  });
});

describe("toCSV", () => {
  it("writes the provenance comment, header, and escaped rows", () => {
    const rows = buildRows(lanes, compounds, cells(), [cal, cal], () => null);
    const csv = toCSV(rows, "Gel4B_Aft.jpg", "µg", "test provenance · schema 1");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("# test provenance · schema 1");
    expect(lines[1]).toBe(
      "plate,lane_number,lane_label,is_standard,compound,rf,area_od,amount,unit,amount_display,flags",
    );
    expect(lines).toHaveLength(2 + 4);
    expect(lines[3]).toContain("> 4");
    expect(lines[3]).toContain("above_top_standard;saturated;manual");
    expect(lines[5].endsWith(",nd")).toBe(true);
  });
});

describe("Analysis File round-trip", () => {
  it("serializes and restores bands with their source and bounds", () => {
    const bands: PlacedBand[] = [
      { id: 1, laneId: 1, y: 300, strength: 0.1, rescued: false, manual: false },
      { id: 2, laneId: 2, y: 500, strength: 0.05, rescued: true, manual: false, bounds: { a: 480, b: 520 } },
      { id: 3, laneId: 2, y: 400, strength: 0.02, rescued: false, manual: true },
    ];
    const file = {
      schemaVersion: 1,
      app: "bandwarp test",
      photo: { name: "x.jpg", mime: "image/jpeg", base64: "aGVsbG8=" },
      corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      region: { x0: 0, y0: 0, x1: 10, y1: 10 },
      detection: { unit: 60, yOrigin: 550 },
      lanes,
      compounds,
      unit: "µg",
      bands: bandsToSaved(bands),
      warp: null,
      calibrations: [null, null],
      provenance: "p",
    };
    const back = parseAnalysis(serializeAnalysis(file));
    expect(back.bands.map((b) => b.source)).toEqual(["detected", "rescued", "manual"]);
    expect(savedToBands(back.bands)).toEqual(bands.map((b) => ({ ...b, bounds: b.bounds ?? undefined })));
    expect(back.detection).toEqual({ unit: 60, yOrigin: 550 });
  });

  it("rejects wrong schema versions and non-analysis JSON", () => {
    expect(() => parseAnalysis(JSON.stringify({ schemaVersion: 99 }))).toThrow(/schema/);
    expect(() => parseAnalysis(JSON.stringify({ schemaVersion: 1, lanes: [] }))).toThrow(/Analysis File/);
  });
});
