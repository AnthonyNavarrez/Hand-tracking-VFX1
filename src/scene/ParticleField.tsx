import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { vertexShader, fragmentShader } from './particleShader';
import { config } from '../config';
import type { Size } from '../tracking/corners';

type ParticleFieldProps = {
  // Which particle family is shown: circles if the sphere is the
  // currently active mode, squares if the quad is.
  isSphereActive: boolean;
  // Left hand's screen-space wrist position — used for the squares' swarm
  // velocity (overall hand movement, not shape). Null when the left hand
  // isn't tracked.
  leftHandScreenPos: { x: number; y: number } | null;
  // Left hand's wrist + 5 fingertip screen positions — used to repel
  // circles from whichever part of the hand is actually nearest, so open
  // fingers repel just as well as the palm. Null when the left hand isn't
  // tracked.
  leftHandRepelPoints: { x: number; y: number }[] | null;
  // Right hand open (all 5 fingers extended) pulls every circle toward
  // rightHandScreenPos instead of their usual orbit.
  rightHandOpen: boolean;
  rightHandScreenPos: { x: number; y: number } | null;
  videoTexture: THREE.VideoTexture;
  videoSize: Size;
  handOpenMixRef: RefObject<number>;
};

const PARTICLE_COUNT = config.particleCount;
const PARTICLE_INDICES = Array.from({ length: PARTICLE_COUNT }, (_, i) => i);

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function ParticleField({
  isSphereActive,
  leftHandScreenPos,
  leftHandRepelPoints,
  rightHandOpen,
  rightHandScreenPos,
  videoTexture,
  videoSize,
  handOpenMixRef,
}: ParticleFieldProps) {
  const { camera, size, viewport } = useThree();

  // Same orthographic-frustum-in-CSS-px sync as LensQuad/LensSphere,
  // duplicated here so this component stays fully self-contained.
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera & { manual?: boolean };
    cam.left = 0;
    cam.right = size.width;
    cam.top = 0;
    cam.bottom = size.height;
    cam.manual = true;
    cam.updateProjectionMatrix();
  }, [camera, size]);

  // 1x1 unit geometry, scaled per-mesh via the `scale` prop below — each
  // particle is its own plain THREE.Mesh (not instanced) sharing one
  // geometry/material per family, the same rendering technique already
  // proven by LensQuad/LensSphere. Only 40-ish objects, so this is cheap.
  const squareGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const circleGeometry = useMemo(() => new THREE.CircleGeometry(0.5, 24), []);

  const squareMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
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

  const circleMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
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
    for (const material of [squareMaterial, circleMaterial]) {
      material.uniforms.uResolution.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
      material.uniforms.uStageSize.value.set(size.width, size.height);
    }
  }, [squareMaterial, circleMaterial, size, viewport]);

  const squareMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const circleMeshRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Per-particle wandering state for the squares (screen-space px),
  // persisted in a ref (not state) so useFrame can integrate it every
  // frame. Distinct random phases per particle so each wanders
  // independently rather than in lockstep.
  const squareParticlesRef = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
    })),
  );
  const prevHandPosRef = useRef<{ x: number; y: number } | null>(null);
  const swarmVelocityRef = useRef({ x: 0, y: 0 });

  // Per-particle orbit state for the circles: each keeps its own fixed
  // radius and angle offset from the screen center (randomized once), so
  // at any moment they're scattered across the whole screen rather than
  // lined up on a single ring — the only thing they all share is the one
  // rotation angle below, which is why they all swirl around the center
  // together despite sitting at different distances from it. offsetX/Y is
  // a separate, decaying displacement from that orbital position, used
  // to repel the particle away from the hand when it's nearby.
  const circleParticlesRef = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      radius: Math.random() * Math.hypot(window.innerWidth, window.innerHeight) * 0.5,
      angleOffset: Math.random() * Math.PI * 2,
      offsetX: 0,
      offsetY: 0,
    })),
  );

  // Shared rotation angle for the circles — always ticks forward at a
  // constant base rate, so they're moving on their own by default (like
  // the squares' wander). The left hand no longer steers this rotation;
  // instead it locally repels nearby circles (see below).
  const ringAngleRef = useRef(0);

  // Shared 0-1 value (not per-particle — all circles move toward the
  // right hand together) smoothed toward 1 while the right hand is open,
  // back toward 0 otherwise, so engaging/releasing the pull is a smooth
  // slide rather than a snap.
  const attractMixRef = useRef(0);

  useFrame((state, delta) => {
    const mix = handOpenMixRef.current;
    squareMaterial.uniforms.uOpacity.value = isSphereActive ? 0 : mix;
    circleMaterial.uniforms.uOpacity.value = isSphereActive ? mix : 0;

    const squaresVisible = !isSphereActive && mix > 0.01;
    const circlesVisible = isSphereActive && mix > 0.01;
    for (const mesh of squareMeshRefs.current) if (mesh) mesh.visible = squaresVisible;
    for (const mesh of circleMeshRefs.current) if (mesh) mesh.visible = circlesVisible;

    // Squares: autonomous per-particle wander plus a shared swarm
    // velocity nudged by the left hand's own frame-to-frame screen
    // movement, decaying back toward zero so a single hand movement
    // gives the swarm a push rather than a permanent drift.
    if (leftHandScreenPos) {
      const prev = prevHandPosRef.current;
      if (prev) {
        swarmVelocityRef.current.x += (leftHandScreenPos.x - prev.x) * config.squareHandInfluence;
        swarmVelocityRef.current.y += (leftHandScreenPos.y - prev.y) * config.squareHandInfluence;
      }
      prevHandPosRef.current = leftHandScreenPos;
    } else {
      prevHandPosRef.current = null;
    }
    swarmVelocityRef.current.x *= config.squareSwarmDamping;
    swarmVelocityRef.current.y *= config.squareSwarmDamping;

    if (!isSphereActive) {
      const t = state.clock.elapsedTime;
      const w = size.width;
      const h = size.height;
      squareParticlesRef.current.forEach((particle, i) => {
        const wanderX = Math.sin(t * config.squareWanderSpeed + particle.phaseX) * config.squareWanderAmplitude;
        const wanderY = Math.cos(t * config.squareWanderSpeed + particle.phaseY) * config.squareWanderAmplitude;
        particle.x += (wanderX + swarmVelocityRef.current.x) * delta;
        particle.y += (wanderY + swarmVelocityRef.current.y) * delta;

        // Wrap around screen edges so particles never permanently drift off.
        particle.x = ((particle.x % w) + w) % w;
        particle.y = ((particle.y % h) + h) % h;

        const mesh = squareMeshRefs.current[i];
        if (mesh) mesh.position.set(particle.x, particle.y, 0);
      });
    }

    // Circles: scattered anywhere on screen (each at its own fixed
    // distance from center), all swirling around the center together via
    // the one shared auto-rotating angle. The left hand doesn't steer
    // that rotation — instead, any circle currently near the hand gets
    // pushed away from it (radially, falling off with distance), and
    // that push decays back to zero once the hand moves away or stops
    // moving, rather than sticking as a permanent offset.
    if (isSphereActive) {
      ringAngleRef.current += config.circleAutoRotationSpeed * delta;

      const targetAttractMix = rightHandOpen && rightHandScreenPos ? 1 : 0;
      attractMixRef.current = lerp(attractMixRef.current, targetAttractMix, config.circleAttractMixFactor);

      const centerX = size.width / 2;
      const centerY = size.height / 2;

      circleParticlesRef.current.forEach((particle, i) => {
        const angle = ringAngleRef.current + particle.angleOffset;
        const baseX = centerX + Math.cos(angle) * particle.radius;
        const baseY = centerY + Math.sin(angle) * particle.radius;

        if (leftHandRepelPoints) {
          // Repel from whichever point on the hand (palm or any
          // fingertip) is actually closest, so an open hand's fingers
          // repel just as well as its palm, not just a single wrist spot.
          let nearestDx = 0;
          let nearestDy = 0;
          let nearestDist = Infinity;
          for (const point of leftHandRepelPoints) {
            const dx = baseX + particle.offsetX - point.x;
            const dy = baseY + particle.offsetY - point.y;
            const dist = Math.hypot(dx, dy);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestDx = dx;
              nearestDy = dy;
            }
          }
          if (nearestDist > 0.0001 && nearestDist < config.circleRepelRadius) {
            const strength = (1 - nearestDist / config.circleRepelRadius) * config.circleRepelStrength;
            particle.offsetX += (nearestDx / nearestDist) * strength * delta;
            particle.offsetY += (nearestDy / nearestDist) * strength * delta;
          }
        }
        particle.offsetX *= config.circleRepelDamping;
        particle.offsetY *= config.circleRepelDamping;

        // Right hand open pulls every circle toward it, blended in/out by
        // the shared attract mix — at 0 this is a no-op (orbit + repel
        // unchanged), at 1 every circle sits on the hand.
        const orbitX = baseX + particle.offsetX;
        const orbitY = baseY + particle.offsetY;
        const finalX = rightHandScreenPos ? lerp(orbitX, rightHandScreenPos.x, attractMixRef.current) : orbitX;
        const finalY = rightHandScreenPos ? lerp(orbitY, rightHandScreenPos.y, attractMixRef.current) : orbitY;

        const mesh = circleMeshRefs.current[i];
        if (mesh) mesh.position.set(finalX, finalY, 0);
      });
    }
  });

  return (
    <>
      {PARTICLE_INDICES.map((i) => (
        <mesh
          key={`square-${i}`}
          ref={(el) => {
            squareMeshRefs.current[i] = el;
          }}
          geometry={squareGeometry}
          material={squareMaterial}
          scale={config.particleSize}
          frustumCulled={false}
        />
      ))}
      {PARTICLE_INDICES.map((i) => (
        <mesh
          key={`circle-${i}`}
          ref={(el) => {
            circleMeshRefs.current[i] = el;
          }}
          geometry={circleGeometry}
          material={circleMaterial}
          scale={config.particleSize}
          frustumCulled={false}
        />
      ))}
    </>
  );
}
