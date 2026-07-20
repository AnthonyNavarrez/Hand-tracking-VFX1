export const vertexShader = /* glsl */ `
  varying vec3 vNormal;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform sampler2D uVideoTexture;
  uniform vec2 uResolution;   // canvas resolution, device px (matches gl_FragCoord)
  uniform vec2 uStageSize;    // stage size, CSS px
  uniform vec2 uVideoSize;    // video's native intrinsic size, px
  uniform float uOpacity;     // hands-visible fade * sphere-mode crossfade mix
  uniform float uSurfaceOpacity; // fixed translucency so the raw video behind the sphere shows through
  uniform vec3 uLightDir;
  uniform float uEffectMix;   // 0 = sharp, 1 = pixelated (RI/RT pinch toggle)
  uniform float uPixelSize;   // pixelation block size, CSS px
  uniform float uDitherMix;   // 0 = none, 1 = full dither (LI/LT pinch toggle)
  uniform float uDitherLevels; // quantization levels per color channel
  uniform float uDitherCellSize; // CSS px per Bayer matrix cell
  uniform float uAberrationMix;   // 0 = normal invert, 1 = chromatic aberration, no invert (left thumb above left index)
  uniform float uAberrationOffset; // max R/B channel sample split at the sphere's screen radius, CSS px
  uniform vec2 uAberrationCenter;  // sphere center, CSS px, mirrored screen space
  uniform float uSwirlAngle;      // radians — rotates the sample point around the sphere's center, same angle driving uLightDir's orbit
  uniform float uTime;
  uniform float uAberrationDistortFrequency;
  uniform float uAberrationDistortSpeed;
  uniform float uAberrationDistortAmplitude;
  uniform float uPosterizeMix;    // 0 = none, 1 = full posterize (hands crossed)
  uniform float uPosterizeLevels; // tone bands (luminance-based, grayscale)
  uniform float uSaturationMix;   // 0 = none, 1 = full super-saturation + hue shift (LI/RI touch toggle)
  uniform float uSaturationBoost; // multiplier on the HSV saturation channel
  uniform float uSaturationHueShift; // hue rotation, fraction of the full wheel (0-1)
  uniform float uFisheyeStrength; // barrel-distortion strength, fades in/out with uSaturationMix

  varying vec3 vNormal;

  vec2 toSampleUV(vec2 screenUV, vec2 displayedSize, vec2 offset) {
    return (screenUV * uStageSize + offset) / displayedSize;
  }

  // 4x4 ordered (Bayer) dither — identical technique to the flat quad's
  // version, same screen-space cell coordinates so block size matches
  // exactly between the two.
  vec3 orderedDither(vec3 color, vec2 screenUV) {
    mat4 bayer = mat4(
       0.0,  8.0,  2.0, 10.0,
      12.0,  4.0, 14.0,  6.0,
       3.0, 11.0,  1.0,  9.0,
      15.0,  7.0, 13.0,  5.0
    ) / 16.0;
    vec2 cell = floor(screenUV * uStageSize / uDitherCellSize);
    int x = int(mod(cell.x, 4.0));
    int y = int(mod(cell.y, 4.0));
    float threshold = bayer[x][y];

    vec3 levels = vec3(max(uDitherLevels - 1.0, 1.0));
    vec3 scaled = color * levels;
    return clamp(floor(scaled + threshold) / levels, 0.0, 1.0);
  }

  // Posterize/threshold — identical to the flat quad's version.
  vec3 posterize(vec3 color) {
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    float steps = max(uPosterizeLevels - 1.0, 1.0);
    float quantized = floor(luminance * steps + 0.5) / steps;
    return vec3(clamp(quantized, 0.0, 1.0));
  }

  // Standard RGB<->HSV conversion — identical technique to the flat
  // quad's version.
  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // Super-saturation + slight hue shift — identical technique to the flat
  // quad's version.
  vec3 superSaturate(vec3 color) {
    vec3 hsv = rgb2hsv(color);
    hsv.x = fract(hsv.x + uSaturationHueShift);
    hsv.y = clamp(hsv.y * uSaturationBoost, 0.0, 1.0);
    return hsv2rgb(hsv);
  }

  // Fisheye/barrel distortion — identical technique to the flat quad's
  // version, radiating from the sphere's own screen-space center.
  vec2 fisheyeWarp(vec2 uv, vec2 centerPx, float strength) {
    vec2 fromCenterPx = uv * uStageSize - centerPx;
    float halfExtent = max(uStageSize.x, uStageSize.y) * 0.5;
    vec2 normalized = fromCenterPx / halfExtent;
    float r2 = dot(normalized, normalized);
    vec2 distortedPx = normalized * (1.0 + strength * r2) * halfExtent + centerPx;
    return distortedPx / uStageSize;
  }

  // Chromatic aberration — identical technique to the flat quad's version,
  // radiating from the sphere's own screen-space center (its position,
  // same centroid the quad's corners average to).
  vec3 chromaticAberration(vec2 screenUV, vec2 displayedSize, vec2 offset) {
    vec2 ripple = vec2(
      sin(screenUV.y * uAberrationDistortFrequency + uTime * uAberrationDistortSpeed),
      cos(screenUV.x * uAberrationDistortFrequency + uTime * uAberrationDistortSpeed)
    ) * uAberrationDistortAmplitude * uAberrationMix;
    vec2 rippledUV = screenUV + ripple;

    vec2 fromCenterPx = rippledUV * uStageSize - uAberrationCenter;
    float dist = length(fromCenterPx) / max(uStageSize.x, uStageSize.y);
    vec2 dir = length(fromCenterPx) > 0.0001 ? normalize(fromCenterPx) : vec2(1.0, 0.0);
    vec2 splitUV = dir * uAberrationOffset * dist / uStageSize;

    float r = texture2D(uVideoTexture, toSampleUV(rippledUV + splitUV, displayedSize, offset)).r;
    float g = texture2D(uVideoTexture, toSampleUV(rippledUV, displayedSize, offset)).g;
    float b = texture2D(uVideoTexture, toSampleUV(rippledUV - splitUV, displayedSize, offset)).b;
    return vec3(r, g, b);
  }

  void main() {
    // Sample by screen position (like the flat quad), not surface UV —
    // this is what makes the sphere read as "the part of the video
    // that's right behind it," and (combined with uSurfaceOpacity below)
    // lets the raw video show through. Trade-off: rotation no longer
    // moves video content across the surface, only the lighting does.
    vec2 screenUV = gl_FragCoord.xy / uResolution;

    float scale = max(uStageSize.x / uVideoSize.x, uStageSize.y / uVideoSize.y);
    vec2 displayedSize = uVideoSize * scale;
    vec2 offset = (displayedSize - uStageSize) * 0.5;

    vec2 mirroredScreenUV = vec2(1.0 - screenUV.x, screenUV.y);

    // Swirl: rotate the sample point around the sphere's own screen-space
    // center (same center chromatic aberration radiates from) by the same
    // angle driving the orbiting light, so the fill visibly spins in sync
    // with the lighting rather than sitting screen-locked. Done in actual
    // CSS px (not raw UV) so the rotation traces a true circle regardless
    // of the stage's aspect ratio.
    vec2 fromCenterPx = mirroredScreenUV * uStageSize - uAberrationCenter;
    float swirlCos = cos(uSwirlAngle);
    float swirlSin = sin(uSwirlAngle);
    vec2 swirledPx = vec2(
      fromCenterPx.x * swirlCos - fromCenterPx.y * swirlSin,
      fromCenterPx.x * swirlSin + fromCenterPx.y * swirlCos
    );
    mirroredScreenUV = (uAberrationCenter + swirledPx) / uStageSize;

    // Fisheye POV: kicks in together with the super-saturation toggle
    // (same LI/RI touch), warping the sample point before anything else
    // reads it so pixelation/invert/aberration/dither all see the
    // distorted view too.
    vec2 fisheyeScreenUV = fisheyeWarp(mirroredScreenUV, uAberrationCenter, uFisheyeStrength);
    mirroredScreenUV = mix(mirroredScreenUV, fisheyeScreenUV, uSaturationMix);

    vec2 gridCount = uStageSize / uPixelSize;
    vec2 pixelatedScreenUV = (floor(mirroredScreenUV * gridCount) + 0.5) / gridCount;

    vec3 invertSharp = 1.0 - texture2D(uVideoTexture, toSampleUV(mirroredScreenUV, displayedSize, offset)).rgb;
    vec3 invertPixelated = 1.0 - texture2D(uVideoTexture, toSampleUV(pixelatedScreenUV, displayedSize, offset)).rgb;
    vec3 invertColor = mix(invertSharp, invertPixelated, uEffectMix);

    vec3 aberrationSharp = chromaticAberration(mirroredScreenUV, displayedSize, offset);
    vec3 aberrationPixelated = chromaticAberration(pixelatedScreenUV, displayedSize, offset);
    vec3 aberrationColor = mix(aberrationSharp, aberrationPixelated, uEffectMix);

    vec3 baseColor = mix(invertColor, aberrationColor, uAberrationMix);

    vec3 saturatedColor = superSaturate(baseColor);
    vec3 postSaturationColor = mix(baseColor, saturatedColor, uSaturationMix);

    vec3 posterizedColor = posterize(postSaturationColor);
    vec3 postPosterizeColor = mix(postSaturationColor, posterizedColor, uPosterizeMix);

    vec3 ditheredColor = orderedDither(postPosterizeColor, mirroredScreenUV);
    vec3 finalColor = mix(postPosterizeColor, ditheredColor, uDitherMix);

    // Lambertian term with an ambient floor so the far side reads as
    // shaded, not pure black. uLightDir orbits over time (see LensSphere)
    // rather than being fixed — a smooth sphere is rotationally symmetric,
    // so spinning the mesh itself with a fixed light is invisible; an
    // orbiting light sweeps the shading band around instead, which is
    // what actually reads as "this is spinning."
    float diffuse = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
    float lightTerm = mix(0.35, 1.0, diffuse);

    // Rim/fresnel highlight so the sphere reads as curved even where the
    // diffuse term is weak (especially once blended with the background
    // at partial opacity). View-space convention: the camera looks down
    // -Z, so a front-facing normal has NEGATIVE z — "facing" here flips
    // that sign back to positive (1 = dead center, 0 = grazing edge).
    float facing = max(-vNormal.z, 0.0);
    float rim = pow(1.0 - facing, 3.0);
    lightTerm = clamp(lightTerm + rim * 0.6, 0.0, 1.4);

    gl_FragColor = vec4(finalColor * lightTerm, uOpacity * uSurfaceOpacity);
  }
`;
