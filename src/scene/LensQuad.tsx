import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { vertexShader, fragmentShader } from './lensShader';
import type { Corners } from '../tracking/types';

type LensQuadProps = {
  corners: Corners;
  videoTexture: THREE.VideoTexture;
};

export function LensQuad({ corners, videoTexture }: LensQuadProps) {
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
    // r3f checks camera.manual by duck-typing; not part of three's own types.
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
        uniforms: {
          uVideoTexture: { value: videoTexture },
          uResolution: { value: new THREE.Vector2() },
        },
        // Corner winding depends on live, unpredictable hand positions (and
        // can bowtie if hands cross), so don't rely on a consistent
        // front-facing winding — render both sides.
        side: THREE.DoubleSide,
      }),
    [videoTexture],
  );

  useEffect(() => {
    material.uniforms.uResolution.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
  }, [material, size, viewport]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    return geo;
  }, []);

  useEffect(() => {
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const arr = position.array as Float32Array;
    const [lt, li, ri, rt] = corners;
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
    geometry.computeBoundingSphere();
  }, [geometry, corners]);

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
