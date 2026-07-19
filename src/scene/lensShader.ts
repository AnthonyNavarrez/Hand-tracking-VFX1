export const vertexShader = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  uniform sampler2D uVideoTexture;
  uniform vec2 uResolution;

  void main() {
    vec2 screenUV = gl_FragCoord.xy / uResolution;

    // uVideoTexture holds the raw (unmirrored) camera frame, but the
    // background <video> is displayed mirrored (CSS scaleX(-1)) per
    // DECISION, so flip X to sample the pixel actually shown at this
    // screen position. No Y flip needed: gl_FragCoord.y increases upward
    // (screen top -> UV 1) and VideoTexture's default flipY already puts
    // the frame's top row at UV 1, so the two agree.
    vec2 sampleUV = vec2(1.0 - screenUV.x, screenUV.y);
    vec3 videoColor = texture2D(uVideoTexture, sampleUV).rgb;

    gl_FragColor = vec4(1.0 - videoColor, 1.0);
  }
`;
