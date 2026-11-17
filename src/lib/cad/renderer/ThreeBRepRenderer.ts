/**
 * CALDRA CAD — THREE.JS B-REP SOLID RENDERER (FASE 03 & FASE 04)
 *
 * Renderizador WebGL profissional especializado em geometria B-Rep (Boundary Representation).
 * Converte a tesselação e arestas analíticas do CALDRA CAD CORE em visualização Three.js.
 *
 * Recursos:
 * - Separação estrita de triângulos de face e arestas de fronteira CAD (sem diagonais internas)
 * - Modos técnicos industriais CALDRA: SOMB, SOMB+AR, ARAME
 * - Iluminação técnica de 4 pontos (Key, Fill, Rim, Ambient)
 * - Seleção topológica via Raycasting (Face, Edge, Vertex)
 * - Multi-seleção (Shift+Click) e Medição Tridimensional Analítica de Distância
 * - Linha de cota e medição tridimensional interativa entre 2 entidades
 * - Animação de transição suave de vistas canônicas (ISO, FR, LAT, SUP)
 * - Câmera com OrbitControls e suporte a projeção Perspectiva e Ortográfica
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { CadTessellatedShape } from "../core/CadMesh";
import type { CadSelectedEntity, CadSelectionType, CadMeasurementResult } from "../core/CadSelection";
import type { EdgeMode, ViewPresetId } from "@/lib/viz3d/cameraPresets";
import {
  DEFAULT_BREP_WIREFRAME_LAYER_CONFIG,
  type BRepTechnicalWireframeData3D,
  type BRepWireframeLayerConfig,
} from "@/lib/lab2d/chamferBRepWireframe3D";
import {
  computeAdaptiveZoomMetrics,
  loadZoomSensitivityConfig,
} from "@/lib/lab2d/chamferAdaptiveZoom";
import {
  computeOrbitalBasisZUp,
  cubicBezier022,
  evaluateMorphCameraPose,
  type Camera2DTo3DMatch,
  type CameraPose3D,
  type Sketch3DWireframe,
} from "../sketch/sketch3dBridge";
import {
  GENESIS_CONSTRUCTION_DURATION_MS,
  computeGenesisBoundsFromPositions,
  computeGenesisConstructionProgress,
  computeGenesisShimmerFactor,
  createGenesisLaserEdgesGeometry,
  createGenesisLaserEdgesMaterial,
  createGenesisVertexPinpointsObject,
  extractGenesisVertexPinpoints3D,
  type GenesisBounds3D,
} from "@/lib/viz3d/genesisWireframeShader";

export type CadGizmoMode = "translate" | "rotate" | "scale" | "off";

export interface ThreeBRepRendererOptions {
  container: HTMLElement;
  edgeMode?: EdgeMode;
  view?: ViewPresetId;
  selectionType?: CadSelectionType;
  gizmoMode?: CadGizmoMode;
  onSelect?: (entity: CadSelectedEntity | null, multiSelection: CadSelectedEntity[]) => void;
  onHover?: (entity: CadSelectedEntity | null) => void;
  onMeasure?: (measurement: CadMeasurementResult | null) => void;
  onGizmoChange?: (delta: { x: number; y: number; z: number }) => void;
  onGizmoCommit?: (delta: { x: number; y: number; z: number }, entity: CadSelectedEntity | null) => void;
  onCameraRotate?: (rot: { x: number; y: number; z: number }) => void;
  onOrbitAnglesChange?: (angles: { azimuthDeg: number; elevationDeg: number }) => void;
  transparentBackground?: boolean;
  showFloorGrid?: boolean;
  disableOrbitControls?: boolean;
  onDemandRender?: boolean;
}

export class ThreeBRepRenderer {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private orthoCamera: THREE.OrthographicCamera;
  private activeCamera: THREE.Camera;
  private controls: OrbitControls;

  // Grupos e Objetos na Cena
  private rootGroup: THREE.Group;
  private meshGroup: THREE.Group;
  private edgesGroup: THREE.Group;
  private brepWireframeGroup: THREE.Group;
  private verticesGroup: THREE.Group;
  private sketchWireframeGroup: THREE.Group;
  private loftPreviewGroup: THREE.Group;
  private selectionOverlayGroup: THREE.Group;
  private measurementGroup: THREE.Group;
  private gridHelper: THREE.GridHelper | null = null;
  private currentTheme: "light" | "dark" = "light";

  // Dados do Sólido Carregado e Camadas ARAME B-Rep
  private currentShape: CadTessellatedShape | null = null;
  private currentBRepWireframeData: BRepTechnicalWireframeData3D | null = null;
  private brepWireframeLayers: BRepWireframeLayerConfig = {
    ...DEFAULT_BREP_WIREFRAME_LAYER_CONFIG,
  };
  private currentScreenScalePxPerMm = 1.0;
  private depthPrePassMesh: THREE.Mesh | null = null;
  private depthPrePassMaterial: THREE.MeshBasicMaterial;
  private brepOuterContourMat: LineMaterial;
  private brepFeatureThicknessMat: LineMaterial;
  private brepInternalDetailMat: LineMaterial;
  private brepHiddenXRayMat: LineMaterial;
  private brepCenterlineAxisMat: LineMaterial;
  private brepSelectedEdgeMat: LineMaterial;
  private brepLineObjects: {
    outerContour: THREE.Object3D | null;
    featureThickness: THREE.Object3D | null;
    internalDetail: THREE.Object3D | null;
    hiddenXRay: THREE.Object3D | null;
    centerlineAxis: THREE.Object3D | null;
  } = {
    outerContour: null,
    featureThickness: null,
    internalDetail: null,
    hiddenXRay: null,
    centerlineAxis: null,
  };
  private genesisVisibleLaserMat: THREE.ShaderMaterial;
  private genesisXRayLaserMat: THREE.ShaderMaterial;
  private genesisPinpointsObj: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  private genesisCompassGroup: THREE.Group | null = null;
  private genesisBounds: GenesisBounds3D | null = null;
  private genesisBuildStartTime = 0;
  private genesisShimmerTimerId: ReturnType<typeof setTimeout> | null = null;
  private isSoftwareGl = false;
  private currentWireframes: Sketch3DWireframe[] = [];
  private multiSelection: CadSelectedEntity[] = [];
  private hoveredEntity: CadSelectedEntity | null = null;

  // Materiais Técnicos Industriais (Shapr3D Studio Satin & SolidWorks Technical Matcap & Genesis Glass)
  private baseSolidMaterial: THREE.ShaderMaterial;
  private studioUniforms: {
    uShadingMode: { value: number };
    uKeyLightDir: { value: THREE.Vector3 };
    uFillLightDir: { value: THREE.Vector3 };
    uViewDir: { value: THREE.Vector3 };
    uCamRight: { value: THREE.Vector3 };
    uCamUp: { value: THREE.Vector3 };
    uUpDir: { value: THREE.Vector3 };
    uPartCenter: { value: THREE.Vector3 };
    uPartRadius: { value: number };
    uOpacity: { value: number };
    uWireframeColor: { value: THREE.Color };
    uZMin: { value: number };
    uZMax: { value: number };
    uGenesisBuildProgress: { value: number };
  };
  private keyLight: THREE.DirectionalLight | null = null;
  private fillLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private primaryFaceMaterial: THREE.MeshStandardMaterial;
  private secondaryFaceMaterial: THREE.MeshStandardMaterial;
  private hoveredFaceMaterial: THREE.MeshStandardMaterial;
  private edgeMaterial: THREE.LineBasicMaterial;
  private primaryEdgeMaterial: THREE.LineBasicMaterial;
  private secondaryEdgeMaterial: THREE.LineBasicMaterial;
  private vertexMaterial: THREE.PointsMaterial;
  private selectedVertexMaterial: THREE.PointsMaterial;
  private dimensionLineMaterial: THREE.LineDashedMaterial;

  // Estado e Controle
  private edgeMode: EdgeMode = "shaded-edges";
  private selectionType: CadSelectionType = "face";
  private isOrtho = false;
  private orbitModeActive = false;
  private hasInitialCameraPose = false;
  private lastCameraMatch: Camera2DTo3DMatch | null = null;
  private onSelectCallback?: (entity: CadSelectedEntity | null, multiSelection: CadSelectedEntity[]) => void;
  private onHoverCallback?: (entity: CadSelectedEntity | null) => void;
  private onMeasureCallback?: (measurement: CadMeasurementResult | null) => void;
  private onGizmoChangeCallback?: (delta: { x: number; y: number; z: number }) => void;
  private onGizmoCommitCallback?: (delta: { x: number; y: number; z: number }, entity: CadSelectedEntity | null) => void;
  private onCameraRotateCallback?: (rot: { x: number; y: number; z: number }) => void;
  private onOrbitAnglesChangeCallback?: (angles: { azimuthDeg: number; elevationDeg: number }) => void;
  private transparentBackground = false;
  private showFloorGrid = true;
  private disableOrbitControls = false;
  private onDemandRender = false;
  private isPaused = false;
  private renderQueued = false;

  // Gizmo CAD Interativo (FASE 06)
  private transformControls: TransformControls | null = null;
  private gizmoTargetMesh: THREE.Mesh | null = null;
  private gizmoMode: CadGizmoMode = "off";
  private gizmoInitialPos: THREE.Vector3 = new THREE.Vector3();

  // Animação e Renderização
  private isDestroyed = false;
  private animFrameId = 0;
  private resizeObserver: ResizeObserver | null = null;
  private tempEuler: THREE.Euler = new THREE.Euler();
  private lastReportedRotation: { x: number; y: number; z: number } = {
    x: Number.NaN,
    y: Number.NaN,
    z: Number.NaN,
  };
  private lastReportedOrbitAngles: { azimuthDeg: number; elevationDeg: number } = {
    azimuthDeg: Number.NaN,
    elevationDeg: Number.NaN,
  };
  private cameraAnimation: {
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromUp?: THREE.Vector3;
    toUp?: THREE.Vector3;
    startTime: number;
    duration: number;
  } | null = null;

  private morphAnimation: {
    direction: "to3d" | "to2d";
    match: Camera2DTo3DMatch;
    startTime: number;
    durationMs: number;
    startProgress3D: number;
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    fromUp: THREE.Vector3;
    onProgress?: (progress3D: number) => void;
    onComplete?: () => void;
  } | null = null;

  // Raycasting
  private raycaster: THREE.Raycaster;
  private pointer: THREE.Vector2;
  private pointerDownTime = 0;
  private pointerDownPos: { x: number; y: number } = { x: 0, y: 0 };

  constructor(options: ThreeBRepRendererOptions) {
    this.container = options.container;
    this.edgeMode = options.edgeMode ?? "shaded-edges";
    this.selectionType = options.selectionType ?? "face";
    this.onSelectCallback = options.onSelect;
    this.onHoverCallback = options.onHover;
    this.onMeasureCallback = options.onMeasure;
    this.onCameraRotateCallback = options.onCameraRotate;
    this.onOrbitAnglesChangeCallback = options.onOrbitAnglesChange;
    this.transparentBackground = options.transparentBackground ?? false;
    this.showFloorGrid = false;
    this.disableOrbitControls = options.disableOrbitControls ?? false;
    this.onDemandRender = options.onDemandRender ?? false;

    // 1. Cena Three.js
    this.scene = new THREE.Scene();
    this.scene.background = null;

    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;

    // 2. Câmeras (FOV 38° alinhado com correspondência óptica 2D <-> 3D; Near Clipping 0.01 e Ortho -50000..50000 para zoom extremo sem cortar a peça)
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.01, 100000);
    this.camera.position.set(0, -160, 220);
    this.camera.up.set(0, 1, 0);

    const aspect = width / height;
    const d = 120;
    this.orthoCamera = new THREE.OrthographicCamera(
      -d * aspect,
      d * aspect,
      d,
      -d,
      -50000,
      50000,
    );
    this.orthoCamera.position.copy(this.camera.position);
    this.orthoCamera.up.copy(this.camera.up);

    this.activeCamera = this.isOrtho ? this.orthoCamera : this.camera;

    // 3. Renderer WebGL
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // 4. OrbitControls
    this.controls = new OrbitControls(this.activeCamera, this.renderer.domElement);
    this.controls.enableDamping = !this.disableOrbitControls;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 50000;
    this.controls.target.set(0, 0, 0);
    if (this.disableOrbitControls) {
      this.controls.enabled = false;
    }

    // 5. Grupos de Geometria
    this.rootGroup = new THREE.Group();
    this.meshGroup = new THREE.Group();
    this.edgesGroup = new THREE.Group();
    this.brepWireframeGroup = new THREE.Group();
    this.verticesGroup = new THREE.Group();
    this.sketchWireframeGroup = new THREE.Group();
    this.loftPreviewGroup = new THREE.Group();
    this.selectionOverlayGroup = new THREE.Group();
    this.measurementGroup = new THREE.Group();

    this.rootGroup.add(this.meshGroup);
    this.rootGroup.add(this.edgesGroup);
    this.rootGroup.add(this.brepWireframeGroup);
    this.rootGroup.add(this.verticesGroup);
    this.rootGroup.add(this.sketchWireframeGroup);
    this.rootGroup.add(this.loftPreviewGroup);
    this.rootGroup.add(this.selectionOverlayGroup);
    this.rootGroup.add(this.measurementGroup);
    this.scene.add(this.rootGroup);

    // 6. Configuração de Iluminação de Estúdio 3 Fontes Acoplada à Câmera
    this.setupLighting();

    // 7. Gizmo CAD (FASE 06)
    this.gizmoMode = options.gizmoMode ?? "off";
    this.onGizmoChangeCallback = options.onGizmoChange;
    this.onGizmoCommitCallback = options.onGizmoCommit;
    this.setupGizmo();

    // 8. Motor de Sombreamento Metálico Acetinado Caldra-Code (1º: SOMB | 2º: SOMB+AR | 3º: ARAME)
    this.studioUniforms = {
      uShadingMode: { value: this.edgeMode === "shaded" ? 0 : this.edgeMode === "wireframe" ? 2 : 1 },
      uKeyLightDir: { value: new THREE.Vector3(0.35, 0.45, 0.85).normalize() },
      uFillLightDir: { value: new THREE.Vector3(-0.55, -0.35, 0.45).normalize() },
      uViewDir: { value: new THREE.Vector3(0, -0.6, 0.8).normalize() },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) },
      uCamUp: { value: new THREE.Vector3(0, 0, 1) },
      uUpDir: { value: new THREE.Vector3(0, 0, 1) },
      uPartCenter: { value: new THREE.Vector3(0, 0, 5) },
      uPartRadius: { value: 80.0 },
      uOpacity: { value: 1.0 },
      uWireframeColor: { value: new THREE.Color(0x1e3a5f) },
      uZMin: { value: 0.0 },
      uZMax: { value: 10.0 },
      uGenesisBuildProgress: { value: 1.0 },
    };

    this.baseSolidMaterial = new THREE.ShaderMaterial({
      uniforms: this.studioUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        varying vec3 vViewPos;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPosition.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform int uShadingMode;
        uniform vec3 uKeyLightDir;
        uniform vec3 uFillLightDir;
        uniform vec3 uViewDir;
        uniform vec3 uCamRight;
        uniform vec3 uCamUp;
        uniform vec3 uUpDir;
        uniform vec3 uPartCenter;
        uniform float uPartRadius;
        uniform float uOpacity;
        uniform vec3 uWireframeColor;
        uniform float uZMin;
        uniform float uZMax;
        uniform float uGenesisBuildProgress;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        varying vec3 vViewPos;

        void main() {
          if (uShadingMode == 2) {
            // CAMADA 3 (MODO ARAME) — ESPESSURA EM AZUL-AÇO PETRÓLEO ACETINADO (#2B4C73 / #345B87, opacity: 0.22)
            // E FACES HORIZONTAIS (TOPO +Z E BASE -Z) QUASE 100% TRANSPARENTES (opacity: 0.02)
            vec3 N = normalize(vWorldNormal);
            float absNz = abs(N.z);

            vec3 lightDir = normalize(vec3(-0.55, -0.65, 0.52));
            float dirShade = clamp(0.5 + 0.5 * dot(N, lightDir), 0.0, 1.0);

            vec3 steelBlueDark = vec3(0.169, 0.298, 0.451); // #2B4C73
            vec3 steelBlueMid  = vec3(0.204, 0.357, 0.529); // #345B87
            vec3 wallColor = mix(steelBlueDark, steelBlueMid, dirShade);

            if (absNz > 0.75) {
              gl_FragColor = vec4(wallColor, 0.02 * uGenesisBuildProgress);
            } else {
              float wallOpacity = mix(0.16, 0.26, dirShade) * uGenesisBuildProgress;
              gl_FragColor = vec4(wallColor, wallOpacity);
            }
            return;
          }

          // MODOS "SOMB" (uShadingMode == 0) e "SOMB+AR" (uShadingMode == 1) DO CALDRA-CODE:
          // Base em Aço Anodizado / Grafite-Azulado Escuro (#1E2736 -> #252F3F / #283244 -> #334155)
          // com Reflexo Especular Metálico Acetinado Dinâmico em Prata-Brilhante (#CBD5E1 -> #F8FAFC)
          // acoplado à câmera (Headlight offset (0.35, 0.45, 0.85)).
          vec3 N = normalize(vWorldNormal);
          if (dot(N, uViewDir) < 0.0) {
            N = -N;
          }

          // Normal no espaço da câmera (View Space):
          // vN.x = direita da tela, vN.y = topo da tela, vN.z = apontando para a câmera
          vec3 vN = normalize(vec3(
            dot(N, uCamRight),
            dot(N, uCamUp),
            dot(N, uViewDir)
          ));

          // Coordenadas espaciais normalizadas da peça no plano da câmera
          // (em ISO, compensamos o escorço vertical para que o flange ocupe [-1..+1] em camU e camV)
          float safeRadius = max(uPartRadius, 25.0);
          vec3 relPos = (vWorldPos - uPartCenter) / safeRadius;
          float camU = clamp(dot(relPos, uCamRight) * 1.15, -1.35, 1.35);
          float camV = clamp(dot(relPos, uCamUp) * 1.55, -1.35, 1.35);

          // Direção da Headlight no espaço da câmera (offset (0.35, 0.45, 0.85) + componente zenital)
          vec3 viewHeadlightDir = normalize(vec3(0.35, 0.58, 0.73));
          float faceLight = clamp(max(dot(vN, viewHeadlightDir), dot(N, uKeyLightDir)), 0.0, 1.0);
          float ndotV = clamp(vN.z, 0.0, 1.0);

          // Varredura espacial da luz principal (Headlight) sobre a superfície da peça:
          // s varia de -1.0 (lado oblíquo em sombra) até +1.0 (zona de reflexo especular da Headlight)
          float s = camU * 0.56 + camV * 0.83;
          float crossCoord = -camU * 0.83 + camV * 0.56;
          float radialFalloff = clamp(1.0 - 0.22 * crossCoord * crossCoord, 0.0, 1.0);

          // Paleta Metálica Caldra-Code (Aço Anodizado Escuro -> Prata Acetinado Brilhante):
          vec3 deepShadowSteel = vec3(0.118, 0.153, 0.212); // #1E2736 (Sombra profunda / contra-luz)
          vec3 darkAnodized    = vec3(0.145, 0.184, 0.247); // #252F3F (Base Aço Anodizado em ângulo oblíquo)
          vec3 slateSteelMid   = vec3(0.200, 0.255, 0.333); // #334155 (Meio-tom Grafite-Azulado)
          vec3 brushedSteel    = vec3(0.420, 0.498, 0.604); // #6B7F9A (Transição Aço Usinado)
          vec3 silverSatin     = vec3(0.796, 0.835, 0.882); // #CBD5E1 (Reflexo Prata Acetinado)
          vec3 silverPeak      = vec3(0.973, 0.980, 0.988); // #F8FAFC (Pico Especular Prata-Brilhante)

          // 1. Corpo base em Aço Anodizado Escuro (#1E2736 -> #252F3F -> #334155) nas regiões oblíquas
          float obliqueGrad = smoothstep(-0.75, 0.25, s) * (0.35 + 0.65 * faceLight);
          vec3 baseBody = mix(deepShadowSteel, darkAnodized, smoothstep(0.0, 0.45, faceLight + ndotV * 0.3));
          baseBody = mix(baseBody, slateSteelMid, obliqueGrad);

          // 2. Rim Light sutil nas paredes cilíndricas e furos em ângulo rasante (#263040)
          float cylFactor = clamp(1.0 - abs(N.z), 0.0, 1.0);
          float rimGrazing = pow(1.0 - ndotV, 2.2) * (0.4 + 0.6 * cylFactor);
          baseBody += vec3(0.165, 0.212, 0.282) * (rimGrazing * 0.50);

          // 3. Reflexo Especular Metálico Acetinado Dinâmico (#CBD5E1 -> #F8FAFC):
          // Em faces que refletem a câmera/Headlight, gera o gradiente metálico intenso do Caldra-Code
          float faceGate = smoothstep(0.18, 0.72, faceLight);
          float sweepZeroToOne = smoothstep(-0.28, 0.82, s) * radialFalloff;

          float planarBroad  = pow(sweepZeroToOne, 1.35) * faceGate;
          float planarMedium = pow(sweepZeroToOne, 2.60) * faceGate;
          float planarPeak   = pow(sweepZeroToOne, 4.80) * smoothstep(0.42, 0.88, faceLight);

          // Em paredes cilíndricas curvas (borda externa do flange e paredes internas dos furos),
          // a normal gira 360°, gerando faixa especular prata-brilhante nítida sobre o cilindro
          vec2 cylN2 = normalize(vec2(vN.x, vN.z) + vec2(1e-5, 0.0));
          float cylAlign = max(0.0, dot(cylN2, normalize(vec2(0.42, 0.91))));
          float cylBroad  = cylFactor * pow(cylAlign, 2.8);
          float cylMedium = cylFactor * pow(cylAlign, 6.5);
          float cylPeak   = cylFactor * pow(cylAlign, 16.0);

          float totalBroad  = clamp(max(planarBroad, cylBroad), 0.0, 1.0);
          float totalMedium = clamp(max(planarMedium, cylMedium), 0.0, 1.0);
          float totalPeak   = clamp(max(planarPeak, cylPeak), 0.0, 1.0);

          vec3 color = mix(baseBody, brushedSteel, clamp(totalBroad * 0.90, 0.0, 1.0));
          color = mix(color, silverSatin, clamp(totalMedium * 0.92, 0.0, 1.0));
          color = mix(color, silverPeak, clamp(totalPeak * 0.88, 0.0, 1.0));

          gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
      `,
      polygonOffset: true,
      polygonOffsetFactor: 1.5,
      polygonOffsetUnits: 1.5,
      side: THREE.DoubleSide,
      transparent: false,
      depthWrite: true,
    });

    this.primaryFaceMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Azul primário de seleção
      emissive: 0x0369a1,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.6,
      flatShading: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    });

    this.secondaryFaceMaterial = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Âmbar secundário para medição entre faces
      emissive: 0xb45309,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.6,
      flatShading: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    });

    this.hoveredFaceMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.25,
      roughness: 0.3,
      metalness: 0.6,
      flatShading: false,
      polygonOffset: true,
      polygonOffsetFactor: -0.5,
      polygonOffsetUnits: -0.5,
      side: THREE.DoubleSide,
    });

    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xf8fafc,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.88,
    });

    this.primaryEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      linewidth: 3.0,
    });

    this.secondaryEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      linewidth: 3.0,
    });

    this.vertexMaterial = new THREE.PointsMaterial({
      color: 0x64748b,
      size: 6,
      sizeAttenuation: false,
    });

    this.selectedVertexMaterial = new THREE.PointsMaterial({
      color: 0x0284c7,
      size: 9,
      sizeAttenuation: false,
    });

    this.dimensionLineMaterial = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      scale: 1,
      dashSize: 3,
      gapSize: 2,
    });

    // 7.5. Materiais Screen-Space Invariantes para o Modo "ARAME TÉCNICO B-REP"
    const resVec = new THREE.Vector2(width, height);
    this.depthPrePassMaterial = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: 1.5,
      polygonOffsetUnits: 1.5,
      side: THREE.DoubleSide,
    });

    this.brepOuterContourMat = new LineMaterial({
      color: 0xf8fafc,
      linewidth: 1.05,
      worldUnits: false,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      resolution: resVec.clone(),
    });

    this.brepFeatureThicknessMat = new LineMaterial({
      color: 0xbae6fd,
      linewidth: 0.95,
      worldUnits: false,
      transparent: true,
      opacity: 0.75,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      resolution: resVec.clone(),
    });

    this.brepInternalDetailMat = new LineMaterial({
      color: 0x38bdf8,
      linewidth: 0.85,
      worldUnits: false,
      transparent: true,
      opacity: 0.55,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      resolution: resVec.clone(),
    });

    // Raio-X Contínuo Ultra-Fino em Azul-Safira Translúcido (NUNCA tracejado grosseiro!)
    this.brepHiddenXRayMat = new LineMaterial({
      color: 0x60a5fa,
      linewidth: 0.85,
      worldUnits: false,
      dashed: false,
      transparent: true,
      opacity: 0.22,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      resolution: resVec.clone(),
    });

    this.brepCenterlineAxisMat = new LineMaterial({
      color: 0x38bdf8,
      linewidth: 0.75,
      worldUnits: false,
      dashed: false,
      transparent: true,
      opacity: 0.16,
      depthTest: false,
      depthWrite: false,
      resolution: resVec.clone(),
    });

    this.brepSelectedEdgeMat = new LineMaterial({
      color: 0x00f0ff,
      linewidth: 2.8,
      worldUnits: false,
      transparent: true,
      opacity: 1.0,
      depthTest: false,
      depthWrite: false,
      resolution: resVec.clone(),
    });

    // Shaders Laser & Raio-X da "Gênese CALDRA" (Camada 1)
    this.genesisVisibleLaserMat = createGenesisLaserEdgesMaterial({ isXRay: false });
    this.genesisXRayLaserMat = createGenesisLaserEdgesMaterial({ isXRay: true });
    this.genesisXRayLaserMat.depthTest = true;
    this.genesisXRayLaserMat.depthFunc = THREE.GreaterDepth;

    // Detecção de Software WebGL (SwiftShader / llvmpipe) para cadenciamento seguro de quadros
    try {
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const unmasked = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
      this.isSoftwareGl = /SwiftShader|Software|llvmpipe/i.test(unmasked);
    } catch {
      this.isSoftwareGl = false;
    }
    this.genesisBuildStartTime = performance.now();

    // 8. Raycasting e Eventos de Mouse/Touch
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line = { threshold: 3.5 };
    this.raycaster.params.Points = { threshold: 6.0 };
    this.pointer = new THREE.Vector2();

    this.bindEvents();
    if (this.onDemandRender) {
      this.requestRender();
    } else {
      this.startRenderLoop();
    }
  }

  private setupLighting(): void {
    // 1. Luz Ambiente Fria Contida (#1E293B / #263040, intensity 0.45) — preserva o tom escuro #252F3F/#263040 nas faces oblíquas
    this.hemiLight = new THREE.HemisphereLight(0x334155, 0x1e293b, 0.45);
    this.hemiLight.position.set(0, 0, 250);
    this.scene.add(this.hemiLight);

    // 2. Headlight Principal Acoplada à Câmera (offset angular (0.35, 0.45, 0.85), intensity 2.2)
    this.keyLight = new THREE.DirectionalLight(0xf8fafc, 2.2);
    this.keyLight.position.set(105, 135, 255);
    this.scene.add(this.keyLight);

    // 3. Rim Light / Contra-Luz Sutil para separação limpa da peça sobre o fundo
    this.fillLight = new THREE.DirectionalLight(0x94a3b8, 0.42);
    this.fillLight.position.set(-140, -110, 90);
    this.scene.add(this.fillLight);
  }

  /**
   * Atualiza os vetores de iluminação acoplados à câmera ativa (Headlight offset (0.35, 0.45, 0.85)
   * do Caldra-Code) para que, ao girar a peça em 3D, a luz acompanhe o observador e gere o reflexo
   * especular prata-brilhante (#CBD5E1 -> #F8FAFC) sobre a base de aço anodizado escuro (#252F3F).
   */
  private updateCameraCoupledLighting(): void {
    const viewDir = this.activeCamera.position
      .clone()
      .sub(this.controls.target)
      .normalize();
    if (viewDir.lengthSq() < 1e-6) {
      viewDir.set(0, -0.6, 0.8).normalize();
    }

    const camUp = this.activeCamera.up.clone().normalize();
    let camRight = new THREE.Vector3().crossVectors(camUp, viewDir).normalize();
    if (camRight.lengthSq() < 1e-6) {
      camRight = new THREE.Vector3(1, 0, 0);
    }
    const orthoUp = new THREE.Vector3().crossVectors(viewDir, camRight).normalize();

    // Headlight acoplada à câmera com offset angular (0.35, 0.45, 0.85) no espaço da câmera (Caldra-Code)
    const keyDir = new THREE.Vector3()
      .addScaledVector(camRight, 0.35)
      .addScaledVector(orthoUp, 0.45)
      .addScaledVector(viewDir, 0.85)
      .normalize();

    // Rim / Fill Light sutil no quadrante oposto
    const fillDir = new THREE.Vector3()
      .addScaledVector(camRight, -0.55)
      .addScaledVector(orthoUp, -0.35)
      .addScaledVector(viewDir, 0.45)
      .normalize();

    this.studioUniforms.uViewDir.value.copy(viewDir);
    this.studioUniforms.uCamRight.value.copy(camRight);
    this.studioUniforms.uCamUp.value.copy(orthoUp);
    this.studioUniforms.uKeyLightDir.value.copy(keyDir);
    this.studioUniforms.uFillLightDir.value.copy(fillDir);
    this.studioUniforms.uUpDir.value.set(0, 0, 1);

    if (this.keyLight) {
      this.keyLight.position.copy(keyDir).multiplyScalar(320);
    }
    if (this.fillLight) {
      this.fillLight.position.copy(fillDir).multiplyScalar(260);
    }
  }

  // ==========================================
  // CARREGAMENTO DA GEOMETRIA B-REP TESSELLADA
  // ==========================================

  public setShape(shape: CadTessellatedShape | null, autoFit = false): void {
    this.currentShape = shape;
    this.clearGeometry();

    if (!shape || !shape.mesh) {
      this.updateGridAndBackground();
      return;
    }

    const { mesh, edges } = shape;

    if (mesh.vertexCount > 0 && mesh.triangleCount > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(mesh.positions, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.BufferAttribute(mesh.normals, 3),
      );
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

      if (mesh.faceGroups && mesh.faceGroups.length > 0) {
        geometry.clearGroups();
        for (const fg of mesh.faceGroups) {
          geometry.addGroup(fg.startTriangle * 3, fg.triangleCount * 3, 0);
        }
      }

      const solidMesh = new THREE.Mesh(geometry, this.baseSolidMaterial);
      solidMesh.name = "solid_mesh";
      solidMesh.castShadow = true;
      solidMesh.receiveShadow = true;
      solidMesh.frustumCulled = false;
      solidMesh.renderOrder = 2;
      this.meshGroup.add(solidMesh);

      // Malha de pré-passe de profundidade (colorWrite: false) usada exclusivamente no modo ARAME
      // para ocluir e separar com precisão sub-pixel arestas frontais vs. arestas traseiras Raio-X
      const depthMesh = new THREE.Mesh(geometry, this.depthPrePassMaterial);
      depthMesh.name = "arame_depth_prepass_mesh";
      depthMesh.frustumCulled = false;
      depthMesh.renderOrder = 1;
      depthMesh.visible = this.edgeMode === "wireframe";
      this.depthPrePassMesh = depthMesh;
      this.meshGroup.add(depthMesh);
    }

    if (edges && edges.edges.length > 0) {
      const minZ = shape.bounds?.min.z ?? 0;
      const maxZ = shape.bounds?.max.z ?? 10;
      const zSpan = Math.max(0.1, maxZ - minZ);
      const zTol = zSpan * 0.08;

      for (const edge of edges.edges) {
        if (edge.pointCount < 2) continue;
        // Elimina linhas de costura internas (seam edges)
        if (edge.isSeam) continue;

        let eMinZ = Infinity;
        let eMaxZ = -Infinity;
        for (let i = 2; i < edge.points.length; i += 3) {
          const pz = edge.points[i]!;
          if (pz < eMinZ) eMinZ = pz;
          if (pz > eMaxZ) eMaxZ = pz;
        }

        const isTopEdge = eMinZ >= maxZ - zTol;
        const isBottomEdge = eMaxZ <= minZ + zTol;
        const isTangentEdge = Boolean(edge.isTangentEdge);

        // Arestas de contorno SOMB+AR: Prata-Gelo Acetinado (#CBD5E1, opacity: 0.85, 1.0px preciso)
        const mat = new THREE.LineBasicMaterial({
          color: 0xcbd5e1,
          linewidth: 1.0,
          transparent: true,
          opacity: isTangentEdge ? 0.0 : 0.85,
          depthTest: true,
          depthWrite: false,
        });

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute(
          "position",
          new THREE.BufferAttribute(edge.points, 3),
        );
        const line = new THREE.Line(lineGeo, mat);
        line.name = `edge_${edge.edgeIndex}`;
        line.frustumCulled = false;
        line.renderOrder = 3;
        line.userData = {
          edgeIndex: edge.edgeIndex,
          edgeId: edge.edgeId,
          isTangentEdge,
          edgeHierarchy: isTopEdge
            ? "top_primary"
            : isBottomEdge
              ? "bottom_visible"
              : "lateral_wall",
        };
        this.edgesGroup.add(line);
      }
    } else if (this.meshGroup.children.length > 0) {
      // Fallback automático via EdgesGeometry (thresholdAngle = 32° sem linhas verticais falsas em curvas)
      const solidMesh = this.meshGroup.children[0] as THREE.Mesh;
      if (solidMesh?.geometry) {
        const edgesGeo = new THREE.EdgesGeometry(solidMesh.geometry, 32);
        const mat = new THREE.LineBasicMaterial({
          color: 0xcbd5e1,
          linewidth: 1.0,
          transparent: true,
          opacity: 0.85,
          depthTest: true,
          depthWrite: false,
        });
        const segs = new THREE.LineSegments(edgesGeo, mat);
        segs.name = "edges_auto_32";
        segs.frustumCulled = false;
        segs.renderOrder = 3;
        this.edgesGroup.add(segs);
      }
    }

    if (mesh.positions.length > 0) {
      const maxZ = shape.bounds?.max.z ?? 10;
      const minZ = shape.bounds?.min.z ?? 0;
      const zTol = Math.max(0.05, (maxZ - minZ) * 0.08);
      const topPositions: number[] = [];
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const pz = mesh.positions[i + 2]!;
        if (pz >= maxZ - zTol) {
          topPositions.push(mesh.positions[i]!, mesh.positions[i + 1]!, pz);
        }
      }
      const vGeo = new THREE.BufferGeometry();
      vGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(
          topPositions.length >= 3 ? new Float32Array(topPositions) : mesh.positions,
          3,
        ),
      );
      const vPoints = new THREE.Points(vGeo, this.vertexMaterial);
      vPoints.name = "cad_vertices";
      vPoints.frustumCulled = false;
      this.verticesGroup.add(vPoints);
    }

    if (shape.bounds) {
      this.studioUniforms.uZMin.value = shape.bounds.min.z;
      this.studioUniforms.uZMax.value = Math.max(shape.bounds.min.z + 0.5, shape.bounds.max.z);
      const cx = 0.5 * (shape.bounds.min.x + shape.bounds.max.x);
      const cy = 0.5 * (shape.bounds.min.y + shape.bounds.max.y);
      const cz = 0.5 * (shape.bounds.min.z + shape.bounds.max.z);
      const dx = Math.max(1, shape.bounds.max.x - shape.bounds.min.x);
      const dy = Math.max(1, shape.bounds.max.y - shape.bounds.min.y);
      const dz = Math.max(1, shape.bounds.max.z - shape.bounds.min.z);
      this.studioUniforms.uPartCenter.value.set(cx, cy, cz);
      this.studioUniforms.uPartRadius.value = Math.max(20, 0.5 * Math.hypot(dx, dy, dz));
    }

    // Reconstrui as 5 camadas Gênese CALDRA caso não haja setBRepWireframeData separado
    this.rebuildGenesisWireframeObjects();

    this.updateVisibilityByEdgeMode();
    if (autoFit || (!this.hasInitialCameraPose && !this.lastCameraMatch && !this.disableOrbitControls)) {
      this.fitView(false);
    }
    this.updateGridAndBackground();
    this.requestRender();
  }

  /**
   * Renderiza a malha fantasma translúcida azul-celeste ("Ghost Preview") da transição LOFT 3D em tempo real
   * ao clicar nas seções [1] -> [2] -> [3], permitindo enxergar todas as seções internas por dentro da peça.
   */
  public setLoftPreviewShape(shape: CadTessellatedShape | null): void {
    while (this.loftPreviewGroup.children.length > 0) {
      const child = this.loftPreviewGroup.children[0]!;
      this.loftPreviewGroup.remove(child);
      if ("geometry" in child && child.geometry) {
        (child.geometry as THREE.BufferGeometry).dispose();
      }
      if ("material" in child && child.material) {
        const m = child.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    }

    if (!shape || !shape.mesh || shape.mesh.vertexCount === 0) {
      this.requestRender();
      return;
    }

    const { mesh, edges } = shape;

    if (mesh.vertexCount > 0 && mesh.triangleCount > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

      const ghostMat = new THREE.MeshPhysicalMaterial({
        color: 0x60a5fa,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.28,
        roughness: 0.22,
        metalness: 0.15,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const ghostMesh = new THREE.Mesh(geometry, ghostMat);
      ghostMesh.name = "loft_ghost_preview_mesh";
      ghostMesh.frustumCulled = false;
      ghostMesh.renderOrder = 10;
      this.loftPreviewGroup.add(ghostMesh);
    }

    if (edges && edges.edges.length > 0) {
      for (const edge of edges.edges) {
        if (edge.pointCount < 2) continue;
        const isFlowGuide = Boolean(edge.isSeam || edge.isTangentEdge);
        const lineMat = new THREE.LineBasicMaterial({
          color: isFlowGuide ? 0x93c5fd : 0x38bdf8,
          linewidth: isFlowGuide ? 1.0 : 2.2,
          transparent: true,
          opacity: isFlowGuide ? 0.45 : 0.96,
          depthTest: false,
        });
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute("position", new THREE.BufferAttribute(edge.points, 3));
        const line = new THREE.Line(lineGeo, lineMat);
        line.frustumCulled = false;
        line.renderOrder = 12;
        this.loftPreviewGroup.add(line);
      }
    }

    this.requestRender();
  }

  /**
   * Renderiza os fios do esboço 2D diretamente no plano de trabalho XY (Z = 0) da cena 3D.
   * Essencial para o Caso 4.2 (esboços abertos sem sólido fechado) e para linhas de referência.
   */
  public setSketchWireframes(wireframes: Sketch3DWireframe[], visible = true): void {
    this.currentWireframes = wireframes;
    this.clearSketchWireframes();
    this.sketchWireframeGroup.visible = visible;

    if (!visible || wireframes.length === 0) return;

    const isDark = this.currentTheme === "dark";
    for (const wf of wireframes) {
      if (wf.points.length < 2) continue;
      const pts3 = wf.points.map((p) => new THREE.Vector3(p.x, p.y, p.z ?? 0));
      if (wf.closed && pts3.length >= 3) {
        pts3.push(pts3[0]!.clone());
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts3);
      const color = wf.isConstruction
        ? isDark
          ? 0x64748b
          : 0x94a3b8
        : isDark
          ? 0x38bdf8
          : 0x0284c7;
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: wf.isConstruction ? 0.55 : 0.92,
        depthTest: true,
      });
      const line = new THREE.Line(geo, mat);
      line.name = `sketch_wf_${wf.id}`;
      line.frustumCulled = false;
      this.sketchWireframeGroup.add(line);
    }

    this.updateGridAndBackground();
    this.requestRender();
  }

  private clearSketchWireframes(): void {
    while (this.sketchWireframeGroup.children.length > 0) {
      const obj = this.sketchWireframeGroup.children[0] as THREE.Line;
      this.sketchWireframeGroup.remove(obj);
      obj.geometry?.dispose();
      if (obj.material instanceof THREE.Material) {
        obj.material.dispose();
      }
    }
  }

  private clearBRepWireframeObjects(): void {
    while (this.brepWireframeGroup.children.length > 0) {
      const obj = this.brepWireframeGroup.children[0]!;
      this.brepWireframeGroup.remove(obj);
      obj.traverse((child) => {
        if ("geometry" in child && child.geometry instanceof THREE.BufferGeometry) {
          child.geometry.dispose();
        }
        if (
          "material" in child &&
          child.material instanceof THREE.Material &&
          child.material !== this.genesisVisibleLaserMat &&
          child.material !== this.genesisXRayLaserMat &&
          child.material !== this.brepOuterContourMat &&
          child.material !== this.brepFeatureThicknessMat &&
          child.material !== this.brepInternalDetailMat &&
          child.material !== this.brepHiddenXRayMat &&
          child.material !== this.brepCenterlineAxisMat
        ) {
          child.material.dispose();
        }
      });
    }
    this.genesisPinpointsObj = null;
    this.genesisCompassGroup = null;
    this.brepLineObjects = {
      outerContour: null,
      featureThickness: null,
      internalDetail: null,
      hiddenXRay: null,
      centerlineAxis: null,
    };
  }

  private updateBRepLineResolutions(width: number, height: number, pxPerMm?: number): void {
    const safeW = Math.max(10, width);
    const safeH = Math.max(10, height);
    if (pxPerMm !== undefined && Number.isFinite(pxPerMm) && pxPerMm > 1e-4) {
      this.currentScreenScalePxPerMm = pxPerMm;
    }
    const dashScale = Math.max(0.05, Math.min(200, this.currentScreenScalePxPerMm));
    const allMats = [
      this.brepOuterContourMat,
      this.brepFeatureThicknessMat,
      this.brepInternalDetailMat,
      this.brepHiddenXRayMat,
      this.brepCenterlineAxisMat,
      this.brepSelectedEdgeMat,
    ];
    for (const m of allMats) {
      m.resolution.set(safeW, safeH);
    }
    this.brepHiddenXRayMat.dashScale = dashScale;
    this.brepCenterlineAxisMat.dashScale = dashScale;
  }

  /**
   * Constrói as 5 camadas da "Gênese CALDRA" para a peça 3D atual:
   *  - Camada 1: Linhas Laser Ultra-Finas (0.85px–1.15px) com gradiente de luminância por altura + Raio-X contínuo
   *  - Camada 2: Micro-Pontos de Luz nos Vértices Geométricos ("Genesis Vertex Pinpoints")
   *  - Camada 3: Paredes de Cristal Safira Fumê (via baseSolidMaterial uShadingMode == 2)
   *  - Camada 4: Anéis de Compasso Concêntricos (3 anéis) e Linhas de Extensão Técnica no plano base
   *  - Camada 5: Animação de construção 650ms cubic-bezier(0.16, 1, 0.3, 1) + Genesis Living Shimmer
   */
  private rebuildGenesisWireframeObjects(): void {
    this.clearBRepWireframeObjects();

    const data = this.currentBRepWireframeData;
    let visibleContours: Float32Array | null = null;
    let visibleThickness: Float32Array | null = null;
    let visibleInternal: Float32Array | null = null;
    let occludableAll: Float32Array | null = null;
    let centerlines: Float32Array | null = null;

    // 1. Extrai sempre EdgesGeometry(geometry, 35) da malha sólida tessellada (limiar 35°)
    // para ignorar a tesselação de paredes cilíndricas suaves e preservar 100% das quinas reais e bordas de topo/base
    const meshEdgeNumbers: number[] = [];
    for (const child of this.meshGroup.children) {
      const solidMesh = child as THREE.Mesh;
      if (solidMesh?.geometry) {
        const edgesGeo = new THREE.EdgesGeometry(solidMesh.geometry, 35);
        const posAttr = edgesGeo.getAttribute("position");
        if (posAttr && posAttr.array.length >= 6) {
          const arr = posAttr.array;
          for (let i = 0; i < arr.length; i++) {
            meshEdgeNumbers.push(arr[i]!);
          }
        }
        edgesGeo.dispose();
      }
    }

    const concatFloat32 = (a: Float32Array | null, extra: number[]): Float32Array | null => {
      const aLen = a ? a.length : 0;
      if (aLen === 0 && extra.length === 0) return null;
      if (extra.length === 0) return a;
      if (aLen === 0) return new Float32Array(extra);
      const out = new Float32Array(aLen + extra.length);
      out.set(a!, 0);
      out.set(extra, aLen);
      return out;
    };

    if (data && data.allOccludablePositions.length >= 6) {
      visibleContours = concatFloat32(data.outerContourPositions, meshEdgeNumbers);
      visibleThickness = data.featureThicknessPositions;
      visibleInternal = data.internalDetailPositions;
      occludableAll = concatFloat32(data.allOccludablePositions, meshEdgeNumbers);
      centerlines = data.centerlineAxisPositions;
    } else if (this.currentShape?.edges?.edges && this.currentShape.edges.edges.length > 0) {
      const segs: number[] = [...meshEdgeNumbers];
      for (const edge of this.currentShape.edges.edges) {
        if (edge.isSeam || edge.pointCount < 2) continue;
        for (let i = 0; i + 5 < edge.points.length; i += 3) {
          segs.push(
            edge.points[i]!,
            edge.points[i + 1]!,
            edge.points[i + 2]!,
            edge.points[i + 3]!,
            edge.points[i + 4]!,
            edge.points[i + 5]!,
          );
        }
      }
      if (segs.length >= 6) {
        const arr = new Float32Array(segs);
        visibleContours = arr;
        occludableAll = arr;
      }
    } else if (meshEdgeNumbers.length >= 6) {
      const arr = new Float32Array(meshEdgeNumbers);
      visibleContours = arr;
      occludableAll = arr;
    }

    if (!occludableAll || occludableAll.length < 6) {
      return;
    }

    const bounds = computeGenesisBoundsFromPositions(occludableAll);
    if (this.currentShape?.bounds) {
      bounds.minZ = Math.min(bounds.minZ, this.currentShape.bounds.min.z);
      bounds.maxZ = Math.max(bounds.maxZ, this.currentShape.bounds.max.z);
    }
    this.genesisBounds = bounds;
    this.studioUniforms.uZMin.value = bounds.minZ;
    this.studioUniforms.uZMax.value = Math.max(bounds.minZ + 0.5, bounds.maxZ);

    const buildLaserSegments = (
      positions: Float32Array | null,
      isXRay: boolean,
      name: string,
      renderOrder: number,
    ): THREE.LineSegments | null => {
      if (!positions || positions.length < 6) return null;
      const geo = createGenesisLaserEdgesGeometry(positions, bounds, isXRay);
      const mat = isXRay ? this.genesisXRayLaserMat : this.genesisVisibleLaserMat;
      const segs = new THREE.LineSegments(geo, mat);
      segs.name = name;
      segs.frustumCulled = false;
      segs.renderOrder = renderOrder;
      this.brepWireframeGroup.add(segs);
      return segs;
    };

    // Camada 1B: Arestas da Base e Arestas Ocultas / Traseiras (Raio-X Contínuo Fino 0.95px em Azul-Aço Técnico #60A5FA / #4B83C3 @ 0.45)
    this.brepLineObjects.hiddenXRay = buildLaserSegments(
      occludableAll,
      true,
      "genesis_arame_hidden_xray",
      4,
    );

    // Camada 1A: Arestas Superiores / Frontais Visíveis (1.1px CSS, NormalBlending)
    this.brepLineObjects.internalDetail = buildLaserSegments(
      visibleInternal,
      false,
      "genesis_arame_internal_detail",
      5,
    );
    this.brepLineObjects.featureThickness = buildLaserSegments(
      visibleThickness,
      false,
      "genesis_arame_feature_thickness",
      6,
    );
    this.brepLineObjects.outerContour = buildLaserSegments(
      visibleContours,
      false,
      "genesis_arame_outer_contour",
      7,
    );

    // Camada 2: Micro-Pontos Discretos nos Vértices de Quina Real (1.5px, opacity: 0.35, NormalBlending)
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const pinpointData = extractGenesisVertexPinpoints3D(occludableAll, bounds);
    if (pinpointData.count > 0) {
      const pinpoints = createGenesisVertexPinpointsObject(pinpointData, dpr);
      pinpoints.name = "genesis_arame_vertex_pinpoints";
      this.genesisPinpointsObj = pinpoints;
      this.brepWireframeGroup.add(pinpoints);
    }

    // Eixos/Centros de Furos e Cilindros (NormalBlending, sem anéis de compasso no piso do CAD 3D)
    if (centerlines && centerlines.length >= 6) {
      const axisGroup = new THREE.Group();
      axisGroup.name = "genesis-centerlines-group";
      const clGeo = new THREE.BufferGeometry();
      clGeo.setAttribute("position", new THREE.BufferAttribute(centerlines, 3));
      const clMat = new THREE.LineBasicMaterial({
        color: 0x60a5fa,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
      });
      const clLines = new THREE.LineSegments(clGeo, clMat);
      clLines.name = "genesis_arame_centerlines";
      clLines.userData.baseOpacity = 0.35;
      clLines.renderOrder = 3;
      axisGroup.add(clLines);
      this.genesisCompassGroup = axisGroup;
      this.brepLineObjects.centerlineAxis = axisGroup;
      this.brepWireframeGroup.add(axisGroup);
    } else {
      this.genesisCompassGroup = null;
      this.brepLineObjects.centerlineAxis = null;
    }

    this.updateGenesisAnimationUniforms(performance.now());
  }

  public setBRepWireframeData(data: BRepTechnicalWireframeData3D | null): void {
    const hadDataBefore = Boolean(this.currentBRepWireframeData);
    this.currentBRepWireframeData = data;
    if (!hadDataBefore && data) {
      this.genesisBuildStartTime = performance.now();
    }
    this.rebuildGenesisWireframeObjects();
    this.updateVisibilityByEdgeMode();
    this.requestRender();
  }

  public setBRepWireframeLayerConfig(config: BRepWireframeLayerConfig): void {
    this.brepWireframeLayers = { ...config };
    this.updateVisibilityByEdgeMode();
    this.requestRender();
  }

  private clearGeometry(): void {
    this.depthPrePassMesh = null;
    while (this.meshGroup.children.length > 0) {
      const obj = this.meshGroup.children[0] as THREE.Mesh;
      this.meshGroup.remove(obj);
      obj.geometry.dispose();
    }

    while (this.edgesGroup.children.length > 0) {
      const obj = this.edgesGroup.children[0] as THREE.Line;
      this.edgesGroup.remove(obj);
      obj.geometry.dispose();
      if (obj.material instanceof THREE.Material) {
        obj.material.dispose();
      }
    }

    while (this.verticesGroup.children.length > 0) {
      const obj = this.verticesGroup.children[0] as THREE.Points;
      this.verticesGroup.remove(obj);
      obj.geometry.dispose();
    }

    this.clearSelectionOverlay();
    this.clearMeasurementOverlay();
  }

  private clearSelectionOverlay(): void {
    while (this.selectionOverlayGroup.children.length > 0) {
      const obj = this.selectionOverlayGroup.children[0] as THREE.Mesh;
      this.selectionOverlayGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (
        obj.material instanceof THREE.Material &&
        obj.material !== this.primaryFaceMaterial &&
        obj.material !== this.secondaryFaceMaterial &&
        obj.material !== this.primaryEdgeMaterial &&
        obj.material !== this.secondaryEdgeMaterial &&
        obj.material !== this.brepSelectedEdgeMat
      ) {
        obj.material.dispose();
      }
    }
  }

  private clearMeasurementOverlay(): void {
    while (this.measurementGroup.children.length > 0) {
      const obj = this.measurementGroup.children[0] as THREE.Object3D;
      this.measurementGroup.remove(obj);
      if ("geometry" in obj && obj.geometry instanceof THREE.BufferGeometry) {
        obj.geometry.dispose();
      }
      if (
        "material" in obj &&
        obj.material instanceof THREE.Material &&
        obj.material !== this.dimensionLineMaterial
      ) {
        obj.material.dispose();
      }
    }
  }

  // ==========================================
  // MODOS DE APARÊNCIA CALDRA (SÓLIDO, SOMB, ARAME)
  // ==========================================

  public setEdgeMode(mode: EdgeMode): void {
    const prevMode = this.edgeMode;
    this.edgeMode = mode;
    if (mode === "wireframe" && prevMode !== "wireframe") {
      // Dispara a animação de construção "Gênese" (650ms, cubic-bezier(0.16, 1, 0.3, 1))
      this.genesisBuildStartTime = performance.now();
    }
    this.updateVisibilityByEdgeMode();
    this.requestRender();
  }

  /**
   * Atualiza os uniforms de animação da "Gênese CALDRA" (construção 650ms + Genesis Living Shimmer).
   */
  private updateGenesisAnimationUniforms(nowMs: number): void {
    if (this.edgeMode !== "wireframe") return;
    const elapsed = Math.max(0, nowMs - this.genesisBuildStartTime);
    const phase = computeGenesisConstructionProgress(elapsed, GENESIS_CONSTRUCTION_DURATION_MS);
    const timeSec = (nowMs * 0.001) % 3600;

    this.genesisVisibleLaserMat.uniforms.uTime!.value = timeSec;
    this.genesisVisibleLaserMat.uniforms.uBuildProgress!.value = phase.edgesProgress;

    this.genesisXRayLaserMat.uniforms.uTime!.value = timeSec;
    this.genesisXRayLaserMat.uniforms.uBuildProgress!.value = phase.edgesProgress;

    this.studioUniforms.uGenesisBuildProgress.value = phase.glassProgress;

    if (this.genesisPinpointsObj) {
      this.genesisPinpointsObj.material.uniforms.uTime!.value = timeSec;
      this.genesisPinpointsObj.material.uniforms.uBuildProgress!.value = phase.pinpointsProgress;
    }

    if (this.genesisCompassGroup && this.genesisBounds) {
      const cx = this.genesisBounds.centerX;
      const cy = this.genesisBounds.centerY;
      const scale = 0.78 + 0.22 * phase.ringsProgress;
      this.genesisCompassGroup.position.set(cx * (1 - scale), cy * (1 - scale), 0);
      this.genesisCompassGroup.scale.set(scale, scale, 1);

      const shimmer = computeGenesisShimmerFactor(timeSec, 0.4);
      for (const child of this.genesisCompassGroup.children) {
        if ("material" in child && child.material instanceof THREE.LineBasicMaterial) {
          const baseOp = typeof child.userData.baseOpacity === "number" ? child.userData.baseOpacity : 0.08;
          child.material.opacity = baseOp * phase.ringsProgress * (0.82 + 0.18 * shimmer);
        }
      }
    }
  }

  private scheduleGenesisShimmerTick(): void {
    if (this.isDestroyed || this.isPaused || this.edgeMode !== "wireframe") return;
    if (!this.onDemandRender) return;
    if (this.genesisShimmerTimerId !== null) return;

    const elapsed = performance.now() - this.genesisBuildStartTime;
    const isBuilding = elapsed < GENESIS_CONSTRUCTION_DURATION_MS + 80;
    // Em Software WebGL (headless Chromium), cadencia suavemente após o draw para nunca bloquear a thread principal
    const delayMs = this.isSoftwareGl ? (isBuilding ? 45 : 90) : isBuilding ? 16 : 33;

    this.genesisShimmerTimerId = setTimeout(() => {
      this.genesisShimmerTimerId = null;
      if (this.isDestroyed || this.isPaused || this.edgeMode !== "wireframe") return;
      this.requestRender();
    }, delayMs);
  }

  private updateVisibilityByEdgeMode(): void {
    const isDark = this.currentTheme === "dark";

    if (this.edgeMode !== "wireframe" && this.genesisShimmerTimerId !== null) {
      clearTimeout(this.genesisShimmerTimerId);
      this.genesisShimmerTimerId = null;
    }

    switch (this.edgeMode) {
      case "shaded": {
        // 1º MODO: "SOMB" DO CALDRA-CODE (Sombreado Metálico Puro sem arestas sobrepostas:
        // Base Aço Anodizado #252F3F/#283244 + Reflexo Especular Prata-Brilhante #CBD5E1 -> #F8FAFC)
        this.meshGroup.visible = true;
        if (this.depthPrePassMesh) this.depthPrePassMesh.visible = false;
        this.brepWireframeGroup.visible = false;
        this.studioUniforms.uShadingMode.value = 0;
        this.studioUniforms.uOpacity.value = 1.0;
        this.baseSolidMaterial.transparent = false;
        this.baseSolidMaterial.depthWrite = true;
        this.baseSolidMaterial.polygonOffsetFactor = 1.5;
        this.baseSolidMaterial.polygonOffsetUnits = 1.5;
        this.primaryFaceMaterial.transparent = false;
        this.primaryFaceMaterial.opacity = 1.0;

        this.edgesGroup.visible = false;
        this.verticesGroup.visible = this.selectionType === "vertex";
        break;
      }

      case "shaded-edges": {
        // 2º MODO: "SOMB+AR" DO CALDRA-CODE (Mesmo corpo metálico escuro com reflexo especular prata
        // + arestas reais de contorno finas 1.0px em Prata-Gelo Acetinado #CBD5E1 @ 0.85, sem emendas falsas)
        this.meshGroup.visible = true;
        if (this.depthPrePassMesh) this.depthPrePassMesh.visible = false;
        this.brepWireframeGroup.visible = false;
        this.studioUniforms.uShadingMode.value = 1;
        this.studioUniforms.uOpacity.value = 1.0;
        this.baseSolidMaterial.transparent = false;
        this.baseSolidMaterial.depthWrite = true;
        this.baseSolidMaterial.polygonOffsetFactor = 1.5;
        this.baseSolidMaterial.polygonOffsetUnits = 1.5;
        this.primaryFaceMaterial.transparent = false;
        this.primaryFaceMaterial.opacity = 1.0;

        this.edgesGroup.visible = true;
        for (const child of this.edgesGroup.children) {
          const line = child as THREE.Line;
          const isTangent = Boolean(line.userData?.isTangentEdge);
          line.visible = !isTangent;
          if (!isTangent && line.material instanceof THREE.LineBasicMaterial) {
            // Arestas SOMB+AR sempre em Prata-Gelo Acetinado (#CBD5E1, opacity: 0.85) sobre o aço escuro
            line.material.color.setHex(0xcbd5e1);
            line.material.opacity = 0.85;
            line.material.linewidth = 1.0;
          }
        }
        this.verticesGroup.visible = this.selectionType === "vertex";
        break;
      }

      case "wireframe": {
        // MODO "ARAME 3D — GÊNESE CALDRA" (5 Camadas: Laser Gradient Edges + Vertex Pinpoints + Sapphire Crystal Walls + Base Compass Rings + Living Shimmer)
        this.meshGroup.visible = true;
        if (this.depthPrePassMesh) this.depthPrePassMesh.visible = true;

        this.studioUniforms.uShadingMode.value = 2;
        this.studioUniforms.uWireframeColor.value.setHex(0x1e3a5f);
        this.studioUniforms.uOpacity.value = 0.16;
        this.baseSolidMaterial.transparent = true;
        this.baseSolidMaterial.depthWrite = false;
        this.baseSolidMaterial.polygonOffsetFactor = 1.5;
        this.baseSolidMaterial.polygonOffsetUnits = 1.5;

        this.primaryFaceMaterial.transparent = true;
        this.primaryFaceMaterial.opacity = 0.34;

        if (this.brepWireframeGroup.children.length === 0 && (this.currentShape || this.currentBRepWireframeData)) {
          this.rebuildGenesisWireframeObjects();
        }

        const hasGenesisWireframe = this.brepWireframeGroup.children.length > 0;
        if (hasGenesisWireframe) {
          this.edgesGroup.visible = false;
          this.brepWireframeGroup.visible = true;
          if (this.brepLineObjects.outerContour) {
            this.brepLineObjects.outerContour.visible = this.brepWireframeLayers.showContours;
          }
          if (this.brepLineObjects.featureThickness) {
            this.brepLineObjects.featureThickness.visible = this.brepWireframeLayers.showContours;
          }
          if (this.brepLineObjects.internalDetail) {
            this.brepLineObjects.internalDetail.visible = this.brepWireframeLayers.showContours;
          }
          if (this.brepLineObjects.hiddenXRay) {
            this.brepLineObjects.hiddenXRay.visible = this.brepWireframeLayers.showHiddenXRay;
          }
          if (this.brepLineObjects.centerlineAxis) {
            this.brepLineObjects.centerlineAxis.visible = this.brepWireframeLayers.showAxesCenters;
          }
          if (this.genesisPinpointsObj) {
            this.genesisPinpointsObj.visible = this.brepWireframeLayers.showContours;
          }
        } else {
          this.brepWireframeGroup.visible = false;
          this.edgesGroup.visible = true;
          for (const child of this.edgesGroup.children) {
            const line = child as THREE.Line;
            line.visible = true;
            if (line.material instanceof THREE.LineBasicMaterial) {
              line.material.color.setHex(0xbae6fd);
              line.material.opacity = 0.88;
              line.material.linewidth = 1.0;
            }
          }
        }

        this.updateGenesisAnimationUniforms(performance.now());
        this.verticesGroup.visible = this.selectionType === "vertex";
        this.vertexMaterial.color.setHex(0xf8fafc);
        this.vertexMaterial.size = 4.0;
        break;
      }
    }
  }

  public setSelectionType(type: CadSelectionType): void {
    this.selectionType = type;
    this.updateVisibilityByEdgeMode();
  }

  // ==========================================
  // SELEÇÃO TOPOLÓGICA E MEDIÇÃO 3D (FASE 04)
  // ==========================================

  public selectEntity(entity: CadSelectedEntity | null, append = false): void {
    if (!entity) {
      this.multiSelection = [];
      this.clearSelectionOverlay();
      this.clearMeasurementOverlay();
      this.onSelectCallback?.(null, []);
      this.onMeasureCallback?.(null);
      return;
    }

    if (!append) {
      this.multiSelection = [entity];
    } else {
      const existingIdx = this.multiSelection.findIndex((e) => e.id === entity.id);
      if (existingIdx >= 0) {
        this.multiSelection.splice(existingIdx, 1);
      } else {
        if (this.multiSelection.length >= 2) {
          this.multiSelection = [this.multiSelection[1]!, entity];
        } else {
          this.multiSelection.push(entity);
        }
      }
    }

    this.renderSelectionAndMeasurements();
    const primary = this.multiSelection[0] ?? null;
    this.onSelectCallback?.(primary, this.multiSelection);
  }

  public clearSelection(): void {
    this.selectEntity(null);
  }

  private renderSelectionAndMeasurements(): void {
    this.clearSelectionOverlay();
    this.clearMeasurementOverlay();
    if (!this.currentShape || this.multiSelection.length === 0) return;

    for (let i = 0; i < this.multiSelection.length; i++) {
      const entity = this.multiSelection[i]!;
      const isPrimary = i === 0;
      const faceMat = isPrimary ? this.primaryFaceMaterial : this.secondaryFaceMaterial;
      const edgeMat = isPrimary ? this.primaryEdgeMaterial : this.secondaryEdgeMaterial;

      if (entity.type === "face") {
        const fg = this.currentShape.mesh.faceGroups[entity.index];
        if (fg) {
          const totalIndices = fg.triangleCount * 3;
          const subIndices = new Uint32Array(totalIndices);
          for (let j = 0; j < totalIndices; j++) {
            subIndices[j] = this.currentShape.mesh.indices[fg.startTriangle * 3 + j]!;
          }

          const faceGeo = new THREE.BufferGeometry();
          faceGeo.setAttribute(
            "position",
            new THREE.BufferAttribute(this.currentShape.mesh.positions, 3),
          );
          faceGeo.setAttribute(
            "normal",
            new THREE.BufferAttribute(this.currentShape.mesh.normals, 3),
          );
          faceGeo.setIndex(new THREE.BufferAttribute(subIndices, 1));

          const overlay = new THREE.Mesh(faceGeo, faceMat);
          overlay.frustumCulled = false;
          this.selectionOverlayGroup.add(overlay);
        }
      } else if (entity.type === "edge") {
        const edge = this.currentShape.edges.edges[entity.index];
        if (edge && edge.points.length >= 6) {
          const segPairs: number[] = [];
          for (let k = 0; k < edge.points.length - 3; k += 3) {
            segPairs.push(
              edge.points[k]!,
              edge.points[k + 1]!,
              edge.points[k + 2]!,
              edge.points[k + 3]!,
              edge.points[k + 4]!,
              edge.points[k + 5]!,
            );
          }
          if (segPairs.length >= 6) {
            const fatGeo = new LineSegmentsGeometry();
            fatGeo.setPositions(new Float32Array(segPairs));
            const fatLine = new LineSegments2(
              fatGeo,
              isPrimary ? this.brepSelectedEdgeMat : this.secondaryEdgeMaterial as unknown as LineMaterial,
            );
            if (!isPrimary) {
              const edgeGeo = new THREE.BufferGeometry();
              edgeGeo.setAttribute("position", new THREE.BufferAttribute(edge.points, 3));
              const line = new THREE.Line(edgeGeo, edgeMat);
              line.frustumCulled = false;
              this.selectionOverlayGroup.add(line);
              fatGeo.dispose();
            } else {
              fatLine.frustumCulled = false;
              fatLine.renderOrder = 15;
              this.selectionOverlayGroup.add(fatLine);
            }
          }
        }
      } else if (entity.type === "vertex") {
        if (entity.point) {
          const sphereGeo = new THREE.SphereGeometry(2, 16, 16);
          const sphere = new THREE.Mesh(
            sphereGeo,
            new THREE.MeshBasicMaterial({ color: isPrimary ? 0x0284c7 : 0xf59e0b }),
          );
          sphere.frustumCulled = false;
          sphere.position.set(entity.point.x, entity.point.y, entity.point.z);
          this.selectionOverlayGroup.add(sphere);
        }
      }
    }

    if (this.multiSelection.length === 2) {
      const eA = this.multiSelection[0]!;
      const eB = this.multiSelection[1]!;

      const pA = this.getEntityRepresentativePoint(eA);
      const pB = this.getEntityRepresentativePoint(eB);

      if (pA && pB) {
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const dz = pB.z - pA.z;
        const dist = Math.hypot(dx, dy, dz);

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute(
          "position",
          new THREE.Float32BufferAttribute([pA.x, pA.y, pA.z, pB.x, pB.y, pB.z], 3),
        );
        const dimLine = new THREE.Line(lineGeo, this.dimensionLineMaterial);
        dimLine.computeLineDistances();
        this.measurementGroup.add(dimLine);

        const sphereGeo = new THREE.SphereGeometry(1.5, 12, 12);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

        const markerA = new THREE.Mesh(sphereGeo, sphereMat);
        markerA.position.set(pA.x, pA.y, pA.z);
        this.measurementGroup.add(markerA);

        const markerB = new THREE.Mesh(sphereGeo, sphereMat);
        markerB.position.set(pB.x, pB.y, pB.z);
        this.measurementGroup.add(markerB);

        const measurement: CadMeasurementResult = {
          distance: dist,
          deltaX: Math.abs(dx),
          deltaY: Math.abs(dy),
          deltaZ: Math.abs(dz),
          entityA: eA,
          entityB: eB,
          type: `${eA.type}-${eB.type}` as CadMeasurementResult["type"],
        };

        this.onMeasureCallback?.(measurement);
      }
    } else {
      this.onMeasureCallback?.(null);
    }

    // Atualiza posição do Gizmo CAD com base na entidade selecionada
    this.updateGizmoPosition();
  }

  // ==========================================
  // GIZMO CAD INTERATIVO (FASE 06)
  // ==========================================

  private setupGizmo(): void {
    try {
      this.transformControls = new TransformControls(this.activeCamera, this.renderer.domElement);
      this.transformControls.size = 0.75;
      this.transformControls.space = "world";

      const targetGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const targetMat = new THREE.MeshBasicMaterial({ visible: false });
      this.gizmoTargetMesh = new THREE.Mesh(targetGeo, targetMat);
      this.scene.add(this.gizmoTargetMesh);

      this.transformControls.attach(this.gizmoTargetMesh);
      this.transformControls.visible = false;
      this.transformControls.enabled = false;

      const helper =
        typeof this.transformControls.getHelper === "function"
          ? this.transformControls.getHelper()
          : (this.transformControls as unknown as THREE.Object3D);
      helper.visible = false;
      this.scene.add(helper);

      this.transformControls.addEventListener("dragging-changed", (event: { value: boolean }) => {
        this.controls.enabled = !event.value;
        if (event.value) {
          if (this.gizmoTargetMesh) {
            this.gizmoInitialPos.copy(this.gizmoTargetMesh.position);
          }
        } else {
          if (this.gizmoTargetMesh) {
            const delta = {
              x: this.gizmoTargetMesh.position.x - this.gizmoInitialPos.x,
              y: this.gizmoTargetMesh.position.y - this.gizmoInitialPos.y,
              z: this.gizmoTargetMesh.position.z - this.gizmoInitialPos.z,
            };
            if (Math.hypot(delta.x, delta.y, delta.z) > 0.05) {
              const primary = this.multiSelection[0] ?? null;
              this.onGizmoCommitCallback?.(delta, primary);
            }
            this.updateGizmoPosition();
          }
        }
      });

      this.transformControls.addEventListener("change", () => {
        if (this.gizmoTargetMesh && !this.controls.enabled) {
          const delta = {
            x: this.gizmoTargetMesh.position.x - this.gizmoInitialPos.x,
            y: this.gizmoTargetMesh.position.y - this.gizmoInitialPos.y,
            z: this.gizmoTargetMesh.position.z - this.gizmoInitialPos.z,
          };
          this.onGizmoChangeCallback?.(delta);
        }
      });
    } catch (err) {
      console.warn("[ThreeBRepRenderer] Inicialização do Gizmo diferida:", err);
    }
  }

  private setTransformHelperVisible(vis: boolean): void {
    if (!this.transformControls) return;
    this.transformControls.visible = vis;
    const helper =
      typeof this.transformControls.getHelper === "function"
        ? this.transformControls.getHelper()
        : (this.transformControls as unknown as THREE.Object3D);
    if (helper) helper.visible = vis;
  }

  public updateGizmoPosition(): void {
    if (!this.transformControls || !this.gizmoTargetMesh) return;

    if (this.gizmoMode === "off" || this.multiSelection.length === 0) {
      this.setTransformHelperVisible(false);
      this.transformControls.enabled = false;
      return;
    }

    const primary = this.multiSelection[0]!;
    const pt = this.getEntityRepresentativePoint(primary);
    if (pt) {
      this.gizmoTargetMesh.position.copy(pt);
      this.gizmoInitialPos.copy(pt);
      this.setTransformHelperVisible(true);
      this.transformControls.enabled = true;
    } else {
      this.setTransformHelperVisible(false);
      this.transformControls.enabled = false;
    }
  }

  public setGizmoMode(mode: CadGizmoMode): void {
    this.gizmoMode = mode;
    if (!this.transformControls) return;

    if (mode === "off") {
      this.setTransformHelperVisible(false);
      this.transformControls.enabled = false;
    } else {
      this.transformControls.setMode(mode);
      this.updateGizmoPosition();
    }
  }

  public setGizmoSnap(translationSnap: number | null, rotationSnap: number | null): void {
    if (!this.transformControls) return;
    this.transformControls.setTranslationSnap(translationSnap);
    this.transformControls.setRotationSnap(rotationSnap);
  }

  private getEntityRepresentativePoint(entity: CadSelectedEntity): THREE.Vector3 | null {
    if (entity.point) {
      return new THREE.Vector3(entity.point.x, entity.point.y, entity.point.z);
    }

    if (entity.type === "face" && this.currentShape) {
      const fg = this.currentShape.mesh.faceGroups[entity.index];
      if (fg) {
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let count = 0;
        const start = fg.startTriangle * 3;
        const end = start + fg.triangleCount * 3;
        for (let i = start; i < end; i++) {
          const vIdx = this.currentShape.mesh.indices[i]!;
          sx += this.currentShape.mesh.positions[vIdx * 3]!;
          sy += this.currentShape.mesh.positions[vIdx * 3 + 1]!;
          sz += this.currentShape.mesh.positions[vIdx * 3 + 2]!;
          count++;
        }
        if (count > 0) {
          return new THREE.Vector3(sx / count, sy / count, sz / count);
        }
      }
    } else if (entity.type === "edge" && this.currentShape) {
      const edge = this.currentShape.edges.edges[entity.index];
      if (edge && edge.points.length >= 3) {
        const midIdx = Math.floor(edge.pointCount / 2) * 3;
        return new THREE.Vector3(
          edge.points[midIdx]!,
          edge.points[midIdx + 1]!,
          edge.points[midIdx + 2]!,
        );
      }
    }

    return null;
  }

  // ==========================================
  // NAVEGAÇÃO E VISTAS CANÔNICAS (ISO, FR, LAT, SUP)
  // ==========================================

  public setView(view: ViewPresetId, animate = true): void {
    let dir: [number, number, number] = [0.45, -0.72, 0.82];
    let up: [number, number, number] = [0, 1, 0];

    switch (view) {
      case "top":
        // Vista Superior (SUP) 100% alinhada ao plano XY do Esboço 2D (+X direita, +Y cima, olhando -Z)
        dir = [0, 0, 1];
        up = [0, 1, 0];
        break;
      case "bottom":
        dir = [0, 0, -1];
        up = [0, -1, 0];
        break;
      case "front":
        dir = [0, -1, 0.001];
        up = [0, 0, 1];
        break;
      case "back":
        dir = [0, 1, 0.001];
        up = [0, 0, 1];
        break;
      case "side":
      case "right":
        dir = [1, 0, 0.001];
        up = [0, 0, 1];
        break;
      case "left":
        dir = [-1, 0, 0.001];
        up = [0, 0, 1];
        break;
      case "iso":
      default: {
        const basis = computeOrbitalBasisZUp((35 * Math.PI) / 180, (-32 * Math.PI) / 180);
        dir = [basis.offsetDir.x, basis.offsetDir.y, basis.offsetDir.z];
        up = [basis.up.x, basis.up.y, basis.up.z];
        break;
      }
    }

    this.fitView(animate, dir, up);
  }

  public setViewPreset(view: ViewPresetId, animate = true): void {
    this.setView(view, animate);
  }

  public setOrbitModeActive(active: boolean): void {
    this.orbitModeActive = active;
    if (this.renderer.domElement) {
      this.renderer.domElement.style.cursor = active ? "grab" : "";
    }
  }

  public getOrbitAngles(): { azimuthDeg: number; elevationDeg: number } {
    const offset = this.activeCamera.position.clone().sub(this.controls.target);
    const radius = Math.max(offset.length(), 1e-6);
    const sinEl = Math.max(-1, Math.min(1, offset.z / radius));
    const elevationDeg = (Math.asin(sinEl) * 180) / Math.PI;
    const horizLen = Math.hypot(offset.x, offset.y);
    let azimuthDeg = 0;
    if (horizLen > 1e-3) {
      azimuthDeg = (((Math.atan2(offset.x, -offset.y) * 180) / Math.PI) + 360) % 360;
    } else {
      const sign = sinEl >= 0 ? 1 : -1;
      azimuthDeg =
        (((Math.atan2(-this.activeCamera.up.x * sign, this.activeCamera.up.y * sign) * 180) /
          Math.PI) +
          360) %
        360;
    }
    return { azimuthDeg, elevationDeg };
  }

  public setOrbitAngles(
    azimuthDeg: number,
    elevationDeg: number,
    pivot?: { x: number; y: number; z: number } | null,
    animate = true,
    durationMs = 350,
  ): void {
    const alpha = (azimuthDeg * Math.PI) / 180;
    const beta = (Math.max(-90, Math.min(90, elevationDeg)) * Math.PI) / 180;

    const sinA = Math.sin(alpha);
    const cosA = Math.cos(alpha);
    const sinB = Math.sin(beta);
    const cosB = Math.cos(beta);

    const dir: [number, number, number] = [-sinA * cosB, -cosA * cosB, sinB];
    const up: [number, number, number] = [sinA * sinB, cosA * sinB, cosB];

    const currentOffset = this.camera.position.clone().sub(this.controls.target);
    let distance = currentOffset.length();
    if (!Number.isFinite(distance) || distance < 25) {
      const box = new THREE.Box3();
      if (this.currentShape?.bounds) {
        const b = this.currentShape.bounds;
        box.min.set(b.min.x, b.min.y, b.min.z);
        box.max.set(b.max.x, b.max.y, b.max.z);
      } else {
        box.setFromObject(this.rootGroup);
      }
      if (box.isEmpty()) {
        box.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 10));
      }
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(sphere.radius, 15);
      const fovRad = (this.camera.fov * Math.PI) / 360;
      distance = (radius / Math.sin(fovRad)) * 1.12;
    }

    const targetCenter =
      pivot && Number.isFinite(pivot.x) && Number.isFinite(pivot.y)
        ? new THREE.Vector3(pivot.x, pivot.y, Number.isFinite(pivot.z) ? pivot.z : 0)
        : this.controls.target.clone();

    const directionVec = new THREE.Vector3(...dir).normalize();
    const targetUpVec = new THREE.Vector3(...up).normalize();
    const targetCameraPos = targetCenter.clone().add(directionVec.multiplyScalar(distance));
    this.hasInitialCameraPose = true;

    if (animate) {
      this.cameraAnimation = {
        fromPos: this.camera.position.clone(),
        toPos: targetCameraPos,
        fromTarget: this.controls.target.clone(),
        toTarget: targetCenter,
        fromUp: this.camera.up.clone(),
        toUp: targetUpVec,
        startTime: performance.now(),
        duration: Math.max(60, durationMs),
      };
      this.requestRender();
    } else {
      this.cameraAnimation = null;
      this.camera.position.copy(targetCameraPos);
      this.orthoCamera.position.copy(targetCameraPos);
      this.camera.up.copy(targetUpVec);
      this.orthoCamera.up.copy(targetUpVec);
      this.controls.target.copy(targetCenter);
      this.controls.update();
      this.requestRender();
    }
  }

  /**
   * Sincroniza 1:1 a câmera 3D do ThreeBRepRenderer com o viewport do 2D SKETCH
   * (pan tx/ty, zoom k, dimensões W/H, ângulos orbitais θ/φ e pivô inteligente 2D).
   */
  public syncWith2DViewport(params: {
    view2D: { tx: number; ty: number; k: number };
    viewportWidth: number;
    viewportHeight: number;
    azimuthDeg: number;
    elevationDeg: number;
    pivot2D: { x: number; y: number; z: number };
  }): void {
    const W = Math.max(10, params.viewportWidth || this.container.clientWidth || 800);
    const H = Math.max(10, params.viewportHeight || this.container.clientHeight || 600);
    const safeK =
      Number.isFinite(params.view2D.k) && params.view2D.k > 1e-4 ? params.view2D.k : 1;
    const safeTx = Number.isFinite(params.view2D.tx) ? params.view2D.tx : W * 0.5;
    const safeTy = Number.isFinite(params.view2D.ty) ? params.view2D.ty : H * 0.5;

    if (
      Math.abs(this.camera.aspect - W / H) > 1e-3 ||
      this.renderer.domElement.clientWidth !== W ||
      this.renderer.domElement.clientHeight !== H
    ) {
      this.camera.aspect = W / H;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(W, H, false);
    }
    this.updateBRepLineResolutions(W, H, safeK);

    const alpha = (params.azimuthDeg * Math.PI) / 180;
    const beta = (Math.max(-90, Math.min(90, params.elevationDeg)) * Math.PI) / 180;
    const cosA = Math.cos(alpha);
    const sinA = Math.sin(alpha);
    const cosB = Math.cos(beta);
    const sinB = Math.sin(beta);

    // Base ortonormal Z-up idêntica ao controlador orbital do 2D SKETCH e ao Gizmo 3D:
    // +X_3D = +x_2D, +Y_3D = -y_2D, +Z_3D = espessura da chapa
    const rightVec = new THREE.Vector3(cosA, -sinA, 0).normalize();
    const upVec = new THREE.Vector3(sinA * sinB, cosA * sinB, cosB).normalize();
    const outDirVec = new THREE.Vector3(-sinA * cosB, -cosA * cosB, sinB).normalize();

    const px = Number.isFinite(params.pivot2D.x) ? params.pivot2D.x : 0;
    const py = Number.isFinite(params.pivot2D.y) ? params.pivot2D.y : 0;
    const pz = Number.isFinite(params.pivot2D.z) ? params.pivot2D.z : 0;

    // No mundo 3D do ThreeBRepRenderer, Y = -y_2D
    const pivot3D = new THREE.Vector3(px, -py, pz);

    // Posição do pivô na tela 2D (em pixels):
    const pivotScreenX = safeTx + px * safeK;
    const pivotScreenY = safeTy + py * safeK;

    // Deslocamento do centro da viewport (W/2, H/2) em relação ao pivô na tela, convertido para mm:
    const panMmRight = (W * 0.5 - pivotScreenX) / safeK;
    const panMmUp = -(H * 0.5 - pivotScreenY) / safeK;

    const target3D = pivot3D
      .clone()
      .addScaledVector(rightVec, panMmRight)
      .addScaledVector(upVec, panMmUp);

    const visibleHeightMm = Math.max(0.25, H / safeK);
    const visibleWidthMm = Math.max(0.25, W / safeK);
    const fovRad = (this.camera.fov * Math.PI) / 360;
    const distance = Math.max(0.5, (visibleHeightMm * 0.5) / Math.tan(fovRad));

    const camPos = target3D.clone().addScaledVector(outDirVec, distance);

    this.hasInitialCameraPose = true;
    this.cameraAnimation = null;

    this.camera.near = 0.01;
    this.camera.far = 100000;
    this.camera.position.copy(camPos);
    this.camera.up.copy(upVec);
    this.camera.lookAt(target3D);
    this.camera.updateProjectionMatrix();

    this.orthoCamera.near = -50000;
    this.orthoCamera.far = 50000;
    this.orthoCamera.position.copy(camPos);
    this.orthoCamera.up.copy(upVec);
    this.orthoCamera.left = -visibleWidthMm * 0.5;
    this.orthoCamera.right = visibleWidthMm * 0.5;
    this.orthoCamera.top = visibleHeightMm * 0.5;
    this.orthoCamera.bottom = -visibleHeightMm * 0.5;
    this.orthoCamera.zoom = 1;
    this.orthoCamera.lookAt(target3D);
    this.orthoCamera.updateProjectionMatrix();

    this.controls.target.copy(target3D);
    if (this.controls.enabled) {
      this.controls.update();
    }

    this.requestRender();
  }

  public fitToModel(animate = true): void {
    const basis = computeOrbitalBasisZUp((35 * Math.PI) / 180, (-32 * Math.PI) / 180);
    this.fitView(
      animate,
      [basis.offsetDir.x, basis.offsetDir.y, basis.offsetDir.z],
      [basis.up.x, basis.up.y, basis.up.z],
    );
  }

  public setTheme(theme: "light" | "dark"): void {
    this.currentTheme = theme;
    this.updateGridAndBackground();
    this.updateVisibilityByEdgeMode();
    this.renderImmediate();
    this.requestRender();
  }

  public updateGridAndBackground(): void {
    const isDark = this.currentTheme === "dark";
    this.scene.background = this.transparentBackground
      ? null
      : new THREE.Color(isDark ? 0x051833 : 0xf8fafc);

    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.geometry.dispose();
      if (Array.isArray(this.gridHelper.material)) {
        this.gridHelper.material.forEach((m) => m.dispose());
      } else {
        this.gridHelper.material.dispose();
      }
      this.gridHelper = null;
    }
  }

  public fitView(
    animate = true,
    dir?: [number, number, number],
    upVec?: [number, number, number],
  ): void {
    const box = new THREE.Box3();
    if (this.currentShape?.bounds) {
      const b = this.currentShape.bounds;
      box.min.set(b.min.x, b.min.y, b.min.z);
      box.max.set(b.max.x, b.max.y, b.max.z);
    } else {
      box.setFromObject(this.rootGroup);
    }

    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 10));
    }

    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 15);

    const direction = dir
      ? new THREE.Vector3(...dir).normalize()
      : this.camera.position.clone().sub(this.controls.target).normalize();

    const targetUp = upVec
      ? new THREE.Vector3(...upVec).normalize()
      : this.camera.up.clone().normalize();

    const fovRad = (this.camera.fov * Math.PI) / 360;
    const distance = (radius / Math.sin(fovRad)) * 1.12;
    const targetCameraPos = center.clone().add(direction.multiplyScalar(distance));
    this.hasInitialCameraPose = true;

    if (animate) {
      this.cameraAnimation = {
        fromPos: this.camera.position.clone(),
        toPos: targetCameraPos,
        fromTarget: this.controls.target.clone(),
        toTarget: center,
        fromUp: this.camera.up.clone(),
        toUp: targetUp,
        startTime: performance.now(),
        duration: 380,
      };
    } else {
      this.camera.position.copy(targetCameraPos);
      this.orthoCamera.position.copy(targetCameraPos);
      this.camera.up.copy(targetUp);
      this.orthoCamera.up.copy(targetUp);
      this.controls.target.copy(center);
      this.controls.update();
    }
  }

  // ==========================================
  // TRANSIÇÃO CONTÍNUA SEAMLESS 2D ↔ 3D (550ms / 500ms)
  // ==========================================

  public applyCameraPose(pose: CameraPose3D): void {
    this.hasInitialCameraPose = true;
    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.orthoCamera.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.camera.up.set(pose.up.x, pose.up.y, pose.up.z);
    this.orthoCamera.up.set(pose.up.x, pose.up.y, pose.up.z);
    this.controls.target.set(pose.target.x, pose.target.y, pose.target.z);

    const halfW = Math.max(10, pose.visibleWidthMm / 2);
    const halfH = Math.max(10, pose.visibleHeightMm / 2);
    this.orthoCamera.left = -halfW;
    this.orthoCamera.right = halfW;
    this.orthoCamera.top = halfH;
    this.orthoCamera.bottom = -halfH;
    this.orthoCamera.zoom = 1;
    this.orthoCamera.updateProjectionMatrix();

    this.controls.update();
  }

  /**
   * Posiciona a câmera 3D imediatamente no Quadro 0 (`t = 0`), em correspondência
   * óptica 1:1 com o canvas 2D (`tx, ty, k`).
   */
  public setCameraTo2DMatch(match: Camera2DTo3DMatch): void {
    this.lastCameraMatch = match;
    this.morphAnimation = null;
    this.cameraAnimation = null;
    this.applyCameraPose(match.startPose);
    this.setExtrusionMorphScale(0.01);
    this.updateGridAndBackground();
    this.updateCameraCoupledLighting();
    this.renderer.render(this.scene, this.activeCamera);
  }

  private setExtrusionMorphScale(progress3D: number): void {
    const minZ = this.currentShape?.bounds?.min.z ?? 0;
    // Se o sólido apoia-se no plano de esboço Z = 0, emerge/recolhe suavemente a espessura em Z
    if (Math.abs(minZ) < 0.6) {
      const zScale = Math.max(0.01, Math.min(1, progress3D));
      this.meshGroup.scale.set(1, 1, zScale);
      this.edgesGroup.scale.set(1, 1, zScale);
      this.brepWireframeGroup.scale.set(1, 1, zScale);
      this.verticesGroup.scale.set(1, 1, zScale);
    } else {
      this.meshGroup.scale.set(1, 1, 1);
      this.edgesGroup.scale.set(1, 1, 1);
      this.brepWireframeGroup.scale.set(1, 1, 1);
      this.verticesGroup.scale.set(1, 1, 1);
    }
  }

  public startMorphTransition(options: {
    direction: "to3d" | "to2d";
    match: Camera2DTo3DMatch;
    durationMs: number;
    startProgress3D?: number;
    onProgress?: (progress3D: number) => void;
    onComplete?: () => void;
  }): void {
    this.lastCameraMatch = options.match;
    this.cameraAnimation = null;

    const startProgress3D =
      options.startProgress3D ?? (options.direction === "to3d" ? 0 : 1);

    if (options.direction === "to3d" && startProgress3D <= 0.001) {
      this.applyCameraPose(options.match.startPose);
      this.setExtrusionMorphScale(0.01);
    }

    this.morphAnimation = {
      direction: options.direction,
      match: options.match,
      startTime: performance.now(),
      durationMs: Math.max(60, options.durationMs),
      startProgress3D,
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      fromUp: this.camera.up.clone(),
      onProgress: options.onProgress,
      onComplete: options.onComplete,
    };
  }

  public cancelMorphTransition(): void {
    this.morphAnimation = null;
    this.setExtrusionMorphScale(1);
  }

  private getCharacteristicPartRadiusMm(): number {
    if (this.currentShape?.bounds) {
      const b = this.currentShape.bounds;
      const dx = Math.max(0, b.max.x - b.min.x);
      const dy = Math.max(0, b.max.y - b.min.y);
      const dz = Math.max(0, b.max.z - b.min.z);
      return Math.max(10, 0.5 * Math.hypot(dx, dy, dz));
    }
    return 60;
  }

  public zoomIn(factor = 0.8): void {
    const sens = loadZoomSensitivityConfig().multiplier;
    const camDist = Math.max(1, this.camera.position.distanceTo(this.controls.target));
    const metrics = computeAdaptiveZoomMetrics({
      cameraDistanceMm: camDist,
      characteristicRadiusMm: this.getCharacteristicPartRadiusMm(),
      userSensitivityMultiplier: sens,
    });
    const baseDelta = 1 - factor;
    const adaptedFactor = Math.max(
      0.55,
      Math.min(0.99, 1 - baseDelta * Math.min(1.25, metrics.effectiveFactor)),
    );
    if (this.isOrtho) {
      this.orthoCamera.zoom = Math.min(this.orthoCamera.zoom / adaptedFactor, 40);
      this.orthoCamera.updateProjectionMatrix();
    } else {
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.camera.position.copy(this.controls.target.clone().add(offset.multiplyScalar(adaptedFactor)));
    }
    this.controls.update();
  }

  public zoomOut(factor = 1.25): void {
    const sens = loadZoomSensitivityConfig().multiplier;
    const camDist = Math.max(1, this.camera.position.distanceTo(this.controls.target));
    const metrics = computeAdaptiveZoomMetrics({
      cameraDistanceMm: camDist,
      characteristicRadiusMm: this.getCharacteristicPartRadiusMm(),
      userSensitivityMultiplier: sens,
    });
    const baseDelta = factor - 1;
    const adaptedFactor = Math.max(
      1.01,
      Math.min(1.85, 1 + baseDelta * Math.min(1.25, metrics.effectiveFactor)),
    );
    if (this.isOrtho) {
      this.orthoCamera.zoom = Math.max(this.orthoCamera.zoom / adaptedFactor, 0.05);
      this.orthoCamera.updateProjectionMatrix();
    } else {
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.camera.position.copy(this.controls.target.clone().add(offset.multiplyScalar(adaptedFactor)));
    }
    this.controls.update();
  }

  public panCamera(deltaX: number, deltaY: number): void {
    const sens = loadZoomSensitivityConfig().multiplier;
    const camDist = Math.max(1, this.camera.position.distanceTo(this.controls.target));
    const metrics = computeAdaptiveZoomMetrics({
      cameraDistanceMm: camDist,
      characteristicRadiusMm: this.getCharacteristicPartRadiusMm(),
      userSensitivityMultiplier: sens,
    });
    const scale = Math.min(1.15, Math.max(0.08, metrics.adaptiveFactor));
    const eye = this.activeCamera.position.clone().sub(this.controls.target);
    const right = new THREE.Vector3().crossVectors(this.activeCamera.up, eye).normalize();
    const up = new THREE.Vector3().crossVectors(eye, right).normalize();
    const panOffset = right
      .multiplyScalar(deltaX * scale)
      .add(up.multiplyScalar(deltaY * scale));
    this.camera.position.add(panOffset);
    this.orthoCamera.position.add(panOffset);
    this.controls.target.add(panOffset);
    this.controls.update();
  }

  public orbitCamera(angleH: number, angleV: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const radius = offset.length();
    let theta = Math.atan2(offset.x, offset.z);
    let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius)));
    theta += angleH;
    phi = Math.max(0.01, Math.min(Math.PI - 0.01, phi + angleV));
    offset.x = radius * Math.sin(phi) * Math.sin(theta);
    offset.y = radius * Math.cos(phi);
    offset.z = radius * Math.sin(phi) * Math.cos(theta);
    this.camera.position.copy(this.controls.target.clone().add(offset));
    this.orthoCamera.position.copy(this.camera.position);
    this.controls.update();
  }

  public setCameraProjection(isOrtho: boolean): void {
    this.isOrtho = isOrtho;
    this.activeCamera = isOrtho ? this.orthoCamera : this.camera;
    this.activeCamera.position.copy(isOrtho ? this.camera.position : this.orthoCamera.position);
    this.controls.object = this.activeCamera;
    this.controls.update();
    this.onWindowResize();
  }

  public isOrthographic(): boolean {
    return this.isOrtho;
  }

  // ==========================================
  // EVENTOS E INTERAÇÃO
  // ==========================================

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    dom.addEventListener("pointerdown", this.onPointerDown);
    dom.addEventListener("pointermove", this.onPointerMove);
    dom.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("resize", this.onWindowResize);

    if (typeof ResizeObserver !== "undefined" && this.container) {
      this.resizeObserver = new ResizeObserver(() => {
        this.onWindowResize();
      });
      this.resizeObserver.observe(this.container);
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDownTime = performance.now();
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  };

  private updatePointerCoords(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : 1;
    const h = rect.height > 0 ? rect.height : 1;
    this.pointer.x = ((e.clientX - rect.left) / w) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / h) * 2 + 1;
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.updatePointerCoords(e);

    if (!this.cameraAnimation) {
      this.raycaster.setFromCamera(this.pointer, this.activeCamera);
      const hit = this.performHitTest();
      if (hit?.id !== this.hoveredEntity?.id) {
        this.hoveredEntity = hit;
        this.onHoverCallback?.(hit);
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.orbitModeActive) return;
    const elapsed = performance.now() - this.pointerDownTime;
    const dist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y,
    );

    if (elapsed < 500 && dist < 12) {
      this.updatePointerCoords(e);
      this.raycaster.setFromCamera(this.pointer, this.activeCamera);
      const hit = this.performHitTest();
      this.selectEntity(hit, e.shiftKey);
    }
  };

  private performHitTest(): CadSelectedEntity | null {
    if (!this.currentShape) return null;

    if (this.selectionType === "face" && this.meshGroup.children.length > 0) {
      const solidMesh = this.meshGroup.children[0] as THREE.Mesh;
      const intersects = this.raycaster.intersectObject(solidMesh, false);
      if (intersects.length > 0) {
        const hit = intersects[0]!;
        const faceIndex = hit.faceIndex;
        if (faceIndex !== undefined && this.currentShape.mesh.faceGroups) {
          const fg = this.currentShape.mesh.faceGroups.find(
            (g) =>
              faceIndex >= g.startTriangle &&
              faceIndex < g.startTriangle + g.triangleCount,
          );
          if (fg) {
            return {
              id: fg.faceId,
              type: "face",
              index: fg.faceIndex,
              point: hit.point ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : undefined,
              normal: hit.face ? { x: hit.face.normal.x, y: hit.face.normal.y, z: hit.face.normal.z } : undefined,
            };
          }
        }
      }
    } else if (this.selectionType === "edge" && this.edgesGroup.children.length > 0) {
      const intersects = this.raycaster.intersectObjects(this.edgesGroup.children, false);
      if (intersects.length > 0) {
        const hit = intersects[0]!;
        const edgeIndex = hit.object.userData.edgeIndex as number;
        const edgeId = (hit.object.userData.edgeId as string) || `edge_${edgeIndex}`;
        return {
          id: edgeId,
          type: "edge",
          index: edgeIndex,
          point: hit.point ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : undefined,
        };
      }
    } else if (this.selectionType === "vertex" && this.verticesGroup.children.length > 0) {
      const intersects = this.raycaster.intersectObjects(this.verticesGroup.children, false);
      if (intersects.length > 0) {
        const hit = intersects[0]!;
        const vIndex = hit.index ?? 0;
        return {
          id: `vertex_${vIndex}`,
          type: "vertex",
          index: vIndex,
          point: hit.point ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : undefined,
        };
      }
    }

    return null;
  }

  private onWindowResize = (): void => {
    if (!this.container || this.isDestroyed) return;
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 600;
    if (width <= 0 || height <= 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const aspect = width / height;
    const d = 120;
    this.orthoCamera.left = -d * aspect;
    this.orthoCamera.right = d * aspect;
    this.orthoCamera.top = d;
    this.orthoCamera.bottom = -d;
    this.orthoCamera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.updateBRepLineResolutions(width, height);
    if (this.onDemandRender) {
      this.requestRender();
    }
  };

  // ==========================================
  // LOOP DE RENDERIZAÇÃO E ZERO-IDLE ON-DEMAND
  // ==========================================

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    if (paused) {
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = 0;
        this.renderQueued = false;
      }
      if (this.genesisShimmerTimerId !== null) {
        clearTimeout(this.genesisShimmerTimerId);
        this.genesisShimmerTimerId = null;
      }
    } else {
      if (this.onDemandRender) {
        this.requestRender();
      } else if (!this.animFrameId) {
        this.startRenderLoop();
      }
    }
  }

  public renderImmediate(): void {
    if (this.isDestroyed || this.isPaused) return;
    if (this.edgeMode === "wireframe") {
      this.updateGenesisAnimationUniforms(performance.now());
    }
    this.updateCameraCoupledLighting();
    this.renderer.render(this.scene, this.activeCamera);
    if (this.edgeMode === "wireframe") {
      this.scheduleGenesisShimmerTick();
    }
  }

  public requestRender(): void {
    if (this.isDestroyed || this.isPaused) return;
    if (!this.onDemandRender) return;
    if (this.renderQueued) return;
    this.renderQueued = true;
    this.animFrameId = requestAnimationFrame((now) => {
      this.renderQueued = false;
      this.animFrameId = 0;
      if (this.isDestroyed || this.isPaused) return;
      if (this.edgeMode === "wireframe") {
        this.updateGenesisAnimationUniforms(now);
      }
      this.updateCameraCoupledLighting();
      this.renderer.render(this.scene, this.activeCamera);
      if (this.edgeMode === "wireframe") {
        this.scheduleGenesisShimmerTick();
      }
    });
  }

  private startRenderLoop(): void {
    const loop = () => {
      if (this.isDestroyed) return;
      this.animFrameId = requestAnimationFrame(loop);

      if (this.morphAnimation) {
        const m = this.morphAnimation;
        const now = performance.now();
        const rawT = Math.min(1, Math.max(0, (now - m.startTime) / m.durationMs));
        const eased = cubicBezier022(rawT);

        if (m.direction === "to3d") {
          const progress3D = m.startProgress3D + (1 - m.startProgress3D) * eased;
          const pose = evaluateMorphCameraPose(m.match, progress3D);
          this.applyCameraPose(pose);
          this.setExtrusionMorphScale(progress3D);
          m.onProgress?.(progress3D);

          if (rawT >= 1) {
            this.setExtrusionMorphScale(1);
            const doneCb = m.onComplete;
            this.morphAnimation = null;
            doneCb?.();
          }
        } else {
          // Retorno 3D -> 2D: interpola suavemente da pose 3D atual até a pose 2D exata (startPose)
          const progress3D = m.startProgress3D * (1 - eased);
          const toPose = m.match.startPose;

          const pos = new THREE.Vector3().lerpVectors(
            m.fromPos,
            new THREE.Vector3(toPose.position.x, toPose.position.y, toPose.position.z),
            eased,
          );
          const target = new THREE.Vector3().lerpVectors(
            m.fromTarget,
            new THREE.Vector3(toPose.target.x, toPose.target.y, toPose.target.z),
            eased,
          );
          const up = new THREE.Vector3()
            .lerpVectors(
              m.fromUp,
              new THREE.Vector3(toPose.up.x, toPose.up.y, toPose.up.z),
              eased,
            )
            .normalize();

          this.camera.position.copy(pos);
          this.orthoCamera.position.copy(pos);
          this.camera.up.copy(up);
          this.orthoCamera.up.copy(up);
          this.controls.target.copy(target);
          this.controls.update();

          this.setExtrusionMorphScale(progress3D);
          m.onProgress?.(progress3D);

          if (rawT >= 1) {
            this.applyCameraPose(toPose);
            this.setExtrusionMorphScale(0.01);
            const doneCb = m.onComplete;
            this.morphAnimation = null;
            doneCb?.();
          }
        }
      } else if (this.cameraAnimation) {
        const now = performance.now();
        const elapsed = now - this.cameraAnimation.startTime;
        const progress = Math.min(elapsed / this.cameraAnimation.duration, 1);
        const t = cubicBezier022(progress);

        this.camera.position.lerpVectors(
          this.cameraAnimation.fromPos,
          this.cameraAnimation.toPos,
          t,
        );
        this.orthoCamera.position.copy(this.camera.position);
        this.controls.target.lerpVectors(
          this.cameraAnimation.fromTarget,
          this.cameraAnimation.toTarget,
          t,
        );
        if (this.cameraAnimation.fromUp && this.cameraAnimation.toUp) {
          this.camera.up
            .lerpVectors(this.cameraAnimation.fromUp, this.cameraAnimation.toUp, t)
            .normalize();
          this.orthoCamera.up.copy(this.camera.up);
        }
        this.controls.update();

        if (progress >= 1) {
          this.cameraAnimation = null;
        }
      } else {
        this.controls.update();
      }

      if (this.onCameraRotateCallback || this.onOrbitAnglesChangeCallback) {
        this.tempEuler.setFromQuaternion(this.activeCamera.quaternion, "YXZ");
        if (
          Math.abs(this.tempEuler.x - this.lastReportedRotation.x) > 1e-4 ||
          Math.abs(this.tempEuler.y - this.lastReportedRotation.y) > 1e-4 ||
          Math.abs(this.tempEuler.z - this.lastReportedRotation.z) > 1e-4
        ) {
          this.lastReportedRotation = {
            x: this.tempEuler.x,
            y: this.tempEuler.y,
            z: this.tempEuler.z,
          };
          this.onCameraRotateCallback?.(this.lastReportedRotation);
        }

        if (this.onOrbitAnglesChangeCallback && !this.cameraAnimation && !this.morphAnimation) {
          const angles = this.getOrbitAngles();
          if (
            Math.abs(angles.azimuthDeg - this.lastReportedOrbitAngles.azimuthDeg) > 0.25 ||
            Math.abs(angles.elevationDeg - this.lastReportedOrbitAngles.elevationDeg) > 0.25
          ) {
            this.lastReportedOrbitAngles = angles;
            this.onOrbitAnglesChangeCallback(angles);
          }
        }
      }

      if (this.edgeMode === "wireframe") {
        this.updateGenesisAnimationUniforms(performance.now());
      }
      this.updateCameraCoupledLighting();
      this.renderer.render(this.scene, this.activeCamera);
    };

    loop();
  }

  // ==========================================
  // LIMPEZA E DESCARTE DE RECURSOS
  // ==========================================

  public dispose(): void {
    this.isDestroyed = true;
    cancelAnimationFrame(this.animFrameId);
    if (this.genesisShimmerTimerId !== null) {
      clearTimeout(this.genesisShimmerTimerId);
      this.genesisShimmerTimerId = null;
    }

    const dom = this.renderer.domElement;
    dom.removeEventListener("pointerdown", this.onPointerDown);
    dom.removeEventListener("pointermove", this.onPointerMove);
    dom.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("resize", this.onWindowResize);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.clearGeometry();
    this.clearBRepWireframeObjects();
    this.clearSketchWireframes();

    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.geometry.dispose();
      if (Array.isArray(this.gridHelper.material)) {
        this.gridHelper.material.forEach((m) => m.dispose());
      } else if (this.gridHelper.material instanceof THREE.Material) {
        this.gridHelper.material.dispose();
      }
      this.gridHelper = null;
    }

    if (this.gizmoTargetMesh) {
      this.scene.remove(this.gizmoTargetMesh);
      this.gizmoTargetMesh.geometry.dispose();
      if (this.gizmoTargetMesh.material instanceof THREE.Material) {
        this.gizmoTargetMesh.material.dispose();
      }
      this.gizmoTargetMesh = null;
    }

    this.baseSolidMaterial.dispose();
    this.depthPrePassMaterial.dispose();
    this.genesisVisibleLaserMat.dispose();
    this.genesisXRayLaserMat.dispose();
    this.brepOuterContourMat.dispose();
    this.brepFeatureThicknessMat.dispose();
    this.brepInternalDetailMat.dispose();
    this.brepHiddenXRayMat.dispose();
    this.brepCenterlineAxisMat.dispose();
    this.brepSelectedEdgeMat.dispose();
    this.primaryFaceMaterial.dispose();
    this.secondaryFaceMaterial.dispose();
    this.hoveredFaceMaterial.dispose();
    this.edgeMaterial.dispose();
    this.primaryEdgeMaterial.dispose();
    this.secondaryEdgeMaterial.dispose();
    this.vertexMaterial.dispose();
    this.selectedVertexMaterial.dispose();
    this.dimensionLineMaterial.dispose();

    if (this.transformControls) {
      this.transformControls.dispose();
      this.transformControls = null;
    }

    this.controls.dispose();
    this.renderer.dispose();
    if (dom.parentElement) {
      dom.parentElement.removeChild(dom);
    }
  }
}
