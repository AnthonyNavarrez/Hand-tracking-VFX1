export const vertexShader = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform sampler2D uVideoTexture;
  uniform vec2 uResolution;
  uniform vec2 uStageSize;
  uniform vec2 uVideoSize;
  uniform float uOpacity;

  vec2 toSampleUV(vec2 screenUV, vec2 displayedSize, vec2 offset) {
    return (screenUV * uStageSize + offset) / displayedSize;
  }

  void main() {
    // Sample by screen position, same technique as the quad/sphere — each
    // particle acts like its own little window onto whatever video content
    // is directly behind it, so as it floats/orbits it keeps showing
    // whatever's now behind it rather than a fixed captured patch.
    vec2 screenUV = gl_FragCoord.xy / uResolution;

    float scale = max(uStageSize.x / uVideoSize.x, uStageSize.y / uVideoSize.y);
    vec2 displayedSize = uVideoSize * scale;
    vec2 offset = (displayedSize - uStageSize) * 0.5;

    vec2 mirroredScreenUV = vec2(1.0 - screenUV.x, screenUV.y);
    vec3 invertColor = 1.0 - texture2D(uVideoTexture, toSampleUV(mirroredScreenUV, displayedSize, offset)).rgb;

    gl_FragColor = vec4(invertColor, uOpacity);
  }
`;
