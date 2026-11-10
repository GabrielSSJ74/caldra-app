import assert from "node:assert/strict";
import test from "node:test";
import { boxOf, rectPolyline, type Entity } from "./core";
import {
  applyDirectFaceExtrude3DToEntities,
  applyDirectFilletOrChamfer3DToEntities,
  applyDirectOffsetFace3DToEntities,
  applyDirectShell3DToEntities,
  buildDirectTopology3DScene,
  resolveShellOpenCapsFromSelection3D,
} from "./cadDirectModeling3D";
import {
  computeSmartMiterFrame3D,
  generateSmartMiterFrameEntities3D,
} from "./chamfer3DSmartArray";

function makeBaseBoxEntity(id = "box_1", w = 100, h = 100, extrudeHeight = 500): Entity {
  const base = rectPolyline({ x: 0, y: 0 }, { x: w, y: h }, "corte");
  return {
    ...base,
    id,
    extrudeHeight,
    elevationZ: 0,
  };
}

test("Item 1: Shell / Casca 3D hollows end-to-end in Tubo (2 Faces) even when lateral face is clicked, and opens single end in Caixa (1 Face)", () => {
  const base = makeBaseBoxEntity("shell_piece", 100, 100, 500);
  const withFillet = applyDirectFilletOrChamfer3DToEntities(
    [base],
    [base.id],
    "fillet",
    10,
  );
  const scene0 = buildDirectTopology3DScene(withFillet, 20);
  const body0 = scene0.bodies[0]!;

  // Find FRONT (+Y), LEFT (-X), TOP (+Z), BOTTOM (-Z) faces
  const frontFace = body0.faces.find((f) => f.role === "side" && f.normal.y > 0.7)!;
  const leftFace = body0.faces.find((f) => f.role === "side" && f.normal.x < -0.7)!;
  const topFace = body0.faces.find((f) => f.role === "top")!;
  const bottomFace = body0.faces.find((f) => f.role === "bottom")!;

  assert.ok(frontFace, "Front face should exist");
  assert.ok(leftFace, "Left face should exist");

  // 1A. Tubo (2 Faces) (`both_ends`) even when lateral face is clicked -> ALWAYS hollows ["top", "bottom"] along the extrusion axis!
  const capsFrontTube = resolveShellOpenCapsFromSelection3D([frontFace], "both_ends");
  assert.deepEqual(capsFrontTube, ["top", "bottom"]);
  const capsLeftTube = resolveShellOpenCapsFromSelection3D([leftFace], "both_ends");
  assert.deepEqual(capsLeftTube, ["top", "bottom"]);
  const capsTopTube = resolveShellOpenCapsFromSelection3D([topFace], "both_ends");
  assert.deepEqual(capsTopTube, ["top", "bottom"]);

  const entitiesTube = applyDirectShell3DToEntities(withFillet, [base.id], 4.75, capsFrontTube);
  const sceneTube = buildDirectTopology3DScene(entitiesTube, 20);
  const bodyTube = sceneTube.bodies[0]!;
  assert.deepEqual(bodyTube.shellOpenCaps, ["top", "bottom"]);
  // R_interno = max(0.5, R_externo - t) = 10 - 4.75 = 5.25 mm
  assert.equal(bodyTube.innerFilletRadiusMm, 5.25);
  assert.ok(
    bodyTube.faces.some((f) => f.role === "inner_side"),
    "Inner cavity walls must be generated along the tube",
  );
  assert.ok(
    bodyTube.edges.some((e) => e.role === "inner_top") &&
      bodyTube.edges.some((e) => e.role === "inner_bottom"),
    "Both top and bottom open mouth inner rings must exist",
  );

  // 1B. Caixa (1 Face) (`top_only`) on TOP or lateral face -> opens ["top"], keeping bottom closed
  const capsTopBox = resolveShellOpenCapsFromSelection3D([frontFace], "top_only");
  assert.deepEqual(capsTopBox, ["top"]);
  const entitiesTopBox = applyDirectShell3DToEntities(withFillet, [base.id], 3, capsTopBox);
  const sceneTopBox = buildDirectTopology3DScene(entitiesTopBox, 20);
  const bodyTopBox = sceneTopBox.bodies[0]!;
  assert.deepEqual(bodyTopBox.shellOpenCaps, ["top"]);
  assert.ok(
    bodyTopBox.faces.some((f) => f.faceId.endsWith("_face_bottom")),
    "Closed bottom face must exist when only top is open in Caixa (1 Face)",
  );

  // 1C. Caixa (1 Face) on BOTTOM face -> opens ONLY ["bottom"], keeping TOP closed
  const capsBottomBox = resolveShellOpenCapsFromSelection3D([bottomFace], "top_only");
  assert.deepEqual(capsBottomBox, ["bottom"]);
  const entitiesBottomBox = applyDirectShell3DToEntities(withFillet, [base.id], 5, capsBottomBox);
  const sceneBottomBox = buildDirectTopology3DScene(entitiesBottomBox, 20);
  const bodyBottomBox = sceneBottomBox.bodies[0]!;
  assert.ok(
    bodyBottomBox.faces.some((f) => f.faceId.endsWith("_face_top")),
    "Outer top face stays closed when only bottom is opened",
  );
});

test("Item 2: Fillet 3D and Chamfer 3D apply in real time to vertical and horizontal edges", () => {
  const base = makeBaseBoxEntity("fillet_piece", 100, 100, 500);

  // 2A. Vertical edge 0 fillet (R=15mm)
  const afterVertFillet = applyDirectFilletOrChamfer3DToEntities(
    [base],
    [base.id],
    "fillet",
    15,
    [0],
    undefined,
  );
  const sceneVF = buildDirectTopology3DScene(afterVertFillet, 20);
  const bodyVF = sceneVF.bodies[0]!;
  assert.equal(bodyVF.cornerFilletsMm?.[0], 15);
  assert.equal(bodyVF.cornerFilletsMm?.[1] ?? 0, 0);

  // 2B. Horizontal top edge 0 fillet/bevel (R=12mm)
  const afterTopEdgeFillet = applyDirectFilletOrChamfer3DToEntities(
    afterVertFillet,
    [base.id],
    "fillet",
    12,
    undefined,
    ["edge_top_0"],
  );
  const sceneTF = buildDirectTopology3DScene(afterTopEdgeFillet, 20);
  const bodyTF = sceneTF.bodies[0]!;
  assert.equal(bodyTF.vertexBevelsMm?.["edge_top_0"], 12);
  assert.ok(
    bodyTF.faces.some((f) => f.faceId.includes("_face_edge_bevel_top_")),
    "3D topology builds bevel/fillet face on top horizontal edge",
  );
});

test("Item 3: Quadro 45° (Esquadria) calculates Inner, Midline, and Outer dimensions and generates 4 twist-free horizontal 45°-mitered tube bars", () => {
  const baseTube = makeBaseBoxEntity("tube_50", 50, 50, 500);

  // 3A. Medida Interna (Vão Livre): 1000 x 800 with d=50 -> Externa = 1100 x 900
  const calcInner = computeSmartMiterFrame3D({
    measureRef: "inner",
    inputWidthMm: 1000,
    inputHeightMm: 800,
    profileCrossSectionMm: 50,
    plane: "xy",
    jointMode: "miter_45",
    innerDivisionsCount: 3,
  });
  assert.equal(calcInner.innerWidthMm, 1000);
  assert.equal(calcInner.innerHeightMm, 800);
  assert.equal(calcInner.outerWidthMm, 1100);
  assert.equal(calcInner.outerHeightMm, 900);
  assert.equal(calcInner.midWidthMm, 1050);
  assert.equal(calcInner.midHeightMm, 850);
  assert.equal(calcInner.members.length, 4 + 3); // 4 frame sides + 3 internal grille bars
  for (const frameSide of calcInner.members.slice(0, 4)) {
    assert.equal(Math.abs(frameSide.miterCutTopDeg), 45);
    assert.equal(Math.abs(frameSide.miterCutBottomDeg), 45);
  }

  // 3B. Medida Média (Centro a Centro): 1000 x 800 with d=50 -> Externa = 1050 x 850, Interna = 950 x 750
  const calcMid = computeSmartMiterFrame3D({
    measureRef: "mid",
    inputWidthMm: 1000,
    inputHeightMm: 800,
    profileCrossSectionMm: 50,
    plane: "xy",
    jointMode: "miter_45",
    innerDivisionsCount: 0,
  });
  assert.equal(calcMid.midWidthMm, 1000);
  assert.equal(calcMid.midHeightMm, 800);
  assert.equal(calcMid.outerWidthMm, 1050);
  assert.equal(calcMid.outerHeightMm, 850);
  assert.equal(calcMid.innerWidthMm, 950);
  assert.equal(calcMid.innerHeightMm, 750);

  // 3C. Medida Externa (Fora a Fora): 1000 x 800 with d=50 -> Externa = 1000 x 800, Interna = 900 x 700
  const calcOuter = computeSmartMiterFrame3D({
    measureRef: "outer",
    inputWidthMm: 1000,
    inputHeightMm: 800,
    profileCrossSectionMm: 50,
    plane: "xy",
    jointMode: "miter_45",
    innerDivisionsCount: 2,
  });
  assert.equal(calcOuter.outerWidthMm, 1000);
  assert.equal(calcOuter.outerHeightMm, 800);
  assert.equal(calcOuter.innerWidthMm, 900);
  assert.equal(calcOuter.innerHeightMm, 700);

  const genRes = generateSmartMiterFrameEntities3D([baseTube], baseTube.id, calcOuter);
  assert.equal(genRes.createdIds.length, 6); // 4 frame members + 2 internal tubes
  assert.equal(genRes.updatedEntities.length, 6);

  // Build 3D topology scene from generated frame entities and verify all 4 frame bars are horizontal 45°-mitered bars
  const frameScene = buildDirectTopology3DScene(genRes.updatedEntities, 20);
  assert.equal(frameScene.bodies.length, 6);
  for (const barBody of frameScene.bodies.slice(0, 4)) {
    assert.equal(barBody.deltaZ, 50, "Each horizontal frame bar has profile height H_z = 50mm along Z");
    assert.ok(
      barBody.edges.some((e) => e.edgeId.includes("edge_miter_start_")) &&
        barBody.edges.some((e) => e.edgeId.includes("edge_miter_end_")),
      "Each frame bar includes explicit 45° miter cut edges at both ends",
    );
  }
});

test("Item 4: New Body + Offset Face workflow (extrude New Body on tube, close inner cavity, and expand 4 outer sides into Sapata)", () => {
  // Step 1: Create 100x100x500 tube with 5mm wall thickness (2 open caps)
  const rawCol = makeBaseBoxEntity("col_100", 100, 100, 500);
  const shelledEntities = applyDirectShell3DToEntities(
    [rawCol],
    [rawCol.id],
    5,
    ["top", "bottom"],
  );

  // Step 2: Extrude top face by +6mm in "new_body" mode -> creates independent body at Z=500mm
  const extrudeRes = applyDirectFaceExtrude3DToEntities(
    shelledEntities,
    [rawCol.id],
    6,
    "new_body",
  );
  assert.equal(extrudeRes.updatedEntities.length, 2, "Original tube + New Body must both exist");
  const newBodyId = extrudeRes.activeIds[0]!;
  assert.notEqual(newBodyId, rawCol.id);

  const capEntity0 = extrudeRes.updatedEntities.find((e) => e.id === newBodyId)!;
  assert.equal(capEntity0.elevationZ, 500, "New body sits flush on top of Z=500mm tube");
  assert.equal(capEntity0.extrudeHeight, 6, "New body has 6mm extruded thickness");
  assert.equal(capEntity0.shellWallThickness, 5, "New body initially inherits 5mm hollow ring");

  // Step 3: Offset Face on internal cavity ("inner_cavity") by 45mm -> heals/closes the hole completely!
  const afterCloseHole = applyDirectOffsetFace3DToEntities(
    extrudeRes.updatedEntities,
    [newBodyId],
    "inner_cavity",
    45,
  );
  const capEntityClosed = afterCloseHole.find((e) => e.id === newBodyId)!;
  assert.equal(
    capEntityClosed.shellWallThickness,
    0,
    "Internal hole is completely healed (solid plate) when offset >= half inner opening",
  );

  // Step 4: Offset Face on all 4 external sides ("sides") by +25mm -> expands 100x100 into 150x150 centered Sapata!
  const afterExpandSapata = applyDirectOffsetFace3DToEntities(
    afterCloseHole,
    [newBodyId],
    "sides",
    25,
  );
  const sapataEntity = afterExpandSapata.find((e) => e.id === newBodyId)!;
  const sapataBox = boxOf(sapataEntity);
  assert.equal(
    Math.round(sapataBox.maxX - sapataBox.minX),
    150,
    "Width expanded from 100mm to 150mm (+25mm each side)",
  );
  assert.equal(
    Math.round(sapataBox.maxY - sapataBox.minY),
    150,
    "Depth expanded from 100mm to 150mm (+25mm each side)",
  );
  assert.equal(Math.round(sapataBox.minX), -25, "MinX shifted by -25mm keeping center aligned");
  assert.equal(Math.round(sapataBox.minY), -25, "MinY shifted by -25mm keeping center aligned");
});
