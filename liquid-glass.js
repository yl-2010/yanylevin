/**
 * Apple Liquid Glass orbs — faithful port of archisvaze/liquid-glass (SVG engine).
 * Source: https://github.com/archisvaze/liquid-glass (index.html)
 *
 * Chromium: physics displacement via backdrop-filter: url(#filter)
 * Other browsers: lucasromerodb turbulence displacement fallback (filter:url)
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

  function isDarkMode() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
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

  function initAll() {
    const orbs = document.querySelectorAll("[data-liquid-glass]");
    if (!orbs.length) return;

    const useSvgBackdrop = isChromiumSvgBackdrop();
    const dark = isDarkMode();
    // Tint / rim / outer shadow come from CSS (light + prefers-color-scheme: dark).
    // JS only rebuilds the refraction filter graph for dark frosting/specular.
    document.documentElement.classList.toggle("lg-chrome", useSvgBackdrop);
    document.documentElement.classList.toggle("lg-dark", dark);

    orbs.forEach((el) => initOrb(el, useSvgBackdrop));
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
