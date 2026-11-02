import { describe, expect, it } from "vitest";
import {
  resolveContactAndAlignmentSnaps3D,
  resolveFaceStretchContactSnap,
  type ContactSnapResult3D,
} from "./cadContactSnapping3D";
import type { DirectBody3D, DirectFace3D } from "./cadDirectModeling3D";

describe("CHAMFER CAD — Snaps de Encosto Suaves (Contact/Flush Snap) e Guias de Alinhamento Colineares", () => {
  const dummyFace = (role: DirectFace3D["role"], normal: { x: number; y: number; z: number }, centroid: { x: number; y: number; z: number }): DirectFace3D => ({
    faceId: `face_${role}_${Math.random()}`,
    meshFaceIndex: 0,
    bodyId: "body_1",
    entityId: "ent_1",
    role,
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

  const dummyBody = (id: string, name: string, bbox: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }): DirectBody3D => ({
    bodyId: id,
    entityId: id,
    name,
    colorHex: "#94A3B8",
    materialName: "Aço Carbono",
    extrudeHeightMm: bbox.maxZ - bbox.minZ,
    elevationZ: bbox.minZ,
    pivot3D: {
      x: (bbox.minX + bbox.maxX) * 0.5,
      y: (bbox.minY + bbox.maxY) * 0.5,
      z: (bbox.minZ + bbox.maxZ) * 0.5,
    },
    bbox3D: bbox,
    faces: [
      dummyFace("top", { x: 0, y: 0, z: 1 }, { x: (bbox.minX + bbox.maxX) * 0.5, y: (bbox.minY + bbox.maxY) * 0.5, z: bbox.maxZ }),
      dummyFace("bottom", { x: 0, y: 0, z: -1 }, { x: (bbox.minX + bbox.maxX) * 0.5, y: (bbox.minY + bbox.maxY) * 0.5, z: bbox.minZ }),
      dummyFace("side", { x: 1, y: 0, z: 0 }, { x: bbox.maxX, y: (bbox.minY + bbox.maxY) * 0.5, z: (bbox.minZ + bbox.maxZ) * 0.5 }),
      dummyFace("side", { x: -1, y: 0, z: 0 }, { x: bbox.minX, y: (bbox.minY + bbox.maxY) * 0.5, z: (bbox.minZ + bbox.maxZ) * 0.5 }),
    ],
    edges: [],
    snapCandidates: [],
    is2DSketchProfile: false,
  });

  it("1. Executa Flush Contact Snap (distância = 0.00 mm) ao aproximar a face de uma peça da outra", () => {
    // Coluna estática em X: 200..300, Y: 0..100, Z: 0..500
    const staticCol = dummyBody("col_static", "Coluna Fixa", {
      minX: 200,
      maxX: 300,
      minY: 0,
      maxY: 100,
      minZ: 0,
      maxZ: 500,
    });

    // Peça móvel inicialmente em X: 0..100, Y: 0..100, Z: 0..500
    const movingViga = dummyBody("viga_movel", "Viga Móvel", {
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 100,
      minZ: 0,
      maxZ: 500,
    });

    // Se o usuário arrasta para dx = 97 mm, a maxX vai para 197 mm (gap = 3 mm até 200 mm)
    // Com limiar de 5 mm, deve atrair suavemente para encostar em X=200 mm (dx = 100 mm)
    const rawDelta = { x: 97, y: 0, z: 0 };
    const res = resolveContactAndAlignmentSnaps3D(movingViga, [staticCol], rawDelta, 1.0, 7.5);

    expect(res.hasContactSnap).toBe(true);
    expect(res.snappedDelta.x).toBe(100); // 100 mm garante maxX = 200 mm (contato físico 0.00 mm)
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

    // Se o usuário arrasta para dx = 80 mm (distância de 20 mm, bem além do limiar curto)
    const rawDelta = { x: 80, y: 0, z: 0 };
    const res = resolveContactAndAlignmentSnaps3D(movingViga, [staticCol], rawDelta, 1.0, 7.5);

    expect(res.hasContactSnap).toBe(false);
    expect(res.snappedDelta.x).toBe(80); // 100% contínuo e inalterado
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
      minZ: 203, // 3 mm acima da sapata
      maxZ: 703,
    });

    const rawDelta = { x: 0, y: 0, z: -1 }; // Usuário puxa -1 mm (ficando a 2 mm do topo)
    const res = resolveContactAndAlignmentSnaps3D(coluna, [sapata], rawDelta, 1.0, 7.5);

    expect(res.hasContactSnap).toBe(true);
    expect(res.snappedDelta.z).toBe(-3); // Pousa exatamente em Z=200 mm
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

    // Face lateral direita da viga em X=100 com normal apontando para +X
    const vigaRightFace = dummyFace("side", { x: 1, y: 0, z: 0 }, { x: 100, y: 50, z: 250 });

    // Distância exata até a face esquerda da coluna (em X=600) é 500 mm
    // Se o usuário esticar até 497 mm (3 mm de diferença)
    const stretchRes = resolveFaceStretchContactSnap(vigaRightFace, 497, [staticCol], 1.0, 7.5);

    expect(stretchRes.hasSnap).toBe(true);
    expect(stretchRes.snappedOffsetMm).toBe(500);
    expect(stretchRes.snapTargetName).toBe("Coluna Lateral");
  });
});
