/**
 * Apple Liquid Glass orbs — faithful port of archisvaze/liquid-glass.
 * Source: https://github.com/archisvaze/liquid-glass
 *
 * Desktop:
 *   Chromium → physics displacement via backdrop-filter: url(#filter)
 *   Other    → lucasromerodb turbulence displacement fallback (filter:url)
 *
 * Mobile (only):
 *   WebGL / GLSL refraction (archis webgl.html shader) sampling a page
 *   snapshot — works in iOS Safari / WebKit where SVG backdrop filters don't.
 */
(() => {
  // Defaults from archisvaze/liquid-glass control panel (index.html sliders).
  // Circle uses the same engine with milder refraction — a full-disk lens at
  // IOR 3 / scale 1 reads as a chrome marble; Apple circular glass is subtler.
  const ARCHIS = {
    glassThickness: 80,
    bezelWidth: 60,
    ior: 3.0,
    scaleRatio: 1.0,
    blurAmt: 0.3,
    specOpacity: 0.5,
    specSat: 4,
    tintOpacity: 0.06,
    shadowBlur: 20,
    shadowSpread: -5,
    shadowColor: "rgba(255, 255, 255, 0.45)",
    outerShadowBlur: 24,
  };

  const SHAPE_TUNE = {
    squircle: { ior: 3.0, scaleRatio: 1.0, bezelFrac: 0.52, specOpacity: 0.5 },
    // Same refraction profile as squircle, but radius comes from CSS / data-lg-radius
    rounded: { ior: 3.0, scaleRatio: 1.0, bezelFrac: 0.52, specOpacity: 0.5 },
    circle: { ior: 1.85, scaleRatio: 0.55, bezelFrac: 0.38, specOpacity: 0.38 },
  };

  // iOS dark Liquid Glass: deeper frost, softer specular luminance
  const DARK_GLASS = {
    blurAmt: 0.55,
    specOpacityMul: 0.72,
    specSat: 2.5,
  };

  // WebGL path defaults (archis webgl.html control panel)
  const WEBGL_LOOK = {
    thickness: 50,
    bezel: 60,
    blur: 1.5,
    shadow: 0.5,
  };

  function isDarkMode() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  /** Mobile / touch devices only — desktop path must stay unchanged. */
  function isMobileLiquidGlass() {
    const ua = navigator.userAgent || "";
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    // iPadOS 13+ can report as Macintosh with touch
    if (navigator.maxTouchPoints > 1 && /Mac/.test(ua)) return true;
    return window.matchMedia("(max-width: 768px) and (hover: none)").matches;
  }

  const SURFACE_FNS = {
    // verbatim from archisvaze/liquid-glass
    convex_squircle: (x) => Math.pow(1 - Math.pow(1 - x, 4), 0.25),
    convex_circle: (x) => Math.sqrt(1 - (1 - x) * (1 - x)),
  };

  function isChromiumSvgBackdrop() {
    const ua = navigator.userAgent;
    // SVG backdrop-filter:url(#…) only renders in Chromium today
    const isChromium = /Chrome|Chromium|Edg|OPR/i.test(ua);
    if (!isChromium) return false;
    const el = document.createElement("div");
    el.style.cssText = "backdrop-filter: url(#test)";
    return (
      el.style.backdropFilter === "url(#test)" ||
      el.style.backdropFilter === 'url("#test")'
    );
  }

  // --- archisvaze refraction math (verbatim) ---
  function calculateRefractionProfile(glassThickness, bezelWidth, heightFn, ior, samples) {
    samples = samples || 128;
    const eta = 1 / ior;
    function refract(nx, ny) {
      const dot = ny;
      const k = 1 - eta * eta * (1 - dot * dot);
      if (k < 0) return null;
      const sq = Math.sqrt(k);
      return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
    }
    const profile = new Float64Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = i / samples;
      const y = heightFn(x);
      const dx = x < 1 ? 0.0001 : -0.0001;
      const y2 = heightFn(x + dx);
      const deriv = (y2 - y) / dx;
      const mag = Math.sqrt(deriv * deriv + 1);
      const ref = refract(-deriv / mag, -1 / mag);
      if (!ref) {
        profile[i] = 0;
        continue;
      }
      profile[i] = ref[0] * ((y * bezelWidth + glassThickness) / ref[1]);
    }
    return profile;
  }

  function generateDisplacementMap(w, h, radius, bezelWidth, profile, maxDisp) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 128;
      d[i + 1] = 128;
      d[i + 2] = 0;
      d[i + 3] = 255;
    }

    const r = radius;
    const rSq = r * r;
    const r1Sq = (r + 1) ** 2;
    const rBSq = Math.max(r - bezelWidth, 0) ** 2;
    const wB = w - r * 2;
    const hB = h - r * 2;
    const S = profile.length;

    for (let y1 = 0; y1 < h; y1++) {
      for (let x1 = 0; x1 < w; x1++) {
        const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        const dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq) continue;
        const dist = Math.sqrt(dSq);
        const fromSide = r - dist;
        const op =
          dSq < rSq
            ? 1
            : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
        if (op <= 0 || dist === 0) continue;
        const cos = x / dist;
        const sin = y / dist;
        const bi = Math.min(((fromSide / bezelWidth) * S) | 0, S - 1);
        const disp = profile[bi] || 0;
        const dX = (-cos * disp) / maxDisp;
        const dY = (-sin * disp) / maxDisp;
        const idx = (y1 * w + x1) * 4;
        d[idx] = (128 + dX * 127 * op + 0.5) | 0;
        d[idx + 1] = (128 + dY * 127 * op + 0.5) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function generateSpecularMap(w, h, radius, bezelWidth, angle) {
    angle = angle != null ? angle : Math.PI / 3;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    const d = img.data;
    d.fill(0);

    const r = radius;
    const rSq = r * r;
    const r1Sq = (r + 1) ** 2;
    const rBSq = Math.max(r - bezelWidth, 0) ** 2;
    const wB = w - r * 2;
    const hB = h - r * 2;
    const sv = [Math.cos(angle), Math.sin(angle)];

    for (let y1 = 0; y1 < h; y1++) {
      for (let x1 = 0; x1 < w; x1++) {
        const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        const dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq) continue;
        const dist = Math.sqrt(dSq);
        const fromSide = r - dist;
        const op =
          dSq < rSq
            ? 1
            : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
        if (op <= 0 || dist === 0) continue;
        const cos = x / dist;
        const sin = -y / dist;
        const dot = Math.abs(cos * sv[0] + sin * sv[1]);
        // archis: edge = sqrt(max(0, 1 - (1 - fromSide)^2))  — note: not /bezelWidth
        const edge = Math.sqrt(Math.max(0, 1 - (1 - fromSide) ** 2));
        const coeff = dot * edge;
        const col = (255 * coeff) | 0;
        const alpha = (col * coeff * op) | 0;
        const idx = (y1 * w + x1) * 4;
        d[idx] = col;
        d[idx + 1] = col;
        d[idx + 2] = col;
        d[idx + 3] = alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function ensureLucasFallbackFilter(defs) {
    // From lucasromerodb/liquid-glass-effect-macos
    if (document.getElementById("lg-lucas-distort")) return;
    const svgNS = "http://www.w3.org/2000/svg";
    const filter = document.createElementNS(svgNS, "filter");
    filter.setAttribute("id", "lg-lucas-distort");
    filter.setAttribute("x", "0%");
    filter.setAttribute("y", "0%");
    filter.setAttribute("width", "100%");
    filter.setAttribute("height", "100%");
    filter.setAttribute("filterUnits", "objectBoundingBox");
    filter.innerHTML = `
      <feTurbulence type="fractalNoise" baseFrequency="0.01 0.01"
        numOctaves="1" seed="5" result="turbulence" />
      <feComponentTransfer in="turbulence" result="mapped">
        <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
        <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
        <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
      </feComponentTransfer>
      <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
      <feSpecularLighting in="softMap" surfaceScale="5" specularConstant="1"
        specularExponent="100" lighting-color="white" result="specLight">
        <fePointLight x="-200" y="-200" z="300" />
      </feSpecularLighting>
      <feComposite in="specLight" operator="arithmetic"
        k1="0" k2="1" k3="1" k4="0" result="litImage" />
      <feDisplacementMap in="SourceGraphic" in2="softMap"
        scale="150" xChannelSelector="R" yChannelSelector="G" />
    `;
    defs.appendChild(filter);
  }

  function setFilterMarkup(defs, id, markup) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();
    // Parse inside an SVG document so primitives are SVG-namespaced
    // (same end result as archis inserting into an xmlns SVG <defs>)
    const svgNS = "http://www.w3.org/2000/svg";
    const holder = document.createElementNS(svgNS, "svg");
    holder.setAttribute("xmlns", svgNS);
    holder.innerHTML = markup;
    const node = holder.querySelector("filter");
    if (node) defs.appendChild(node);
  }

  function buildArchisFilter(id, w, h, dispUrl, specUrl, blurAmt, scale, specOpacity, specSat) {
    // Filter graph verbatim from archisvaze/liquid-glass rebuildFilter()
    return `
      <filter id="${id}" x="0%" y="0%" width="100%" height="100%"
        color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="${blurAmt}" result="blurred_source" />
        <feImage href="${dispUrl}" x="0" y="0" width="${w}" height="${h}" result="disp_map" />
        <feDisplacementMap in="blurred_source" in2="disp_map"
          scale="${scale}" xChannelSelector="R" yChannelSelector="G"
          result="displaced" />
        <feColorMatrix in="displaced" type="saturate" values="${specSat}" result="displaced_sat" />
        <feImage href="${specUrl}" x="0" y="0" width="${w}" height="${h}" result="spec_layer" />
        <feComposite in="displaced_sat" in2="spec_layer" operator="in" result="spec_masked" />
        <feComponentTransfer in="spec_layer" result="spec_faded">
          <feFuncA type="linear" slope="${specOpacity}" />
        </feComponentTransfer>
        <feBlend in="spec_masked" in2="displaced" mode="normal" result="with_sat" />
        <feBlend in="spec_faded" in2="with_sat" mode="normal" />
      </filter>`;
  }

  /** Parse data-lg-radius: number (px), "24", "24px", "1.5rem", "50%". */
  function parseRadiusAttr(raw, el, w, h) {
    const s = String(raw).trim();
    if (!s) return null;
    const ref = Math.min(w, h);
    if (s.endsWith("%")) {
      const pct = parseFloat(s);
      return Number.isFinite(pct) ? (pct / 100) * ref : null;
    }
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return null;
    if (s.endsWith("rem")) {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
      return n * fs;
    }
    // bare number or px (and other absolute units already computed-like)
    return n;
  }

  function clampRadius(r, w, h) {
    const max = Math.min(w, h) / 2;
    return Math.max(0, Math.min(r, max));
  }

  /**
   * Corner radius for the displacement map:
   * 1) data-lg-radius if set
   * 2) circle → half the short side
   * 3) rounded → computed CSS border-radius (arbitrary)
   * 4) squircle → ~35% of short side (legacy Apple-ish default)
   */
  function resolveCornerRadius(el, shape, w, h) {
    const data = el.getAttribute("data-lg-radius");
    if (data != null && String(data).trim() !== "") {
      const parsed = parseRadiusAttr(data, el, w, h);
      if (parsed != null) return clampRadius(parsed, w, h);
    }

    if (shape === "circle") return Math.min(w, h) / 2;

    if (shape === "rounded") {
      const computed = parseFloat(getComputedStyle(el).borderTopLeftRadius);
      if (Number.isFinite(computed)) return clampRadius(computed, w, h);
    }

    return Math.min(w, h) * 0.35;
  }

  function initOrb(el, useSvgBackdrop) {
    const shape = el.getAttribute("data-liquid-glass") || "circle";
    const filterId =
      el.getAttribute("data-filter-id") ||
      `lg-filter-${shape}-${Math.random().toString(36).slice(2, 7)}`;
    el.setAttribute("data-filter-id", filterId);

    const w = Math.max(2, Math.round(el.offsetWidth));
    const h = Math.max(2, Math.round(el.offsetHeight));

    const radius = resolveCornerRadius(el, shape, w, h);
    el.style.setProperty("--lg-radius", `${radius}px`);

    const defs = document.getElementById("liquid-glass-defs");
    if (!defs) return;

    if (!useSvgBackdrop) {
      el.classList.add("lg-fallback");
      el.classList.remove("lg-refraction");
      ensureLucasFallbackFilter(defs);
      return;
    }

    const tune = SHAPE_TUNE[shape] || SHAPE_TUNE.circle;
    const dark = isDarkMode();
    const heightFn =
      shape === "circle" ? SURFACE_FNS.convex_circle : SURFACE_FNS.convex_squircle;
    // Archis defaults use bezel≈radius on large panes. On small orbs that would
    // erase the flat glass center — keep a fraction of radius so the rim lens reads.
    const targetBezel = Math.max(12, Math.round(radius * tune.bezelFrac));
    const clampedBezel = Math.min(
      targetBezel,
      ARCHIS.bezelWidth,
      Math.max(2, radius - 1),
      Math.min(w, h) / 2 - 1
    );

    // Render maps at 2× so rim refraction stays sharp on retina / small orbs
    const mapScale = 2;
    const mw = w * mapScale;
    const mh = h * mapScale;
    const mRadius = radius * mapScale;
    const mBezel = clampedBezel * mapScale;

    const profile = calculateRefractionProfile(
      ARCHIS.glassThickness * mapScale,
      mBezel,
      heightFn,
      tune.ior,
      128
    );
    const maxDisp = Math.max(...Array.from(profile).map(Math.abs)) || 1;
    const dispUrl = generateDisplacementMap(
      mw,
      mh,
      mRadius,
      mBezel,
      profile,
      maxDisp
    );
    const specUrl = generateSpecularMap(mw, mh, mRadius, mBezel * 2.5);
    // feDisplacementMap scale is in filter primitive units (= element CSS px)
    const scale = (maxDisp / mapScale) * tune.scaleRatio;
    const blurAmt = dark ? DARK_GLASS.blurAmt : ARCHIS.blurAmt;
    const specOpacity =
      tune.specOpacity * (dark ? DARK_GLASS.specOpacityMul : 1);
    const specSat = dark ? DARK_GLASS.specSat : ARCHIS.specSat;

    setFilterMarkup(
      defs,
      filterId,
      buildArchisFilter(
        filterId,
        w,
        h,
        dispUrl,
        specUrl,
        blurAmt,
        scale,
        specOpacity,
        specSat
      )
    );

    el.classList.add("lg-refraction");
    el.classList.remove("lg-fallback");
    // Archis applies ONLY url(#filter) — blur lives inside the SVG graph
    el.style.setProperty("--lg-filter", `url(#${filterId})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Mobile WebGL path — archisvaze/liquid-glass webgl.html shader, live snapshot
  // ═══════════════════════════════════════════════════════════════════════════

  const webgl = {
    active: false,
    gl: null,
    glCanvas: null,
    program: null,
    uniforms: null,
    buffers: null,
    bgTex: null,
    hasBg: false,
    surfaces: [], // { el, canvas, ctx2d, shape }
    captureTimer: 0,
    raf: 0,
    capturing: false,
    html2canvas: null,
    lastScrollX: 0,
    lastScrollY: 0,
    lastPositions: "",
  };

  const WEBGL_VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  // Port of archisvaze/liquid-glass webgl.html fragment shader.
  // Adapted to per-orb canvases: glass fills the canvas; samples viewport snapshot.
  const WEBGL_FRAG = `
precision highp float;
varying vec2 vUv;

uniform vec2 uResolution;
uniform vec2 uOrbOrigin;
uniform vec2 uGlassSize;
uniform float uRadius;
uniform float uBezel;
uniform float uThickness;
uniform float uIOR;
uniform float uBlur;
uniform float uSpecular;
uniform float uTint;
uniform vec3 uTintColor;
uniform float uShadow;
uniform sampler2D uBgTex;
uniform float uHasBg;

float sdRoundedRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float surfaceHeight(float t) {
  float s = 1.0 - t;
  return pow(1.0 - s*s*s*s, 0.25);
}

vec3 sampleBg(vec2 screenUV) {
  screenUV = clamp(screenUV, vec2(0.001), vec2(0.999));
  return texture2D(uBgTex, screenUV).rgb;
}

vec3 sampleBgBlurred(vec2 uv, float radius) {
  if (radius < 0.5) return sampleBg(uv);
  vec3 sum = vec3(0.0);
  vec2 px = 1.0 / uResolution;
  vec2 offsets[16];
  offsets[0] = vec2(-0.94201, -0.39906);
  offsets[1] = vec2( 0.94558, -0.76890);
  offsets[2] = vec2(-0.09418, -0.92938);
  offsets[3] = vec2( 0.34495, 0.29387);
  offsets[4] = vec2(-0.91588, -0.45771);
  offsets[5] = vec2(-0.81544, 0.48568);
  offsets[6] = vec2(-0.38277, -0.56071);
  offsets[7] = vec2(-0.12675, 0.84686);
  offsets[8] = vec2( 0.89642, 0.41254);
  offsets[9] = vec2( 0.18150, -0.30020);
  offsets[10] = vec2(-0.01445, -0.16001);
  offsets[11] = vec2( 0.59614, 0.71118);
  offsets[12] = vec2( 0.49742, -0.47280);
  offsets[13] = vec2( 0.80685, 0.04588);
  offsets[14] = vec2(-0.32490, -0.03965);
  offsets[15] = vec2(-0.60975, 0.06566);
  for (int i = 0; i < 16; i++) {
    sum += sampleBg(uv + offsets[i] * radius * px);
  }
  return sum / 16.0;
}

void main() {
  // Local pixel with y-down (CSS / getBoundingClientRect space)
  vec2 localPx = vec2(vUv.x, 1.0 - vUv.y) * uGlassSize;
  vec2 p = localPx - uGlassSize * 0.5;
  vec2 halfSize = uGlassSize * 0.5;

  float sd = sdRoundedRect(p, halfSize, uRadius);

  if (sd > 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float distFromEdge = -sd;
  float bezel = min(uBezel, min(uRadius, min(halfSize.x, halfSize.y)) - 1.0);
  bezel = max(bezel, 1.0);
  float t = clamp(distFromEdge / bezel, 0.0, 1.0);

  float h = surfaceHeight(t);
  float dt = 0.001;
  float h2 = surfaceHeight(min(t + dt, 1.0));
  float dh = (h2 - h) / dt;

  float slopeAngle = atan(dh * (uThickness / bezel));
  float sinR = sin(slopeAngle) / uIOR;
  sinR = clamp(sinR, -1.0, 1.0);
  float thetaR = asin(sinR);
  float displacement = h * uThickness * (tan(slopeAngle) - tan(thetaR));

  vec2 grad;
  float eps = 0.5;
  grad.x = sdRoundedRect(p + vec2(eps, 0.0), halfSize, uRadius) - sd;
  grad.y = sdRoundedRect(p + vec2(0.0, eps), halfSize, uRadius) - sd;
  float gLen = length(grad);
  grad = gLen > 0.0 ? grad / gLen : vec2(0.0, 1.0);

  vec2 offset = -grad * displacement / uResolution;

  vec2 screenPx = uOrbOrigin + localPx;
  vec2 screenUV = screenPx / uResolution;
  vec2 refractedUV = screenUV + offset;

  vec3 color;
  if (uHasBg > 0.5) {
    color = sampleBgBlurred(refractedUV, uBlur);
  } else {
    color = vec3(0.85);
  }

  vec2 lightDir = normalize(vec2(0.5, -0.7));
  float rimDot = abs(dot(grad, lightDir));
  float rimFalloff = 1.0 - smoothstep(0.0, bezel * 0.4, distFromEdge);
  float specHighlight = pow(rimDot * rimFalloff, 1.5);
  color += vec3(specHighlight * uSpecular);

  float innerShadow = 1.0 - smoothstep(0.0, bezel * 0.6, distFromEdge);
  color *= mix(1.0, 0.7, innerShadow * 0.3);

  float innerRim = smoothstep(0.0, 2.0, distFromEdge) * (1.0 - smoothstep(2.0, 5.0, distFromEdge));
  color += vec3(innerRim * 0.15 * uSpecular);

  color = mix(color, uTintColor, uTint);

  float alpha = smoothstep(0.0, 1.5, distFromEdge);
  gl_FragColor = vec4(color, alpha);
}`;

  function ensureWebGLStyles() {
    if (document.getElementById("lg-webgl-styles")) return;
    const style = document.createElement("style");
    style.id = "lg-webgl-styles";
    style.textContent = `
      html.lg-mobile-webgl [data-liquid-glass].lg-webgl {
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      html.lg-mobile-webgl [data-liquid-glass].lg-webgl::after {
        display: none !important;
      }
      html.lg-mobile-webgl [data-liquid-glass].lg-webgl::before {
        /* Keep subtle tint/rim; WebGL supplies the refracted fill */
        background-color: rgba(var(--lg-tint-rgb), calc(var(--lg-tint-opacity) * 0.45));
      }
      html.lg-mobile-webgl canvas.lg-webgl-surface {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border-radius: inherit;
        z-index: 0;
        pointer-events: none;
        display: block;
      }
      html.lg-mobile-webgl.lg-capturing [data-liquid-glass],
      html.lg-mobile-webgl.lg-capturing canvas.lg-webgl-surface {
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
  }

  function compileShader(gl, type, source) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("[liquid-glass] shader compile failed", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function createWebGLProgram(gl) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, WEBGL_VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, WEBGL_FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[liquid-glass] program link failed", gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  function initSharedGL() {
    if (webgl.gl) return true;
    const canvas = document.createElement("canvas");
    canvas.id = "lg-webgl-master";
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = 4;
    canvas.height = 4;
    canvas.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;";
    document.body.appendChild(canvas);
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: true,
    });
    if (!gl) return false;
    const program = createWebGLProgram(gl);
    if (!program) return false;

    const aPos = gl.getAttribLocation(program, "aPos");
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const names = [
      "uResolution",
      "uOrbOrigin",
      "uGlassSize",
      "uRadius",
      "uBezel",
      "uThickness",
      "uIOR",
      "uBlur",
      "uSpecular",
      "uTint",
      "uTintColor",
      "uShadow",
      "uBgTex",
      "uHasBg",
    ];
    const uniforms = {};
    names.forEach((n) => {
      uniforms[n] = gl.getUniformLocation(program, n);
    });

    const bgTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // 1×1 placeholder
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([220, 224, 222, 255])
    );

    webgl.gl = gl;
    webgl.glCanvas = canvas;
    webgl.program = program;
    webgl.uniforms = uniforms;
    webgl.buffers = { aPos, buf };
    webgl.bgTex = bgTex;
    return true;
  }

  function resolveHtml2canvasUrl() {
    const scripts = document.querySelectorAll('script[src*="liquid-glass"]');
    const src =
      scripts[scripts.length - 1]?.src ||
      new URL("liquid-glass.js", window.location.href).href;
    return new URL("vendor/html2canvas.min.js", src).href;
  }

  function loadHtml2Canvas() {
    if (webgl.html2canvas) return Promise.resolve(webgl.html2canvas);
    if (typeof window.html2canvas === "function") {
      webgl.html2canvas = window.html2canvas;
      return Promise.resolve(webgl.html2canvas);
    }
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = resolveHtml2canvasUrl();
      s.async = true;
      s.onload = () => {
        if (typeof window.html2canvas === "function") {
          webgl.html2canvas = window.html2canvas;
          resolve(webgl.html2canvas);
        } else {
          reject(new Error("html2canvas missing after load"));
        }
      };
      s.onerror = () => reject(new Error("html2canvas failed to load"));
      document.head.appendChild(s);
    });
  }

  function uploadBgTexture(sourceCanvas) {
    const gl = webgl.gl;
    if (!gl || !sourceCanvas) return;
    gl.bindTexture(gl.TEXTURE_2D, webgl.bgTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      sourceCanvas
    );
    webgl.hasBg = true;
  }

  async function captureBackdrop() {
    if (!webgl.active || webgl.capturing) return;
    webgl.capturing = true;
    document.documentElement.classList.add("lg-capturing");
    try {
      const h2c = await loadHtml2Canvas();
      const scale = Math.min(1.5, window.devicePixelRatio || 1);
      const snap = await h2c(document.body, {
        scale,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        x: window.scrollX,
        y: window.scrollY,
        scrollX: -window.scrollX,
        scrollY: -window.scrollY,
        backgroundColor: null,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 2000,
        ignoreElements: (el) => {
          if (!el || !el.tagName) return false;
          // Keep [data-liquid-glass] in layout (visibility:hidden via .lg-capturing)
          // so in-flow tiles don't collapse; only skip WebGL canvases.
          if (el.id === "lg-webgl-master") return true;
          if (el.classList && el.classList.contains("lg-webgl-surface")) return true;
          return false;
        },
      });
      uploadBgTexture(snap);
      webgl.lastScrollX = window.scrollX;
      webgl.lastScrollY = window.scrollY;
      renderAllWebGL();
    } catch (err) {
      console.warn("[liquid-glass] backdrop capture failed", err);
    } finally {
      document.documentElement.classList.remove("lg-capturing");
      webgl.capturing = false;
    }
  }

  function scheduleCapture(delay) {
    clearTimeout(webgl.captureTimer);
    webgl.captureTimer = setTimeout(() => {
      captureBackdrop();
    }, delay == null ? 120 : delay);
  }

  function tintUniforms() {
    const dark = isDarkMode();
    const cs = getComputedStyle(document.documentElement);
    const rgb = (cs.getPropertyValue("--lg-tint-rgb") || "255, 255, 255")
      .split(",")
      .map((n) => parseFloat(n.trim()) / 255);
    const opacity = parseFloat(cs.getPropertyValue("--lg-tint-opacity")) || ARCHIS.tintOpacity;
    return {
      tint: Math.min(0.35, (Number.isFinite(opacity) ? opacity : 0.06) * (dark ? 1.1 : 1)),
      tintColor: [
        Number.isFinite(rgb[0]) ? rgb[0] : dark ? 0.07 : 1,
        Number.isFinite(rgb[1]) ? rgb[1] : dark ? 0.09 : 1,
        Number.isFinite(rgb[2]) ? rgb[2] : dark ? 0.086 : 1,
      ],
    };
  }

  function renderOrbWebGL(surface) {
    const gl = webgl.gl;
    const el = surface.el;
    if (!gl || !el.isConnected) return;
    if (el.hidden || el.getAttribute("aria-hidden") === "true") {
      const c = surface.canvas;
      if (c.width && c.height) {
        surface.ctx2d.clearRect(0, 0, c.width, c.height);
      }
      return;
    }

    const rect = el.getBoundingClientRect();
    const wCss = Math.max(2, Math.round(rect.width));
    const hCss = Math.max(2, Math.round(rect.height));
    if (wCss < 2 || hCss < 2) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(wCss * dpr));
    const h = Math.max(2, Math.round(hCss * dpr));

    const shape = el.getAttribute("data-liquid-glass") || surface.shape || "circle";
    const radius = resolveCornerRadius(el, shape, wCss, hCss);
    el.style.setProperty("--lg-radius", `${radius}px`);

    const tune = SHAPE_TUNE[shape] || SHAPE_TUNE.circle;
    const dark = isDarkMode();
    const targetBezel = Math.max(10, radius * tune.bezelFrac);
    const bezel = Math.min(
      targetBezel,
      WEBGL_LOOK.bezel,
      Math.max(2, radius - 1),
      Math.min(wCss, hCss) / 2 - 1
    );
    const { tint, tintColor } = tintUniforms();
    const specular =
      tune.specOpacity * (dark ? DARK_GLASS.specOpacityMul : 1) *
      (shape === "circle" ? 0.95 : 1.1);
    const blur = dark ? WEBGL_LOOK.blur * 1.15 : WEBGL_LOOK.blur;

    const glCanvas = webgl.glCanvas;
    if (glCanvas.width !== w || glCanvas.height !== h) {
      glCanvas.width = w;
      glCanvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(webgl.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, webgl.buffers.buf);
    gl.enableVertexAttribArray(webgl.buffers.aPos);
    gl.vertexAttribPointer(webgl.buffers.aPos, 2, gl.FLOAT, false, 0, 0);

    const u = webgl.uniforms;
    gl.uniform2f(u.uResolution, window.innerWidth, window.innerHeight);
    gl.uniform2f(u.uOrbOrigin, rect.left, rect.top);
    gl.uniform2f(u.uGlassSize, wCss, hCss);
    gl.uniform1f(u.uRadius, radius);
    gl.uniform1f(u.uBezel, bezel);
    gl.uniform1f(u.uThickness, WEBGL_LOOK.thickness * (tune.scaleRatio || 1));
    gl.uniform1f(u.uIOR, tune.ior);
    gl.uniform1f(u.uBlur, blur);
    gl.uniform1f(u.uSpecular, specular);
    gl.uniform1f(u.uTint, tint);
    gl.uniform3f(u.uTintColor, tintColor[0], tintColor[1], tintColor[2]);
    gl.uniform1f(u.uShadow, WEBGL_LOOK.shadow);
    gl.uniform1f(u.uHasBg, webgl.hasBg ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, webgl.bgTex);
    gl.uniform1i(u.uBgTex, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const out = surface.canvas;
    if (out.width !== w || out.height !== h) {
      out.width = w;
      out.height = h;
    }
    surface.ctx2d.setTransform(1, 0, 0, 1, 0, 0);
    surface.ctx2d.clearRect(0, 0, w, h);
    surface.ctx2d.drawImage(glCanvas, 0, 0);
  }

  function renderAllWebGL() {
    if (!webgl.active || !webgl.gl) return;
    for (let i = 0; i < webgl.surfaces.length; i++) {
      renderOrbWebGL(webgl.surfaces[i]);
    }
  }

  function positionsKey() {
    let key = `${window.innerWidth}x${window.innerHeight}|`;
    for (let i = 0; i < webgl.surfaces.length; i++) {
      const el = webgl.surfaces[i].el;
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      key += `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)};`;
    }
    return key;
  }

  function webglTick() {
    if (!webgl.active) return;
    const sx = window.scrollX;
    const sy = window.scrollY;
    if (sx !== webgl.lastScrollX || sy !== webgl.lastScrollY) {
      scheduleCapture(100);
    } else {
      const key = positionsKey();
      if (key !== webgl.lastPositions) {
        webgl.lastPositions = key;
        renderAllWebGL();
      }
    }
    webgl.raf = requestAnimationFrame(webglTick);
  }

  function detachWebGLSurfaces() {
    webgl.surfaces.forEach((s) => {
      s.el.classList.remove("lg-webgl");
      if (s.canvas && s.canvas.parentNode) s.canvas.parentNode.removeChild(s.canvas);
    });
    webgl.surfaces = [];
  }

  function attachWebGLSurface(el) {
    el.classList.remove("lg-fallback", "lg-refraction");
    el.classList.add("lg-webgl");
    el.style.removeProperty("--lg-filter");

    let canvas = el.querySelector(":scope > canvas.lg-webgl-surface");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "lg-webgl-surface";
      canvas.setAttribute("aria-hidden", "true");
      el.insertBefore(canvas, el.firstChild);
    }
    const ctx2d = canvas.getContext("2d");
    const shape = el.getAttribute("data-liquid-glass") || "circle";
    webgl.surfaces.push({ el, canvas, ctx2d, shape });
  }

  function teardownWebGL() {
    webgl.active = false;
    cancelAnimationFrame(webgl.raf);
    webgl.raf = 0;
    clearTimeout(webgl.captureTimer);
    detachWebGLSurfaces();
    document.documentElement.classList.remove("lg-mobile-webgl", "lg-capturing");
  }

  function fallbackMobileToLucas(orbs) {
    teardownWebGL();
    document.documentElement.classList.remove("lg-chrome");
    const defs = document.getElementById("liquid-glass-defs");
    orbs.forEach((el) => {
      el.classList.remove("lg-webgl", "lg-refraction");
      el.classList.add("lg-fallback");
      const canvas = el.querySelector(":scope > canvas.lg-webgl-surface");
      if (canvas) canvas.remove();
      if (defs) ensureLucasFallbackFilter(defs);
    });
  }

  function initWebGLAll(orbs) {
    ensureWebGLStyles();
    document.documentElement.classList.add("lg-mobile-webgl");
    document.documentElement.classList.remove("lg-chrome");

    if (!initSharedGL()) {
      fallbackMobileToLucas(orbs);
      return;
    }

    detachWebGLSurfaces();
    orbs.forEach((el) => {
      const w = Math.max(2, Math.round(el.offsetWidth));
      const h = Math.max(2, Math.round(el.offsetHeight));
      const shape = el.getAttribute("data-liquid-glass") || "circle";
      const radius = resolveCornerRadius(el, shape, w, h);
      el.style.setProperty("--lg-radius", `${radius}px`);
      attachWebGLSurface(el);
    });

    webgl.active = true;
    webgl.lastPositions = "";
    webgl.lastScrollX = window.scrollX;
    webgl.lastScrollY = window.scrollY;

    // First paint with placeholder, then real snapshot
    renderAllWebGL();
    scheduleCapture(0);

    cancelAnimationFrame(webgl.raf);
    webgl.raf = requestAnimationFrame(webglTick);
  }

  function initAll() {
    const orbs = document.querySelectorAll("[data-liquid-glass]");
    if (!orbs.length) return;

    const dark = isDarkMode();
    document.documentElement.classList.toggle("lg-dark", dark);

    // Mobile → WebGL (archis shader). Desktop unchanged below.
    if (isMobileLiquidGlass()) {
      initWebGLAll(orbs);
      return;
    }

    // Leaving mobile: drop WebGL surfaces if any
    if (webgl.active) teardownWebGL();

    const useSvgBackdrop = isChromiumSvgBackdrop();
    // Tint / rim / outer shadow come from CSS (light + prefers-color-scheme: dark).
    // JS only rebuilds the refraction filter graph for dark frosting/specular.
    document.documentElement.classList.toggle("lg-chrome", useSvgBackdrop);

    orbs.forEach((el) => {
      el.classList.remove("lg-webgl");
      const canvas = el.querySelector(":scope > canvas.lg-webgl-surface");
      if (canvas) canvas.remove();
      initOrb(el, useSvgBackdrop);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      requestAnimationFrame(() => requestAnimationFrame(initAll));
    });
  } else {
    requestAnimationFrame(() => requestAnimationFrame(initAll));
  }

  window.addEventListener(
    "resize",
    (() => {
      let t;
      return () => {
        clearTimeout(t);
        t = setTimeout(initAll, 150);
      };
    })()
  );

  // Rebuild glass when the OS / browser color scheme flips
  const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = () => requestAnimationFrame(() => requestAnimationFrame(initAll));
  if (typeof schemeQuery.addEventListener === "function") {
    schemeQuery.addEventListener("change", onSchemeChange);
  } else if (typeof schemeQuery.addListener === "function") {
    schemeQuery.addListener(onSchemeChange);
  }

  // Allow chatbot (and other UI) to rebuild filters after size/shape changes.
  window.reinitLiquidGlass = () => {
    requestAnimationFrame(() => requestAnimationFrame(initAll));
  };
})();
