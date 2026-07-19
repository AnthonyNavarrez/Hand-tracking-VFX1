import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { vertexShader, fragmentShader } from './lensShader';
import { config } from '../config';
import type { Corners } from '../tracking/types';
import type { Size } from '../tracking/corners';

type LensQuadProps = {
  targetCorners: Corners | null;
  videoTexture: THREE.VideoTexture;
  videoSize: Size;
};

const FADE_FACTOR = 0.15;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function LensQuad({ targetCorners, videoTexture, videoSize }: LensQuadProps) {
  const { camera, size, viewport } = useThree();

  // Map the orthographic camera 1:1 to screen-space pixels, top-left
  // origin, y-down — matching Corner space — so mesh vertices can be set
  // directly from screen-space corner points with no extra conversion.
  // `camera.manual = true` stops r3f's own resize handler from resetting
  // this to its default symmetric frustum; we then own calling
  // updateProjectionMatrix() ourselves on every change (r3f's built-in
  // "manual frustum via the camera prop" path only does this once, at the
  // moment it flips the manual flag, not on subsequent size changes).
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera & { manual?: boolean };
    cam.left = 0;
    cam.right = size.width;
    cam.top = 0;
    cam.bottom = size.height;
    cam.manual = true;
    cam.updateProjectionMatrix();
  }, [camera, size]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        // Corner winding depends on live, unpredictable hand positions (and
        // can bowtie if hands cross), so don't rely on a consistent
        // front-facing winding — render both sides.
        side: THREE.DoubleSide,
        uniforms: {
          uVideoTexture: { value: videoTexture },
          uResolution: { value: new THREE.Vector2() },
          uStageSize: { value: new THREE.Vector2() },
          uVideoSize: { value: new THREE.Vector2(videoSize.width, videoSize.height) },
          uOpacity: { value: 0 },
        },
      }),
    [videoTexture, videoSize.width, videoSize.height],
  );

  useEffect(() => {
    material.uniforms.uResolution.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
    material.uniforms.uStageSize.value.set(size.width, size.height);
  }, [material, size, viewport]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    return geo;
  }, []);

  // Smoothed corner positions persist across frames (a ref, not state) so
  // useFrame can lerp them every render frame regardless of how often new
  // tracking data arrives. Frozen (not reset) when hands leave, so the fade
  // in LensQuad's material shrinks the quad's opacity from its last known
  // position rather than snapping it away.
  const smoothedCornersRef = useRef<Corners | null>(null);

  useFrame(() => {
    if (targetCorners) {
      const prev = smoothedCornersRef.current;
      smoothedCornersRef.current = prev
        ? (prev.map((corner, i) => ({
            x: lerp(corner.x, targetCorners[i].x, config.smoothingFactor),
            y: lerp(corner.y, targetCorners[i].y, config.smoothingFactor),
          })) as Corners)
        : targetCorners; // snap on first acquisition, no lerp-in from nothing
    }

    const targetOpacity = targetCorners ? 1 : 0;
    material.uniforms.uOpacity.value = lerp(material.uniforms.uOpacity.value, targetOpacity, FADE_FACTOR);

    const smoothed = smoothedCornersRef.current;
    if (!smoothed) return;

    const position = geometry.attributes.position as THREE.BufferAttribute;
    const arr = position.array as Float32Array;
    const [lt, li, ri, rt] = smoothed;
    const set = (i: number, p: { x: number; y: number }) => {
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = 0;
    };
    // Two triangles per plan: (LT, LI, RI) and (LT, RI, RT).
    set(0, lt);
    set(1, li);
    set(2, ri);
    set(3, lt);
    set(4, ri);
    set(5, rt);
    position.needsUpdate = true;
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
