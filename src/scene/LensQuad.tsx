import { useEffect, useMemo, useRef, type RefObject } from 'react';
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
  // Shared 0-1 crossfade value (1 = fully sphere mode) owned by
  // SphereModeMix — multiplies this quad's own hands-visible opacity so
  // it fades out as LensSphere fades in. At 0 (right pinky never raised)
  // this is a no-op multiplier, so existing behavior is unchanged.
  sphereModeMixRef: RefObject<number>;
};

const FADE_FACTOR = 0.15;
const EFFECT_MIX_FACTOR = 0.2;
// The mix lerp asymptotically approaches 1 but never mathematically
// reaches it, so opacity alone never hits exactly 0 in full sphere mode —
// a residual near-zero-alpha quad can still show through against the
// sphere depending on transparent-object draw order. Fully hide the mesh
// once the crossfade has visually finished (opacity is already
// imperceptibly low at this point, so this isn't a pop).
const SPHERE_MODE_HIDE_THRESHOLD = 0.98;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function LensQuad({ targetCorners, videoTexture, videoSize, sphereModeMixRef }: LensQuadProps) {
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
          uEffectMix: { value: 0 },
          uPixelSize: { value: config.pixelateBlockSize },
          uDitherMix: { value: 0 },
          uDitherLevels: { value: config.ditherLevels },
          uDitherCellSize: { value: config.ditherCellSize },
          uAberrationMix: { value: 0 },
          uAberrationOffset: { value: config.aberrationOffset },
          uAberrationCenter: { value: new THREE.Vector2() },
          uTime: { value: 0 },
          uAberrationDistortFrequency: { value: config.aberrationDistortFrequency },
          uAberrationDistortSpeed: { value: config.aberrationDistortSpeed },
          uAberrationDistortAmplitude: { value: config.aberrationDistortAmplitude },
          uPosterizeMix: { value: 0 },
          uPosterizeLevels: { value: config.posterizeLevels },
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

  const meshRef = useRef<THREE.Mesh>(null);

  // Smoothed corner positions persist across frames (a ref, not state) so
  // useFrame can lerp them every render frame regardless of how often new
  // tracking data arrives. Frozen (not reset) when hands leave, so the fade
  // in LensQuad's material shrinks the quad's opacity from its last known
  // position rather than snapping it away.
  const smoothedCornersRef = useRef<Corners | null>(null);
  const handsOpacityRef = useRef(0);
  const effectMixRef = useRef(0);
  const isRightPinchTouchingRef = useRef(false);
  const pixelateEnabledRef = useRef(false);
  const ditherMixRef = useRef(0);
  const isLeftPinchTouchingRef = useRef(false);
  const ditherEnabledRef = useRef(false);
  const aberrationMixRef = useRef(0);
  const posterizeMixRef = useRef(0);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;

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
    handsOpacityRef.current = lerp(handsOpacityRef.current, targetOpacity, FADE_FACTOR);
    material.uniforms.uOpacity.value = handsOpacityRef.current * (1 - sphereModeMixRef.current);
    if (meshRef.current) meshRef.current.visible = sphereModeMixRef.current < SPHERE_MODE_HIDE_THRESHOLD;

    const smoothed = smoothedCornersRef.current;
    if (!smoothed) return;

    const [lt, li, ri, rt] = smoothed;

    // RI/RT pinch (right index + thumb touching) toggles the fill between
    // invert and pixelated invert on each touch — like a tap, not a hold.
    // Hysteresis (separate on/off thresholds) means one physical touch
    // can't double-toggle from jitter right at the boundary: crossing the
    // (closer) on-distance fires the toggle and arms "touching"; crossing
    // back out past the (farther) off-distance disarms it, ready for the
    // next tap.
    const rightPinchDistance = Math.hypot(ri.x - rt.x, ri.y - rt.y);
    const { pixelatePinchOnDistance, pixelatePinchOffDistance } = config;
    if (!isRightPinchTouchingRef.current && rightPinchDistance < pixelatePinchOnDistance) {
      isRightPinchTouchingRef.current = true;
      pixelateEnabledRef.current = !pixelateEnabledRef.current;
    } else if (isRightPinchTouchingRef.current && rightPinchDistance > pixelatePinchOffDistance) {
      isRightPinchTouchingRef.current = false;
    }

    const targetMix = pixelateEnabledRef.current ? 1 : 0;
    effectMixRef.current = lerp(effectMixRef.current, targetMix, EFFECT_MIX_FACTOR);
    material.uniforms.uEffectMix.value = effectMixRef.current;

    // LI/LT pinch (left index + thumb touching) toggles an ordered-dither
    // fill the same tap-to-switch way, independently of the pixelate
    // toggle above — both can be on at once.
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

    // Chromatic aberration is a held pose (not a tap): active exactly
    // while both thumbs sit above their own hand's index tip by at least
    // the configured margin. Smoothly fades in/out with the pose rather
    // than popping, same as the opacity show/hide fade.
    const { aberrationPoseMargin } = config;
    const rightThumbAboveIndex = ri.y - rt.y > aberrationPoseMargin;
    const leftThumbAboveIndex = li.y - lt.y > aberrationPoseMargin;
    const targetAberrationMix = rightThumbAboveIndex && leftThumbAboveIndex ? 1 : 0;
    aberrationMixRef.current = lerp(aberrationMixRef.current, targetAberrationMix, EFFECT_MIX_FACTOR);
    material.uniforms.uAberrationMix.value = aberrationMixRef.current;
    material.uniforms.uAberrationCenter.value.set(
      (lt.x + li.x + ri.x + rt.x) / 4,
      (lt.y + li.y + ri.y + rt.y) / 4,
    );

    // Posterize is a held pose (not a tap): active exactly while the
    // hands are crossed — the right hand's corners sitting at least the
    // configured margin to the left of the left hand's corners. Stacks
    // on top of whichever fill (invert or aberration) is active.
    const { posterizeCrossMargin } = config;
    const rightHandCenterX = (ri.x + rt.x) / 2;
    const leftHandCenterX = (li.x + lt.x) / 2;
    const handsCrossed = rightHandCenterX < leftHandCenterX - posterizeCrossMargin;
    const targetPosterizeMix = handsCrossed ? 1 : 0;
    posterizeMixRef.current = lerp(posterizeMixRef.current, targetPosterizeMix, EFFECT_MIX_FACTOR);
    material.uniforms.uPosterizeMix.value = posterizeMixRef.current;

    const position = geometry.attributes.position as THREE.BufferAttribute;
    const arr = position.array as Float32Array;
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

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
}
