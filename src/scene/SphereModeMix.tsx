import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';

type SphereModeMixProps = {
  rightPinkyExtended: boolean;
  mixRef: RefObject<number>;
};

const MIX_FACTOR = 0.15; // same smoothing pace as LensQuad's hands-visible fade

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Owns the single shared "sphere mode" 0-1 value that drives the
 * quad-out/sphere-in crossfade, computed once here rather than
 * independently inside LensQuad and LensSphere — otherwise their two
 * fades could drift apart from separately-seeded smoothing state. Written
 * into a ref (not React state) so both meshes can read it every frame
 * from their own useFrame without forcing a re-render.
 */
export function SphereModeMix({ rightPinkyExtended, mixRef }: SphereModeMixProps) {
  useFrame(() => {
    const target = rightPinkyExtended ? 1 : 0;
    mixRef.current = lerp(mixRef.current, target, MIX_FACTOR);
  });

  return null;
}
