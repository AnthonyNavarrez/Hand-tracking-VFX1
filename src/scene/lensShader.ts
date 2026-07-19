export const vertexShader = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform sampler2D uVideoTexture;
  uniform vec2 uResolution;  // canvas resolution, device px (matches gl_FragCoord)
  uniform vec2 uStageSize;   // stage size, CSS px
  uniform vec2 uVideoSize;   // video's native intrinsic size, px
  uniform float uOpacity;

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
    vec2 sampleUV = (mirroredScreenUV * uStageSize + offset) / displayedSize;

    vec3 videoColor = texture2D(uVideoTexture, sampleUV).rgb;
    gl_FragColor = vec4(1.0 - videoColor, uOpacity);
  }
`;
