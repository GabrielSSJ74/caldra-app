/**
 * AURORA CALDRA 2.0 — motor de shader WebGL1 (domain warping sobre FBM).
 *
 * Regras de engenharia:
 *  - UM único contexto WebGL para todo o app. O canvas é movido (appendChild)
 *    entre os pontos de montagem; nunca recriado.
 *  - Render em meia resolução (lado maior ≤ 1280px) esticado por CSS.
 *  - Cap de 30fps, RAF parado com a aba em background.
 *  - prefers-reduced-motion / estático → um frame e para.
 *  - Degradação adaptativa e fallback CSS se WebGL falhar.
 */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform float u_amp;      // amplitude global (Modo Oficina reduz)
uniform float u_isDark;   // 1.0 = dark/amoled, 0.0 = light

uniform vec3 u_baseA;     // base gradiente topo
uniform vec3 u_baseB;     // base gradiente fundo
uniform vec3 u_warm;      // massa quente topo
uniform vec3 u_warmDeep;  // massa quente profunda
uniform vec3 u_magenta;   // núcleo magenta
uniform vec3 u_wine;      // núcleo vinho
uniform vec3 u_fuchsia;   // núcleo fúcsia
uniform vec3 u_indigo;    // massa fria cantos
uniform vec3 u_violet;    // massa fria violeta

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / max(u_res.x, u_res.y);
  p *= 2.0;

  float t = u_time;

  // respiração orgânica (95% – 115%) com períodos primos entre si
  float breath = 1.0 + 0.10 * sin(t * 0.0703) + 0.05 * sin(t * 0.1131 + 1.7);
  vec2 pw = p * breath;

  // domain warping em duas camadas (Inigo Quilez)
  vec2 q = vec2(
    fbm(pw + vec2(0.0, 0.0) + vec2(t * 0.031, t * -0.019)),
    fbm(pw + vec2(5.2, 1.3) + vec2(t * -0.023, t * 0.027))
  );

  vec2 r = vec2(
    fbm(pw + 4.0 * q + vec2(1.7, 9.2) + vec2(t * 0.017, t * 0.011)),
    fbm(pw + 4.0 * q + vec2(8.3, 2.8) + vec2(t * -0.013, t * 0.021))
  );

  float f = fbm(pw + 4.0 * r);

  // base radial adaptada ao tema
  float rad = length(vec2((uv.x - 0.5) * 1.2, uv.y - 0.0));
  vec3 col = mix(u_baseA, u_baseB, smoothstep(0.0, 1.1, rad));

  // massa quente — quadrante superior, deformada pelo campo
  float warmField = f + 0.35 * r.x + (1.0 - uv.y) * -0.30 + 0.18;
  float warm = smoothstep(0.42, 0.86, warmField) * smoothstep(0.05, 0.75, uv.y);
  vec3 warmCol = mix(u_warmDeep, u_warm, clamp(r.y, 0.0, 1.0));

  // núcleo magenta pulsante — centro
  float pulse = 0.85 + 0.15 * sin(t * 0.62);
  float coreD = length(vec2((uv.x - 0.5) * 1.15, (uv.y - 0.48))) / pulse;
  float core = smoothstep(0.62, 0.06, coreD) * smoothstep(0.30, 0.80, f + 0.25 * q.y);
  vec3 coreCol = mix(u_wine, u_magenta, clamp(f * 1.4, 0.0, 1.0));
  coreCol = mix(coreCol, u_fuchsia, clamp(r.y * 0.9, 0.0, 1.0));

  // massa fria — cantos opostos
  float coldField = f * 0.9 + 0.4 * q.x + (uv.y * 0.35);
  float cold = smoothstep(0.75, 0.28, coldField) * smoothstep(0.95, 0.25, uv.y);
  vec3 coldCol = mix(u_indigo, u_violet, clamp(q.x + 0.4, 0.0, 1.0));

  float a = u_amp;
  // névoa: peso das cores adaptado (suave no claro, brilhante no escuro)
  float coldWeight = mix(0.34, 0.17, u_isDark);
  float warmWeight = mix(0.32, 0.15, u_isDark);
  float coreWeight = mix(0.30, 0.16, u_isDark);

  col = mix(col, coldCol, cold * coldWeight * a);
  col = mix(col, warmCol, warm * warmWeight * a);
  col = mix(col, coreCol, core * coreWeight * a);

  // vinheta suave adaptada (escurece no dark; atenua suavemente no light)
  float vigDark = 1.0 - 0.25 * smoothstep(0.55, 1.25, rad);
  vec3 darkResult = col * vigDark;
  vec3 lightResult = mix(col, u_baseB, 0.35 * smoothstep(0.55, 1.25, rad));
  col = mix(lightResult, darkResult, u_isDark);

  // granulação de filme (elimina banding)
  float grain = hash(gl_FragCoord.xy + fract(t) * 137.0) - 0.5;
  col += grain * mix(0.012, 0.03, u_isDark);

  gl_FragColor = vec4(col, 1.0);
}
`;

type Mount = {
  el: HTMLElement;
  animated: boolean;
  amp: number;
  dark: boolean;
  amoled: boolean;
};

const HEX = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

const PALETTE_DARK: Record<string, [number, number, number]> = {
  u_baseA: HEX("#18181b"),
  u_baseB: HEX("#111114"),
  u_warm: HEX("#f59e0b"),
  u_warmDeep: HEX("#b45309"),
  u_magenta: HEX("#a01550"),
  u_wine: HEX("#7a103c"),
  u_fuchsia: HEX("#86198f"),
  u_indigo: HEX("#312e81"),
  u_violet: HEX("#4c1d95"),
};

const PALETTE_LIGHT: Record<string, [number, number, number]> = {
  u_baseA: HEX("#ffffff"),
  u_baseB: HEX("#f3f5f8"),
  u_warm: HEX("#fcd9a0"),
  u_warmDeep: HEX("#f6c67a"),
  u_magenta: HEX("#f2dbe6"),
  u_wine: HEX("#ebd0de"),
  u_fuchsia: HEX("#e5d4ed"),
  u_indigo: HEX("#d4e2f4"),
  u_violet: HEX("#dde4ee"),
};

const PALETTE_AMOLED: Record<string, [number, number, number]> = {
  u_baseA: HEX("#000000"),
  u_baseB: HEX("#000000"),
  u_warm: HEX("#925405"),
  u_warmDeep: HEX("#662b03"),
  u_magenta: HEX("#6b0e36"),
  u_wine: HEX("#4f0a26"),
  u_fuchsia: HEX("#531059"),
  u_indigo: HEX("#1e1c50"),
  u_violet: HEX("#2e125b"),
};

class AuroraEngine {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private stack: Mount[] = [];
  private currentDark: boolean | null = null;
  private currentAmoled: boolean | null = null;
  private raf = 0;
  private start = 0;
  private last = 0;
  private scale = 0.5;
  private slowSince = 0;
  private degraded = 0;
  private failed = false;
  private ro: ResizeObserver | null = null;
  private listeners = new Set<(ok: boolean) => void>();

  supported() {
    return !this.failed;
  }

  onStatus(fn: (ok: boolean) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private fail() {
    if (this.failed) return;
    this.failed = true;
    this.stop();
    this.canvas?.remove();
    this.listeners.forEach((l) => l(false));
  }

  private applyPalette(dark: boolean, amoled: boolean) {
    const gl = this.gl;
    if (!gl) return;
    const palette = !dark ? PALETTE_LIGHT : amoled ? PALETTE_AMOLED : PALETTE_DARK;
    for (const [name, rgb] of Object.entries(palette)) {
      const loc = this.uniforms[name];
      if (loc) gl.uniform3f(loc, rgb[0], rgb[1], rgb[2]);
    }
    const darkLoc = this.uniforms["u_isDark"];
    if (darkLoc) gl.uniform1f(darkLoc, dark ? 1.0 : 0.0);
    this.currentDark = dark;
    this.currentAmoled = amoled;
  }

  private init(): boolean {
    if (this.failed) return false;
    if (this.gl) return true;
    try {
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
      const opts: WebGLContextAttributes = {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: "low-power",
      };
      const gl = (canvas.getContext("webgl", opts) ||
        canvas.getContext("experimental-webgl", opts)) as WebGLRenderingContext | null;
      if (!gl) return (this.fail(), false);

      const compile = (type: number, src: string) => {
        const sh = gl.createShader(type)!;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("shader");
        return sh;
      };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "a_pos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      for (const name of ["u_res", "u_time", "u_amp", "u_isDark", ...Object.keys(PALETTE_DARK)]) {
        this.uniforms[name] = gl.getUniformLocation(prog, name);
      }
      this.applyPalette(true, false);

      canvas.addEventListener("webglcontextlost", (e) => {
        // preventDefault permite a restauração; até lá, degrada para o CSS.
        e.preventDefault();
        this.stop();
        this.listeners.forEach((l) => l(false));
      });
      canvas.addEventListener("webglcontextrestored", () => {
        this.gl = null;
        this.program = null;
        this.canvas?.remove();
        this.canvas = null;
        this.fail();
      });

      this.canvas = canvas;
      this.gl = gl;
      this.program = prog;
      this.start = performance.now();
      this.ro = new ResizeObserver(() => this.resize());
      return true;
    } catch {
      this.fail();
      return false;
    }
  }

  private top(): Mount | null {
    return this.stack.length ? this.stack[this.stack.length - 1]! : null;
  }

  acquire(
    el: HTMLElement,
    animated: boolean,
    amp: number,
    dark = true,
    amoled = false,
  ): () => void {
    if (!this.init() || !this.canvas) return () => {};
    const mount: Mount = { el, animated, amp, dark, amoled };
    this.stack.push(mount);
    this.attach();
    return () => {
      this.stack = this.stack.filter((m) => m !== mount);
      this.attach();
    };
  }

  update(el: HTMLElement, animated: boolean, amp: number, dark = true, amoled = false) {
    const m = this.stack.find((x) => x.el === el);
    if (!m) return;
    m.animated = animated;
    m.amp = amp;
    m.dark = dark;
    m.amoled = amoled;
    if (this.top() === m) this.attach();
  }

  private attach() {
    const top = this.top();
    if (!this.canvas) return;
    if (!top) {
      this.stop();
      this.canvas.remove();
      this.ro?.disconnect();
      return;
    }
    if (this.canvas.parentElement !== top.el) {
      this.ro?.disconnect();
      top.el.appendChild(this.canvas);
      this.ro?.observe(top.el);
    }
    this.resize();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (top.animated && !reduced && document.visibilityState === "visible") this.play();
    else {
      this.stop();
      this.draw(performance.now());
    }
  }

  private resize() {
    const top = this.top();
    if (!this.canvas || !this.gl || !top) return;
    const rect = top.el.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let bw = w * dpr * this.scale;
    let bh = h * dpr * this.scale;
    const maxSide = 1280;
    const k = Math.min(1, maxSide / Math.max(bw, bh));
    bw = Math.max(1, Math.round(bw * k));
    bh = Math.max(1, Math.round(bh * k));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
      this.gl.viewport(0, 0, bw, bh);
      this.draw(performance.now());
    }
  }

  private draw(now: number) {
    const gl = this.gl;
    const top = this.top();
    if (!gl || !top || !this.canvas) return;
    if (top.dark !== this.currentDark || top.amoled !== this.currentAmoled) {
      this.applyPalette(top.dark, top.amoled);
    }
    gl.uniform2f(this.uniforms["u_res"]!, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniforms["u_time"]!, (now - this.start) / 1000);
    gl.uniform1f(this.uniforms["u_amp"]!, top.amp);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private play() {
    if (this.raf) return;
    this.last = 0;
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      if (this.last && now - this.last < 33) return;
      const frameGap = this.last ? now - this.last : 0;
      this.last = now;
      const t0 = performance.now();
      this.draw(now);
      const cost = performance.now() - t0;
      // degradação adaptativa
      if (frameGap > 33 && cost > 12) {
        if (!this.slowSince) this.slowSince = now;
        else if (now - this.slowSince > 2000) {
          this.slowSince = 0;
          this.degraded += 1;
          if (this.degraded === 1) {
            this.scale = 0.35;
            this.resize();
          } else {
            this.stop();
          }
        }
      } else {
        this.slowSince = 0;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  handleVisibility() {
    this.attach();
  }
}

let engine: AuroraEngine | null = null;

export function auroraEngine(): AuroraEngine | null {
  if (typeof window === "undefined") return null;
  if (!engine) {
    engine = new AuroraEngine();
    document.addEventListener("visibilitychange", () => engine?.handleVisibility());
    window.addEventListener("resize", () => engine?.handleVisibility());
  }
  return engine;
}
