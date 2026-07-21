import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { vertexShader, fragmentShader } from './sphereShader';
import { config } from '../config';
import type { Corners } from '../tracking/types';
import type { Size } from '../tracking/corners';

type LensSphereProps = {
  targetCorners: Corners | null;
  videoTexture: THREE.VideoTexture;
  videoSize: Size;
  // Right hand open (all 5 fingers extended) expands the sphere to fill
  // the screen instead of sizing from corner spread.
  rightHandOpen: boolean;
  // While true (and leftHandOpen is false), the sphere's rotation follows
  // leftHandAngle instead of auto-spinning at a constant rate.
  leftPinkyExtended: boolean;
  // Left hand fully open takes priority over pinky-only rotation-follow
  // (an open hand always also satisfies "pinky up") — ParticleField owns
  // the ring-rotation behavior in that case instead.
  leftHandOpen: boolean;
  // Screen-space angle (radians) of the left hand's wrist-to-pinky-tip
  // direction, or null if the left hand isn't tracked.
  leftHandAngle: number | null;
  // Shared 0-1 crossfade value (1 = fully sphere mode) owned by
  // SphereModeMix — multiplies this sphere's own hands-visible opacity so
  // it fades in as LensQuad fades out. Already encodes the right-pinky
  // gesture, so this component doesn't need that boolean directly.
  sphereModeMixRef: RefObject<number>;
  // Shared 0-1 crossfade value (1 = fully particle-field mode) owned by
  // HandOpenMix — multiplies this sphere's own opacity so it fades out as
  // ParticleField's circles fade in. At 0 (left hand never opened) this
  // is a no-op multiplier.
  handOpenMixRef: RefObject<number>;
};

const ROTATION_SPEED = 0.4; // radians/sec — orbits uLightDir around Y (see below), not tied to hand movement
const LIGHT_ORBIT_Y = 0.6; // fixed vertical component of the orbiting light direction
const LIGHT_ORBIT_RADIUS = 1.0; // horizontal (XZ) extent of the orbiting light direction
const FADE_FACTOR = 0.15; // same pace as LensQuad's hands-visible fade
const EFFECT_MIX_FACTOR = 0.2; // same pace as LensQuad's effect-gesture fades

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Shortest signed distance from b to a, wrapped into (-pi, pi]. Uses
// Math.floor (not JS's %, which keeps the dividend's sign for negatives)
// so it's correct regardless of how large/negative either angle is.
function angleDelta(a: number, b: number): number {
  const twoPi = Math.PI * 2;
  const diff = a - b;
  return diff - twoPi * Math.floor((diff + Math.PI) / twoPi);
}

export function LensSphere({
  targetCorners,
  videoTexture,
  videoSize,
  rightHandOpen,
  leftPinkyExtended,
  leftHandOpen,
  leftHandAngle,
  sphereModeMixRef,
  handOpenMixRef,
}: LensSphereProps) {
  const { camera, size, viewport } = useThree();

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

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 48, 32), []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        // Visibility here is entirely managed via uOpacity/mesh.visible,
        // not the depth buffer — without this, the mesh (which bulges
        // toward the camera) still writes depth even while fully
        // transparent, silently occluding other transparent content
        // (quad, particles) behind it at the same screen position.
        depthWrite: false,
        uniforms: {
          uVideoTexture: { value: videoTexture },
          uResolution: { value: new THREE.Vector2() },
          uStageSize: { value: new THREE.Vector2() },
          uVideoSize: { value: new THREE.Vector2(videoSize.width, videoSize.height) },
          uOpacity: { value: 0 },
          uSurfaceOpacity: { value: config.sphereSurfaceOpacity },
          uLightDir: { value: new THREE.Vector3(0, LIGHT_ORBIT_Y, -LIGHT_ORBIT_RADIUS) },
          uEffectMix: { value: 0 },
          uPixelSize: { value: config.pixelateBlockSize },
          uDitherMix: { value: 0 },
          uDitherLevels: { value: config.ditherLevels },
          uDitherCellSize: { value: config.ditherCellSize },
          uAberrationMix: { value: 0 },
          uAberrationOffset: { value: config.aberrationOffset },
          uAberrationCenter: { value: new THREE.Vector2() },
          uSwirlAngle: { value: 0 },
          uTime: { value: 0 },
          uAberrationDistortFrequency: { value: config.aberrationDistortFrequency },
          uAberrationDistortSpeed: { value: config.aberrationDistortSpeed },
          uAberrationDistortAmplitude: { value: config.aberrationDistortAmplitude },
          uPosterizeMix: { value: 0 },
          uPosterizeLevels: { value: config.posterizeLevels },
          uSaturationMix: { value: 0 },
          uSaturationBoost: { value: config.saturationBoost },
          uSaturationHueShift: { value: config.saturationHueShift },
          uFisheyeStrength: { value: config.fisheyeStrength },
        },
      }),
    [videoTexture, videoSize.width, videoSize.height],
  );

  useEffect(() => {
    material.uniforms.uResolution.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
    material.uniforms.uStageSize.value.set(size.width, size.height);
  }, [material, size, viewport]);

  const meshRef = useRef<THREE.Mesh>(null);

  // Smoothed corners/radius persist across frames (refs, not state) so
  // useFrame can lerp them every render frame — same technique as
  // LensQuad's own smoothedCornersRef, duplicated (not shared) per
  // DECISION so LensQuad stays untouched.
  const smoothedCornersRef = useRef<Corners | null>(null);
  const radiusRef = useRef<number | null>(null);
  const handsOpacityRef = useRef(0);
  // Persistent rotation angle (not recomputed from scratch each frame) so
  // switching between hand-following and auto-spin never pops — auto-spin
  // resumes from wherever hand-following left it, and vice versa.
  const angleRef = useRef(0);
  // Reference points captured the instant the left pinky goes up, so
  // hand-following starts from a zero delta (continues exactly from the
  // sphere's current angle) instead of snapping to the hand's raw
  // absolute angle, which bears no relation to wherever auto-spin left
  // the sphere.
  const wasFollowingHandRef = useRef(false);
  const handAngleAtArmRef = useRef(0);
  const sphereAngleAtArmRef = useRef(0);

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
  const isIndexTouchingRef = useRef(false);
  const saturationEnabledRef = useRef(false);
  const saturationMixRef = useRef(0);

  useFrame((state, delta) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;

    // A smooth sphere is rotationally symmetric, so spinning the mesh
    // itself is invisible now that the video is sampled by screen
    // position (not surface UV) — every point has an identical twin
    // elsewhere with the same normal after any rotation. Orbiting the
    // light direction instead sweeps the shading band around the sphere,
    // which is what actually reads as "this is spinning."
    //
    // While the left pinky is up (and the hand isn't fully open — that
    // takes priority and hands rotation-follow off to ParticleField's
    // ring instead), that orbit angle follows the *change* in the hand's
    // wrist-to-pinky-tip angle since the pinky went up — not the hand's
    // raw absolute angle, which bears no relation to wherever auto-spin
    // left the sphere and would otherwise cause a jump/reset the instant
    // the gesture engages. Lowering the pinky resumes the constant
    // auto-spin from wherever hand-following left the angle.
    if (leftPinkyExtended && !leftHandOpen && leftHandAngle !== null) {
      if (!wasFollowingHandRef.current) {
        // Just armed: freeze the reference points so the very first
        // hand-following frame has zero delta (no reset/pop).
        handAngleAtArmRef.current = leftHandAngle;
        sphereAngleAtArmRef.current = angleRef.current;
        wasFollowingHandRef.current = true;
      }
      const handDelta = angleDelta(leftHandAngle, handAngleAtArmRef.current);
      const target = sphereAngleAtArmRef.current + handDelta;
      angleRef.current += angleDelta(target, angleRef.current) * config.smoothingFactor;
    } else {
      angleRef.current += ROTATION_SPEED * delta;
      wasFollowingHandRef.current = false;
    }
    const orbitAngle = angleRef.current;

    // Z is negated: view space has the camera looking down -Z, so a light
    // roughly on the camera's side of the sphere needs a negative Z
    // component to produce positive dot products against front-facing
    // (negative-Z) normals.
    material.uniforms.uLightDir.value.set(
      Math.sin(orbitAngle) * LIGHT_ORBIT_RADIUS,
      LIGHT_ORBIT_Y,
      -Math.cos(orbitAngle) * LIGHT_ORBIT_RADIUS,
    );
    // Same angle drives the screen-space swirl (see sphereShader.ts) so
    // the fill visibly spins in sync with the lighting.
    material.uniforms.uSwirlAngle.value = orbitAngle;

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
    material.uniforms.uOpacity.value =
      handsOpacityRef.current * sphereModeMixRef.current * (1 - handOpenMixRef.current);
    if (meshRef.current) meshRef.current.visible = handOpenMixRef.current < 0.98;

    if (!smoothed || !meshRef.current) return;

    const [lt, li, ri, rt] = smoothed;
    const centroidX = (lt.x + li.x + ri.x + rt.x) / 4;
    const centroidY = (lt.y + li.y + ri.y + rt.y) / 4;

    // Radius = average corner-to-centroid distance (corner spread), scaled
    // and smoothed the same way as everything else so growing/shrinking is
    // fluid, not jumpy. Left hand open overrides this with the screen
    // diagonal instead — large enough to fully cover the viewport
    // regardless of where the sphere's center currently sits, since the
    // farthest any on-screen point can be from any other is the diagonal.
    const avgDist =
      (Math.hypot(lt.x - centroidX, lt.y - centroidY) +
        Math.hypot(li.x - centroidX, li.y - centroidY) +
        Math.hypot(ri.x - centroidX, ri.y - centroidY) +
        Math.hypot(rt.x - centroidX, rt.y - centroidY)) /
      4;
    const screenDiagonal = Math.hypot(size.width, size.height) * config.sphereFullScreenMargin;
    const targetRadius = rightHandOpen ? screenDiagonal : avgDist * config.sphereRadiusScale;
    // Growing to fill the screen uses a much slower factor than normal
    // hand-driven resizing so it reads as a slow reveal, not a quick pop.
    const radiusGrowFactor = rightHandOpen ? config.sphereFullScreenGrowFactor : config.smoothingFactor;
    radiusRef.current =
      radiusRef.current === null ? targetRadius : lerp(radiusRef.current, targetRadius, radiusGrowFactor);

    meshRef.current.position.set(centroidX, centroidY, 0);
    meshRef.current.scale.setScalar(radiusRef.current);
    // Chromatic aberration radiates from the sphere's own screen-space
    // center — its position is already this same corner centroid.
    material.uniforms.uAberrationCenter.value.set(centroidX, centroidY);

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

    // Chromatic aberration — held pose, left thumb above left index tip
    // (right hand not considered).
    const { aberrationPoseMargin } = config;
    const leftThumbAboveIndex = li.y - lt.y > aberrationPoseMargin;
    const targetAberrationMix = leftThumbAboveIndex ? 1 : 0;
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

    // LI/RI touch (both index fingertips touching) toggles a
    // super-saturation + slight hue-shift fill, tap not hold — identical
    // gesture/hysteresis logic to LensQuad, duplicated per DECISION §5.
    const indexTouchDistance = Math.hypot(li.x - ri.x, li.y - ri.y);
    const { saturationTouchOnDistance, saturationTouchOffDistance } = config;
    if (!isIndexTouchingRef.current && indexTouchDistance < saturationTouchOnDistance) {
      isIndexTouchingRef.current = true;
      saturationEnabledRef.current = !saturationEnabledRef.current;
    } else if (isIndexTouchingRef.current && indexTouchDistance > saturationTouchOffDistance) {
      isIndexTouchingRef.current = false;
    }

    const targetSaturationMix = saturationEnabledRef.current ? 1 : 0;
    saturationMixRef.current = lerp(saturationMixRef.current, targetSaturationMix, EFFECT_MIX_FACTOR);
    material.uniforms.uSaturationMix.value = saturationMixRef.current;
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
}
