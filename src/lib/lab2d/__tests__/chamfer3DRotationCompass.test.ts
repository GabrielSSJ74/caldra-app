import test from "node:test";
import assert from "node:assert/strict";
import {
  computeExternalCompassRadiusPx,
  computeRotationDragAngleAndSnap,
  buildCompassSectorPath,
  computeNonOverlappingGizmoBadgePos,
} from "../chamfer3DRotationCompass";

test("computeExternalCompassRadiusPx wraps the entire part with partRadiusPx + 36px (min 125px)", () => {
  const pivot = { x: 600, y: 400 };
  const partPoints = [
    { x: 460, y: 400 },
    { x: 740, y: 400 }, // dist = 140px
    { x: 600, y: 310 },
    { x: 600, y: 490 },
  ];

  const metrics = computeExternalCompassRadiusPx(partPoints, pivot, 1440, 900);
  assert.equal(metrics.partRadiusPx, 140);
  assert.equal(metrics.compassRadiusPx, 140 + 36);

  // Small part still enforces minimum 125px radius
  const smallMetrics = computeExternalCompassRadiusPx(
    [{ x: 620, y: 400 }],
    pivot,
    1440,
    900,
  );
  assert.equal(smallMetrics.partRadiusPx, 20);
  assert.equal(smallMetrics.compassRadiusPx, 125);
});

test("computeRotationDragAngleAndSnap snaps within ±2.5° to key angles and allows 1° free rotation outside", () => {
  const pivot = { x: 500, y: 400 };
  const compassRadiusPx = 160;
  const startRad = 0; // pointing +X

  // 44.1° inside compass rim -> snaps to 45°
  const rad44 = (44.1 * Math.PI) / 180;
  const pt44 = {
    x: pivot.x + Math.cos(rad44) * 150,
    y: pivot.y + Math.sin(rad44) * 150,
  };
  const snap45 = computeRotationDragAngleAndSnap(pt44, pivot, startRad, compassRadiusPx);
  assert.equal(snap45.snapped, true);
  assert.equal(snap45.angleDeg, 45);
  assert.equal(snap45.snappedKeyDeg, 45);

  // -88.2° inside compass rim -> snaps to -90°
  const radNeg88 = (-88.2 * Math.PI) / 180;
  const ptNeg88 = {
    x: pivot.x + Math.cos(radNeg88) * 150,
    y: pivot.y + Math.sin(radNeg88) * 150,
  };
  const snapNeg90 = computeRotationDragAngleAndSnap(ptNeg88, pivot, startRad, compassRadiusPx);
  assert.equal(snapNeg90.snapped, true);
  assert.equal(snapNeg90.angleDeg, -90);

  // 44.0° far outside compass rim (dist = 240 > 160 + 54) -> free 1° adjustment (44°)
  const ptOuter44 = {
    x: pivot.x + Math.cos(rad44) * 240,
    y: pivot.y + Math.sin(rad44) * 240,
  };
  const free44 = computeRotationDragAngleAndSnap(ptOuter44, pivot, startRad, compassRadiusPx);
  assert.equal(free44.isFineOuterZone, true);
  assert.equal(free44.snapped, false);
  assert.equal(free44.angleDeg, 44);
});

test("buildCompassSectorPath builds valid SVG sector and arc paths", () => {
  const res = buildCompassSectorPath(500, 400, 170, 0, 90);
  assert.equal(res.sectorPath.includes("A 170 170 0 0 1"), true);
  assert.equal(res.arcPath.includes("A 170 170 0 0 1"), true);
});

test("computeNonOverlappingGizmoBadgePos keeps badge to the right of all 3 axis tips", () => {
  const origin = { x: 500, y: 400 };
  const xTip = { x: 535, y: 345 };
  const yTip = { x: 560, y: 412 };
  const zTip = { x: 500, y: 336 };
  const pos = computeNonOverlappingGizmoBadgePos(origin, xTip, yTip, zTip, 1280, 720);
  assert.equal(pos.left >= 560 + 26, true);
});
