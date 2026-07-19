export const vertexShader = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform sampler2D uVideoTexture;
  uniform vec2 uResolution;   // canvas resolution, device px (matches gl_FragCoord)
  uniform vec2 uStageSize;    // stage size, CSS px
  uniform vec2 uVideoSize;    // video's native intrinsic size, px
  uniform float uOpacity;
  uniform float uEffectMix;   // 0 = sharp, 1 = pixelated (RI/RT pinch toggle)
  uniform float uPixelSize;   // pixelation block size, CSS px
  uniform float uDitherMix;   // 0 = none, 1 = full dither (LI/LT pinch toggle)
  uniform float uDitherLevels; // quantization levels per color channel
  uniform float uDitherCellSize; // CSS px per Bayer matrix cell
  uniform float uAberrationMix;   // 0 = normal invert, 1 = chromatic aberration, no invert (both thumbs above indices)
  uniform float uAberrationOffset; // max R/B channel sample split at the quad's edge, CSS px
  uniform vec2 uAberrationCenter;  // lens quad center, CSS px, mirrored screen space
  uniform float uTime;
  uniform float uAberrationDistortFrequency;
  uniform float uAberrationDistortSpeed;
  uniform float uAberrationDistortAmplitude;
  uniform float uPosterizeMix;    // 0 = none, 1 = full posterize (hands crossed)
  uniform float uPosterizeLevels; // tone bands (luminance-based, grayscale)

  vec2 toSampleUV(vec2 screenUV, vec2 displayedSize, vec2 offset) {
    return (screenUV * uStageSize + offset) / displayedSize;
  }

  // 4x4 ordered (Bayer) dither: quantizes color to uDitherLevels per
  // channel, offsetting the rounding by a per-pixel threshold from a
  // fixed tiled matrix so banding turns into a stippled halftone pattern
  // instead of flat color bands. Cell coordinates come from screen UV *
  // CSS px (not raw gl_FragCoord device px), so the pattern reads as
  // clearly visible blocks regardless of device pixel ratio.
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

  // Posterize/threshold: crushes color to a few flat luminance bands
  // (grayscale, not per-channel) for a bold, graphic, high-contrast look
  // — reads clearly against the normal feed outside the lens.
  vec3 posterize(vec3 color) {
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    float steps = max(uPosterizeLevels - 1.0, 1.0);
    float quantized = floor(luminance * steps + 0.5) / steps;
    return vec3(clamp(quantized, 0.0, 1.0));
  }

  // Chromatic aberration: sample R/G/B at screen UVs split radially
  // outward from the lens quad's own center (like a real lens flaw —
  // sharp in the middle, splitting more toward the edges) rather than a
  // flat uniform shift. Not inverted — this replaces the invert pipeline
  // rather than layering on top of it, per DECISION-adjacent spec
  // ("remove the inverted effect"). An animated ripple warps the sample
  // position first, scaled by uAberrationMix so it fades in/out together
  // with the aberration itself rather than being a separate trigger.
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
    vec2 screenUV = gl_FragCoord.xy / uResolution;

    // Replicate the background <video>'s CSS object-fit: cover crop so the
    // sampled texel matches what's actually displayed at this screen
    // position, then flip X for the CSS mirror (scaleX(-1)) per DECISION.
    // No Y flip needed: gl_FragCoord.y increases upward (screen top -> UV 1)
    // and VideoTexture's default flipY already puts the frame's top row at
    // UV 1, so the two agree.
    float scale = max(uStageSize.x / uVideoSize.x, uStageSize.y / uVideoSize.y);
    vec2 displayedSize = uVideoSize * scale;
    vec2 offset = (displayedSize - uStageSize) * 0.5;

    vec2 mirroredScreenUV = vec2(1.0 - screenUV.x, screenUV.y);

    // Pixelation: quantize screen UV to a coarse grid (CSS px, so block
    // size stays consistent on screen regardless of video crop/scale)
    // before mapping into video space. Both the invert and aberration
    // pipelines below sample through this, so pixelation stacks with
    // either one.
    vec2 gridCount = uStageSize / uPixelSize;
    vec2 pixelatedScreenUV = (floor(mirroredScreenUV * gridCount) + 0.5) / gridCount;

    vec3 invertSharp = 1.0 - texture2D(uVideoTexture, toSampleUV(mirroredScreenUV, displayedSize, offset)).rgb;
    vec3 invertPixelated = 1.0 - texture2D(uVideoTexture, toSampleUV(pixelatedScreenUV, displayedSize, offset)).rgb;
    vec3 invertColor = mix(invertSharp, invertPixelated, uEffectMix);

    vec3 aberrationSharp = chromaticAberration(mirroredScreenUV, displayedSize, offset);
    vec3 aberrationPixelated = chromaticAberration(pixelatedScreenUV, displayedSize, offset);
    vec3 aberrationColor = mix(aberrationSharp, aberrationPixelated, uEffectMix);

    vec3 baseColor = mix(invertColor, aberrationColor, uAberrationMix);

    // Posterize and dither each stack independently on top of whichever
    // fill resulted above, regardless of invert/aberration/pixelate state.
    vec3 posterizedColor = posterize(baseColor);
    vec3 postPosterizeColor = mix(baseColor, posterizedColor, uPosterizeMix);

    vec3 ditheredColor = orderedDither(postPosterizeColor, mirroredScreenUV);
    vec3 finalColor = mix(postPosterizeColor, ditheredColor, uDitherMix);

    gl_FragColor = vec4(finalColor, uOpacity);
  }
`;
