export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform sampler2D uVideoTexture;
  uniform float uOpacity;
  uniform vec3 uLightDir;
  uniform float uSphereRadius; // current on-screen radius, CSS px (camera is 1:1 orthographic) — used to size effect grids consistently regardless of hand-driven scale
  uniform float uEffectMix;   // 0 = sharp, 1 = pixelated (RI/RT pinch toggle)
  uniform float uPixelSize;   // pixelation block size, CSS px (equator-approximated)
  uniform float uDitherMix;   // 0 = none, 1 = full dither (LI/LT pinch toggle)
  uniform float uDitherLevels; // quantization levels per color channel
  uniform float uDitherCellSize; // CSS px per Bayer matrix cell (equator-approximated)
  uniform float uAberrationMix;   // 0 = normal invert, 1 = chromatic aberration, no invert (both thumbs above indices)
  uniform float uAberrationOffset; // max R/B channel sample split at the sphere's UV edge
  uniform float uTime;
  uniform float uAberrationDistortFrequency;
  uniform float uAberrationDistortSpeed;
  uniform float uAberrationDistortAmplitude;
  uniform float uPosterizeMix;    // 0 = none, 1 = full posterize (hands crossed)
  uniform float uPosterizeLevels; // tone bands (luminance-based, grayscale)

  varying vec2 vUv;
  varying vec3 vNormal;

  // 4x4 ordered (Bayer) dither, ported from the flat quad's screen-space
  // version: cell coordinates come from the sphere's own UV * a grid
  // density derived from uSphereRadius, so cells read as a roughly
  // consistent CSS-px size near the equator (same intent as the quad's
  // CSS-px cell size, translated to UV space — see plan's Core
  // architecture §5 and the accepted equirectangular-distortion caveat
  // near the poles).
  vec3 orderedDither(vec3 color, vec2 uv, vec2 cellCount) {
    mat4 bayer = mat4(
       0.0,  8.0,  2.0, 10.0,
      12.0,  4.0, 14.0,  6.0,
       3.0, 11.0,  1.0,  9.0,
      15.0,  7.0, 13.0,  5.0
    ) / 16.0;
    vec2 cell = floor(uv * cellCount);
    int x = int(mod(cell.x, 4.0));
    int y = int(mod(cell.y, 4.0));
    float threshold = bayer[x][y];

    vec3 levels = vec3(max(uDitherLevels - 1.0, 1.0));
    vec3 scaled = color * levels;
    return clamp(floor(scaled + threshold) / levels, 0.0, 1.0);
  }

  // Posterize/threshold — identical to the flat quad's version, no UV
  // dependency to translate.
  vec3 posterize(vec3 color) {
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    float steps = max(uPosterizeLevels - 1.0, 1.0);
    float quantized = floor(luminance * steps + 0.5) / steps;
    return vec3(clamp(quantized, 0.0, 1.0));
  }

  // Chromatic aberration, ported from the quad's screen-space/lens-center
  // version to the sphere's own UV space: radiates from the UV square's
  // center (0.5, 0.5) — the sphere's own "front center" in its unwrap —
  // rather than a screen-space lens center, since the sphere rotates and
  // has no fixed screen-space center of its own surface. Same ripple
  // technique, same not-inverted replacement of the invert pipeline.
  vec3 chromaticAberration(vec2 uv, float uvSplitMagnitude) {
    vec2 ripple = vec2(
      sin(uv.y * uAberrationDistortFrequency + uTime * uAberrationDistortSpeed),
      cos(uv.x * uAberrationDistortFrequency + uTime * uAberrationDistortSpeed)
    ) * uAberrationDistortAmplitude * uAberrationMix;
    vec2 rippledUV = uv + ripple;

    vec2 fromCenter = rippledUV - vec2(0.5);
    float dist = length(fromCenter);
    vec2 dir = dist > 0.0001 ? normalize(fromCenter) : vec2(1.0, 0.0);
    vec2 splitUV = dir * uvSplitMagnitude * dist;

    float r = texture2D(uVideoTexture, rippledUV + splitUV).r;
    float g = texture2D(uVideoTexture, rippledUV).g;
    float b = texture2D(uVideoTexture, rippledUV - splitUV).b;
    return vec3(r, g, b);
  }

  void main() {
    // Sample by surface UV (mirrored on X, same convention as the flat
    // quad), not screen position — required for rotation to visibly move
    // the video content across the surface.
    vec2 mirroredUv = vec2(1.0 - vUv.x, vUv.y);

    // Grid density for pixelation/dither, derived from the sphere's
    // current on-screen radius so block/cell size reads as a roughly
    // consistent CSS-px size near the equator regardless of how large or
    // small the hand-driven sphere currently is.
    float circumferenceU = 6.28318530718 * uSphereRadius;
    float circumferenceV = 3.14159265359 * uSphereRadius;
    vec2 pixelGridCount = max(vec2(circumferenceU, circumferenceV) / uPixelSize, vec2(1.0));
    vec2 ditherCellCount = max(vec2(circumferenceU, circumferenceV) / uDitherCellSize, vec2(1.0));

    vec2 pixelatedUv = (floor(mirroredUv * pixelGridCount) + 0.5) / pixelGridCount;

    vec3 invertSharp = 1.0 - texture2D(uVideoTexture, mirroredUv).rgb;
    vec3 invertPixelated = 1.0 - texture2D(uVideoTexture, pixelatedUv).rgb;
    vec3 invertColor = mix(invertSharp, invertPixelated, uEffectMix);

    float uvSplitMagnitude = uAberrationOffset / max(circumferenceU, 1.0);
    vec3 aberrationSharp = chromaticAberration(mirroredUv, uvSplitMagnitude);
    vec3 aberrationPixelated = chromaticAberration(pixelatedUv, uvSplitMagnitude);
    vec3 aberrationColor = mix(aberrationSharp, aberrationPixelated, uEffectMix);

    vec3 baseColor = mix(invertColor, aberrationColor, uAberrationMix);

    vec3 posterizedColor = posterize(baseColor);
    vec3 postPosterizeColor = mix(baseColor, posterizedColor, uPosterizeMix);

    vec3 ditheredColor = orderedDither(postPosterizeColor, mirroredUv, ditherCellCount);
    vec3 finalColor = mix(postPosterizeColor, ditheredColor, uDitherMix);

    // Fixed-direction Lambertian term with an ambient floor so the far
    // side of the sphere reads as shaded, not pure black.
    float diffuse = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
    float lightTerm = mix(0.35, 1.0, diffuse);

    gl_FragColor = vec4(finalColor * lightTerm, uOpacity);
  }
`;
