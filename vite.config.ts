// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: true,
    },
    optimizeDeps: {
      exclude: ["occt-wasm", "@lovable.dev/cloud-auth-js"],
      holdUntilCrawlEnd: true,
      include: [
        "@google/genai",
        "@radix-ui/react-checkbox",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-slot",
        "@radix-ui/react-switch",
        "@supabase/supabase-js",
        "@tanstack/history",
        "@tanstack/react-query",
        "@tanstack/router-core",
        "@tanstack/router-core/isServer",
        "@tanstack/router-core/ssr/client",
        "@tanstack/router-core/ssr/server",
        "class-variance-authority",
        "clsx",
        "h3-v2",
        "jspdf",
        "lucide-react",
        "qrcode",
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-dev-runtime",
        "react/jsx-runtime",
        "seroval",
        "sonner",
        "tailwind-merge",
        "tesseract.js",
        "three",
        "three/examples/jsm/controls/OrbitControls.js",
        "three/examples/jsm/controls/TransformControls.js",
        "zod",
      ],
    },
    build: {
      target: "esnext",
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    client: { entry: "client" },
  },
});
