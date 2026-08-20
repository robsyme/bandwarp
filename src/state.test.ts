import { describe, expect, it } from "vitest";
import {
  addBand,
  addLane,
  assignRows,
  bandsFromDetection,
  lanesFromDetection,
  type Lane,
  type PlacedBand,
  removeLane,
  sortedLanes,
} from "./state";

const REGION_W = 1200;
const REGION_H = 1000;

function makeLanes(n: number): Lane[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    x: 100 + i * 100,
    label: "",
    isStandard: false,
    amount: "",
  }));
}

// Two warped rows across 8 lanes: shared drift shape, larger amplitude on
// the lower (further-migrated) row — the scaled shared warp's home turf.
function twoRows(lanes: Lane[]): PlacedBand[] {
  const drift = (i: number) => 20 * Math.sin(i / 2);
  const bands: PlacedBand[] = [];
  lanes.forEach((l, i) => {
    bands.push({ id: bands.length + 1, laneId: l.id, y: 300 + drift(i), strength: 0.1, rescued: false, manual: false });
    bands.push({ id: bands.length + 1, laneId: l.id, y: 600 + 2 * drift(i), strength: 0.08, rescued: false, manual: false });
  });
  return bands;
}

describe("assignRows", () => {
  it("groups bands into two rows, top row first", () => {
    const lanes = makeLanes(8);
    const bands = twoRows(lanes);
    const a = assignRows(lanes, bands, REGION_W, REGION_H);
    expect(a.rowCount).toBe(2);
    for (const b of bands) {
      expect(a.rowOf.get(b.id)).toBe(b.y < 450 ? 0 : 1);
    }
    expect(a.curves).toHaveLength(2);
    expect(a.laneXs).toEqual(lanes.map((l) => l.x));
  });

  it("is indifferent to lane array order", () => {
    const lanes = makeLanes(8);
    const bands = twoRows(lanes);
    const shuffled = [lanes[3], lanes[0], lanes[7], lanes[5], lanes[1], lanes[6], lanes[2], lanes[4]];
    const a = assignRows(shuffled, bands, REGION_W, REGION_H);
    expect(a.rowCount).toBe(2);
    expect(a.laneXs).toEqual(lanes.map((l) => l.x));
    for (const b of bands) expect(a.rowOf.get(b.id)).toBe(b.y < 450 ? 0 : 1);
  });

  it("assigns a manually added band to the row its y falls on", () => {
    const lanes = makeLanes(8);
    let bands = twoRows(lanes).filter((b) => !(b.laneId === 4 && b.y < 450));
    bands = addBand(bands, 4, 300 + 20 * Math.sin(3 / 2), 0.05);
    const a = assignRows(lanes, bands, REGION_W, REGION_H);
    const added = bands[bands.length - 1];
    expect(added.manual).toBe(true);
    expect(a.rowOf.get(added.id)).toBe(0);
  });

  it("returns the empty assignment without lanes or bands", () => {
    expect(assignRows([], [], REGION_W, REGION_H).rowCount).toBe(0);
    expect(assignRows(makeLanes(3), [], REGION_W, REGION_H).rowCount).toBe(0);
  });

  it("a wider tolerance connects bands the default fit drops", () => {
    const lanes = makeLanes(8);
    const bands = twoRows(lanes);
    // an extreme outlier on lane 5's top row: ~60 px off the curve
    const wild = { ...bands.find((b) => b.laneId === 5 && b.y < 450)!, y: 360 };
    const mixed = bands.map((b) => (b.laneId === 5 && b.y < 450 ? wild : b));
    const tight = assignRows(lanes, mixed, REGION_W, REGION_H, { tolFrac: 0.035 });
    const loose = assignRows(lanes, mixed, REGION_W, REGION_H, { tolFrac: 0.09 });
    expect(tight.rowOf.get(wild.id)).toBe(-1);
    expect(loose.rowOf.get(wild.id)).toBe(0);
  });
});

describe("row pinning (rowOverride)", () => {
  it("pins a band to a chosen row over the fit's verdict", () => {
    const lanes = makeLanes(8);
    const bands = twoRows(lanes).map((b) =>
      b.laneId === 3 && b.y < 450 ? { ...b, rowOverride: 1 } : b,
    );
    const a = assignRows(lanes, bands, REGION_W, REGION_H);
    const pinnedId = bands.find((b) => b.rowOverride === 1)!.id;
    expect(a.rowOf.get(pinnedId)).toBe(1);
    expect(a.rowCount).toBe(2);
  });

  it("pinning into a new row creates it with a curve through the pins", () => {
    const lanes = makeLanes(8);
    let bands = twoRows(lanes);
    // two hand-pinned points forming a third row the fit never found
    bands = addBand(bands, 2, 800, 0.05, 2);
    bands = addBand(bands, 6, 830, 0.05, 2);
    const a = assignRows(lanes, bands, REGION_W, REGION_H);
    expect(a.rowCount).toBe(3);
    const pinIds = bands.slice(-2).map((b) => b.id);
    for (const id of pinIds) expect(a.rowOf.get(id)).toBe(2);
    expect(a.curves[2]).toHaveLength(8);
    // the new curve passes near the pinned points
    expect(Math.abs(a.curves[2][1] - 800)).toBeLessThan(25);
    expect(Math.abs(a.curves[2][5] - 830)).toBeLessThan(25);
  });

  it("auto rows keep their curves when pins do not touch them", () => {
    const lanes = makeLanes(8);
    const plain = twoRows(lanes);
    const withPin = [...plain];
    const pinned = addBand(withPin, 4, 810, 0.05, 2);
    const before = assignRows(lanes, plain, REGION_W, REGION_H);
    const after = assignRows(lanes, pinned, REGION_W, REGION_H);
    expect(after.curves[0]).toEqual(before.curves[0]);
    expect(after.curves[1]).toEqual(before.curves[1]);
  });
});

describe("lane and band bookkeeping", () => {
  it("links detection bands to lanes by stable id", () => {
    const det = {
      lanes: [50, 150, 250],
      unit: 100,
      yOrigin: 800,
      bands: [
        { lane: 2, y: 300, strength: 0.1, rescued: true },
        { lane: 0, y: 310, strength: 0.2 },
      ],
    };
    const lanes = lanesFromDetection(det);
    const bands = bandsFromDetection(det, lanes);
    expect(lanes.map((l) => l.x)).toEqual([50, 150, 250]);
    expect(bands[0].laneId).toBe(lanes[2].id);
    expect(bands[0].rescued).toBe(true);
    expect(bands[1].laneId).toBe(lanes[0].id);
    expect(bands[1].manual).toBe(false);
  });

  it("removeLane drops the lane and its bands, keeping other ids intact", () => {
    const lanes = makeLanes(3);
    let bands = addBand([], lanes[1].id, 400, 0.1);
    bands = addBand(bands, lanes[2].id, 410, 0.1);
    const out = removeLane(lanes, bands, lanes[1].id);
    expect(out.lanes.map((l) => l.id)).toEqual([1, 3]);
    expect(out.bands).toHaveLength(1);
    expect(out.bands[0].laneId).toBe(3);
  });

  it("addLane keeps ids unique and sortedLanes orders by x", () => {
    let lanes = makeLanes(2);
    lanes = addLane(lanes, 50);
    expect(new Set(lanes.map((l) => l.id)).size).toBe(3);
    expect(sortedLanes(lanes).map((l) => l.x)).toEqual([50, 100, 200]);
  });
});
