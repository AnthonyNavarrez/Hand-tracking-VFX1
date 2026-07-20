import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { config } from '../config';

type HandOpenMixProps = {
  leftHandOpen: boolean;
  mixRef: RefObject<number>;
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Owns the single shared "hand-open mode" 0-1 value that drives the
 * quad/sphere-out, particle-field-in crossfade — computed once here
 * (same pattern as SphereModeMix) rather than independently inside
 * LensQuad/LensSphere/ParticleField, so all three read the exact same
 * smoothed value instead of risking drift from separately-seeded state.
 */
export function HandOpenMix({ leftHandOpen, mixRef }: HandOpenMixProps) {
  useFrame(() => {
    const target = leftHandOpen ? 1 : 0;
    mixRef.current = lerp(mixRef.current, target, config.handOpenFadeFactor);
  });

  return null;
}
