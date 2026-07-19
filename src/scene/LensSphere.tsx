import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { vertexShader, fragmentShader } from './sphereShader';
import { config } from '../config';
import type { Corners } from '../tracking/types';

type LensSphereProps = {
  targetCorners: Corners | null;
  videoTexture: THREE.VideoTexture;
  // Shared 0-1 crossfade value (1 = fully sphere mode) owned by
  // SphereModeMix — multiplies this sphere's own hands-visible opacity so
  // it fades in as LensQuad fades out. Already encodes the right-pinky
  // gesture, so this component doesn't need that boolean directly.
  sphereModeMixRef: RefObject<number>;
};

const ROTATION_SPEED = 0.4; // radians/sec, constant Y-axis spin, not tied to hand movement
const LIGHT_DIR: [number, number, number] = [0.4, 0.6, 1.0];
const FADE_FACTOR = 0.15; // same pace as LensQuad's hands-visible fade
const EFFECT_MIX_FACTOR = 0.2; // same pace as LensQuad's effect-gesture fades

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function LensSphere({ targetCorners, videoTexture, sphereModeMixRef }: LensSphereProps) {
  const { camera, size } = useThree();

  // Same orthographic-frustum-in-CSS-px sync as LensQuad, duplicated here
  // (not imported from LensQuad) so this component stays fully
  // self-contained, per the "must not affect existing features"
  // constraint. Idempotent if both run.
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera & { manual?: boolean };
    cam.left = 0;
    cam.right = size.width;
    cam.top = 0;
    cam.bottom = size.height;
    cam.manual = true;
    cam.updateProjectionMatrix();
  }, [camera, size]);

  // Smooth sphere — clean equirectangular UVs, no polyhedron seams/
  // stretching to worry about.
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 48, 32), []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        uniforms: {
          uVideoTexture: { value: videoTexture },
          uOpacity: { value: 0 },
          uLightDir: { value: new THREE.Vector3(...LIGHT_DIR) },
          uSphereRadius: { value: 1 },
          uEffectMix: { value: 0 },
          uPixelSize: { value: config.pixelateBlockSize },
          uDitherMix: { value: 0 },
          uDitherLevels: { value: config.ditherLevels },
          uDitherCellSize: { value: config.ditherCellSize },
          uAberrationMix: { value: 0 },
          uAberrationOffset: { value: config.aberrationOffset },
          uTime: { value: 0 },
          uAberrationDistortFrequency: { value: config.aberrationDistortFrequency },
          uAberrationDistortSpeed: { value: config.aberrationDistortSpeed },
          uAberrationDistortAmplitude: { value: config.aberrationDistortAmplitude },
          uPosterizeMix: { value: 0 },
          uPosterizeLevels: { value: config.posterizeLevels },
        },
      }),
    [videoTexture],
  );

  const meshRef = useRef<THREE.Mesh>(null);

  // Smoothed corners/radius persist across frames (refs, not state) so
  // useFrame can lerp them every render frame — same technique as
  // LensQuad's own smoothedCornersRef, duplicated (not shared) per
  // DECISION so LensQuad stays untouched.
  const smoothedCornersRef = useRef<Corners | null>(null);
  const radiusRef = useRef<number | null>(null);
  const handsOpacityRef = useRef(0);

  // Duplicated copies of LensQuad's four effect-gesture state refs (see
  // plan §5: kept as separate state rather than a shared hook so LensQuad
  // stays untouched; both read the same smoothed corner positions with
  // the same smoothing factors, so the two copies track each other
  // essentially exactly).
  const effectMixRef = useRef(0);
  const isRightPinchTouchingRef = useRef(false);
  const pixelateEnabledRef = useRef(false);
  const ditherMixRef = useRef(0);
  const isLeftPinchTouchingRef = useRef(false);
  const ditherEnabledRef = useRef(false);
  const aberrationMixRef = useRef(0);
  const posterizeMixRef = useRef(0);

  useFrame((state, delta) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;

    if (meshRef.current) meshRef.current.rotation.y += ROTATION_SPEED * delta;

    if (targetCorners) {
      const prev = smoothedCornersRef.current;
      smoothedCornersRef.current = prev
        ? (prev.map((corner, i) => ({
            x: lerp(corner.x, targetCorners[i].x, config.smoothingFactor),
            y: lerp(corner.y, targetCorners[i].y, config.smoothingFactor),
          })) as Corners)
        : targetCorners; // snap on first acquisition, no lerp-in from nothing
    }

    const smoothed = smoothedCornersRef.current;

    // Same hands-visible fade as LensQuad, further multiplied by the
    // shared sphere-mode mix — so this mesh only reads visible when both
    // "hands present" and "correct mode" hold, and the two meshes
    // dissolve into each other rather than popping.
    const targetOpacity = targetCorners ? 1 : 0;
    handsOpacityRef.current = lerp(handsOpacityRef.current, targetOpacity, FADE_FACTOR);
    material.uniforms.uOpacity.value = handsOpacityRef.current * sphereModeMixRef.current;

    if (!smoothed || !meshRef.current) return;

    const [lt, li, ri, rt] = smoothed;
    const centroidX = (lt.x + li.x + ri.x + rt.x) / 4;
    const centroidY = (lt.y + li.y + ri.y + rt.y) / 4;

    // Radius = average corner-to-centroid distance (corner spread), scaled
    // and smoothed the same way as everything else so growing/shrinking is
    // fluid, not jumpy.
    const avgDist =
      (Math.hypot(lt.x - centroidX, lt.y - centroidY) +
        Math.hypot(li.x - centroidX, li.y - centroidY) +
        Math.hypot(ri.x - centroidX, ri.y - centroidY) +
        Math.hypot(rt.x - centroidX, rt.y - centroidY)) /
      4;
    const targetRadius = avgDist * config.sphereRadiusScale;
    radiusRef.current =
      radiusRef.current === null ? targetRadius : lerp(radiusRef.current, targetRadius, config.smoothingFactor);

    meshRef.current.position.set(centroidX, centroidY, 0);
    meshRef.current.scale.setScalar(radiusRef.current);
    material.uniforms.uSphereRadius.value = radiusRef.current;

    // RI/RT pinch toggles pixelate, tap not hold — identical gesture/
    // hysteresis logic to LensQuad, duplicated per DECISION §5.
    const rightPinchDistance = Math.hypot(ri.x - rt.x, ri.y - rt.y);
    const { pixelatePinchOnDistance, pixelatePinchOffDistance } = config;
    if (!isRightPinchTouchingRef.current && rightPinchDistance < pixelatePinchOnDistance) {
      isRightPinchTouchingRef.current = true;
      pixelateEnabledRef.current = !pixelateEnabledRef.current;
    } else if (isRightPinchTouchingRef.current && rightPinchDistance > pixelatePinchOffDistance) {
      isRightPinchTouchingRef.current = false;
    }

    const targetEffectMix = pixelateEnabledRef.current ? 1 : 0;
    effectMixRef.current = lerp(effectMixRef.current, targetEffectMix, EFFECT_MIX_FACTOR);
    material.uniforms.uEffectMix.value = effectMixRef.current;

    // LI/LT pinch toggles ordered-dither, tap not hold — independent of
    // the pixelate toggle above.
    const leftPinchDistance = Math.hypot(lt.x - li.x, lt.y - li.y);
    const { ditherPinchOnDistance, ditherPinchOffDistance } = config;
    if (!isLeftPinchTouchingRef.current && leftPinchDistance < ditherPinchOnDistance) {
      isLeftPinchTouchingRef.current = true;
      ditherEnabledRef.current = !ditherEnabledRef.current;
    } else if (isLeftPinchTouchingRef.current && leftPinchDistance > ditherPinchOffDistance) {
      isLeftPinchTouchingRef.current = false;
    }

    const targetDitherMix = ditherEnabledRef.current ? 1 : 0;
    ditherMixRef.current = lerp(ditherMixRef.current, targetDitherMix, EFFECT_MIX_FACTOR);
    material.uniforms.uDitherMix.value = ditherMixRef.current;

    // Chromatic aberration — held pose, both thumbs above their own
    // hand's index tip.
    const { aberrationPoseMargin } = config;
    const rightThumbAboveIndex = ri.y - rt.y > aberrationPoseMargin;
    const leftThumbAboveIndex = li.y - lt.y > aberrationPoseMargin;
    const targetAberrationMix = rightThumbAboveIndex && leftThumbAboveIndex ? 1 : 0;
    aberrationMixRef.current = lerp(aberrationMixRef.current, targetAberrationMix, EFFECT_MIX_FACTOR);
    material.uniforms.uAberrationMix.value = aberrationMixRef.current;

    // Posterize — held pose, hands crossed.
    const { posterizeCrossMargin } = config;
    const rightHandCenterX = (ri.x + rt.x) / 2;
    const leftHandCenterX = (li.x + lt.x) / 2;
    const handsCrossed = rightHandCenterX < leftHandCenterX - posterizeCrossMargin;
    const targetPosterizeMix = handsCrossed ? 1 : 0;
    posterizeMixRef.current = lerp(posterizeMixRef.current, targetPosterizeMix, EFFECT_MIX_FACTOR);
    material.uniforms.uPosterizeMix.value = posterizeMixRef.current;
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
}
