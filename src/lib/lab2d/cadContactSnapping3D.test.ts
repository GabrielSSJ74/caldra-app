import { describe, expect, it } from "vitest";
import {
  resolveContactAndAlignmentSnaps3D,
  resolveFaceStretchContactSnap,
} from "./cadContactSnapping3D";
import type { DirectBody3D, DirectFace3D } from "./cadDirectModeling3D";

describe("CHAMFER CAD — Snaps de Encosto Suaves (Contact/Flush Snap) e Guias de Alinhamento Colineares", () => {
  const dummyFace = (
    role: DirectFace3D["role"],
    normal: { x: number; y: number; z: number },
    centroid: { x: number; y: number; z: number },
  ): DirectFace3D => ({
    faceId: `face_${role}_${Math.random()}`,
    meshFaceIndex: 0,
    bodyId: "body_1",
    entityId: "ent_1",
    role,
    sideIndex: 0,
    label: role,
    normal,
    centroid,
    areaMm2: 5000,
    polygon3D: [
      { x: centroid.x - 25, y: centroid.y - 25, z: centroid.z },
      { x: centroid.x + 25, y: centroid.y - 25, z: centroid.z },
      { x: centroid.x + 25, y: centroid.y + 25, z: centroid.z },
      { x: centroid.x - 25, y: centroid.y + 25, z: centroid.z },
    ],
  });

  const dummyBody = (
    id: string,
    name: string,
    bbox: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number },
  ): DirectBody3D => ({
    bodyId: id,
    entityId: id,
    name,
    booleanMode: "new_body",
    colorHex: "#94A3B8",
    materialName: "Aço Carbono",
    extrudeHeightMm: bbox.maxZ - bbox.minZ,
    elevationZ: bbox.minZ,
    edgeFilletRadiusMm: 0,
    edgeChamferDistMm: 0,
    shellWallThicknessMm: 0,
    shellThicknessMm: 0,
    sheetThicknessMm: 20,
    shellOpenCaps: ["top", "bottom"],
    offsetFaceTopMm: 0,
    offsetFaceBottomMm: 0,
    offsetFaceSidesMm: 0,
    miterCutTopDeg: 0,
    miterCutTopAxis: "x",
    miterCutBottomDeg: 0,
    miterCutBottomAxis: "x",
    rotation3D: { rxDeg: 0, ryDeg: 0, rzDeg: 0 },
    pivot3D: {
      x: (bbox.minX + bbox.maxX) * 0.5,
      y: (bbox.minY + bbox.maxY) * 0.5,
      z: (bbox.minZ + bbox.maxZ) * 0.5,
    },
    bbox3D: bbox,
    deltaX: bbox.maxX - bbox.minX,
    deltaY: bbox.maxY - bbox.minY,
    deltaZ: bbox.maxZ - bbox.minZ,
    totalAreaMm2: 20000,
    volumeMm3: 100000,
    faces: [
      dummyFace("top", { x: 0, y: 0, z: 1 }, { x: (bbox.minX + bbox.maxX) * 0.5, y: (bbox.minY + bbox.maxY) * 0.5, z: bbox.maxZ }),
      dummyFace("bottom", { x: 0, y: 0, z: -1 }, { x: (bbox.minX + bbox.maxX) * 0.5, y: (bbox.minY + bbox.maxY) * 0.5, z: bbox.minZ }),
      dummyFace("side", { x: 1, y: 0, z: 0 }, { x: bbox.maxX, y: (bbox.minY + bbox.maxY) * 0.5, z: (bbox.minZ + bbox.maxZ) * 0.5 }),
      dummyFace("side", { x: -1, y: 0, z: 0 }, { x: bbox.minX, y: (bbox.minY + bbox.maxY) * 0.5, z: (bbox.minZ + bbox.maxZ) * 0.5 }),
    ],
    edges: [],
    snapCandidates: [],
  });

  it("1. Executa Flush Contact Snap (distância = 0.00 mm) ao aproximar a face de uma peça da outra", () => {
    const staticCol = dummyBody("col_static", "Coluna Fixa", {
      minX: 200,
      maxX: 300,
      minY: 0,
      maxY: 100,
      minZ: 0,
      maxZ: 500,
    });

    const movingViga = dummyBody("viga_movel", "Viga Móvel", {
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 100,
      minZ: 0,
      maxZ: 500,
    });

    const rawDelta = { x: 97, y: 0, z: 0 };
    const res = resolveContactAndAlignmentSnaps3D(movingViga, [staticCol], rawDelta, 1.0, 7.5);

    expect(res.hasContactSnap).toBe(true);
    expect(res.snappedDelta.x).toBe(100);
    expect(res.contactHighlight).toBeDefined();
    expect(res.contactHighlight?.label).toContain("0.00mm");
  });

  it("2. Mantém movimento livre e suave quando fora do limiar de atração (não agressivo)", () => {
    const staticCol = dummyBody("col_static", "Coluna Fixa", {
      minX: 200,
      maxX: 300,
      minY: 0,
      maxY: 100,
      minZ: 0,
      maxZ: 500,
    });

    const movingViga = dummyBody("viga_movel", "Viga Móvel", {
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 100,
      minZ: 0,
      maxZ: 500,
    });

    const rawDelta = { x: 80, y: 0, z: 0 };
    const res = resolveContactAndAlignmentSnaps3D(movingViga, [staticCol], rawDelta, 1.0, 7.5);

    expect(res.hasContactSnap).toBe(false);
    expect(res.snappedDelta.x).toBe(80);
  });

  it("3. Detecta assentamento de topo Z (Apoio Topo Z=0.00 mm ao pousar viga sobre sapata)", () => {
    const sapata = dummyBody("sapata", "Sapata 400×400", {
      minX: 0,
      maxX: 400,
      minY: 0,
      maxY: 400,
      minZ: 0,
      maxZ: 200,
    });

    const coluna = dummyBody("coluna", "Coluna", {
      minX: 100,
      maxX: 200,
      minY: 100,
      maxY: 200,
      minZ: 203,
      maxZ: 703,
    });

    const rawDelta = { x: 0, y: 0, z: -1 };
    const res = resolveContactAndAlignmentSnaps3D(coluna, [sapata], rawDelta, 1.0, 7.5);

    expect(res.hasContactSnap).toBe(true);
    expect(res.snappedDelta.z).toBe(-3);
    expect(res.contactHighlight?.label).toContain("Apoio Topo Z=0.00mm");
  });

  it("4. Snap suave de Face Stretch (Offset Face) até encostar na face oposta da outra peça", () => {
    const staticCol = dummyBody("col_target", "Coluna Lateral", {
      minX: 600,
      maxX: 700,
      minY: 0,
      maxY: 100,
      minZ: 0,
      maxZ: 500,
    });

    const vigaRightFace = dummyFace("side", { x: 1, y: 0, z: 0 }, { x: 100, y: 50, z: 250 });
    const stretchRes = resolveFaceStretchContactSnap(vigaRightFace, 497, [staticCol], 1.0, 7.5);

    expect(stretchRes.hasSnap).toBe(true);
    expect(stretchRes.snappedOffsetMm).toBe(500);
    expect(stretchRes.snapTargetName).toBe("Coluna Lateral");
    expect(stretchRes.contactHighlight?.label).toContain("0.00mm");
  });

  it("5. Gera guias dinâmicas de alinhamento colinear para centros e quinas/faces coplanares", () => {
    const colA = dummyBody("col_a", "Coluna A", {
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 100,
      minZ: 0,
      maxZ: 500,
    });

    const colB = dummyBody("col_b", "Coluna B", {
      minX: 300,
      maxX: 400,
      minY: 20,
      maxY: 120,
      minZ: 0,
      maxZ: 500,
    });

    // Movendo Coluna B em Y por -18 mm deixa o centro Y em 52 mm (a 2 mm do centro Y=50 mm da Coluna A)
    const res = resolveContactAndAlignmentSnaps3D(colB, [colA], { x: 0, y: -18, z: 0 }, 1.0, 7.5);
    expect(res.hasAlignmentSnap).toBe(true);
    expect(res.snappedDelta.y).toBe(-20);
    expect(res.alignmentGuides.some((g) => g.axis === "y")).toBe(true);
  });
});

