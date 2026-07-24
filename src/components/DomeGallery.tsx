import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { useCamera } from '../context/CameraContext';
import { useTracking } from '../context/TrackingContext';
import { useWindowSize } from '../hooks/useWindowSize';
import { landmarkToScreen } from '../tracking/corners';
import {
  getRightHandIndexTip,
  getRightHandRingTip,
  useRightIndexExtended,
  useRightMiddleExtended,
  useRightRingExtended,
} from '../tracking/gestures';
import { config } from '../config';
import { GALLERY_IMAGE_FILES, galleryImageCaption } from '../data/galleryImages';
import './DomeGallery.css';

// Ported from React Bits' DomeGallery, adapted the same way TiltedCard
// was: the rotation/layout/open-close math is kept, but its input
// source changes from a real pointer drag (useGesture) to hand
// tracking — this app has no mouse-driven interaction anywhere else.
// Right middle finger raised auto-spins the dome; right ring finger
// raised instead lets its screen position drive rotation directly,
// using the same delta-since-gesture-started math the original used for
// a mouse drag. Right index finger raised grows whichever tile it's
// physically over (real 2D containment, unlike the flat gallery's
// X-only hover rule per its own DECISION).

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const normalizeAngle = (d: number) => ((d % 360) + 360) % 360;
const wrapAngleSigned = (deg: number) => {
  const a = (((deg + 180) % 360) + 360) % 360;
  return a - 180;
};
const getDataNumber = (el: HTMLElement, name: string, fallback: number) => {
  const attr = el.dataset[name] ?? el.getAttribute(`data-${name}`);
  const n = attr == null ? NaN : parseFloat(attr);
  return Number.isFinite(n) ? n : fallback;
};

type DomeItem = { x: number; y: number; sizeX: number; sizeY: number; src: string; alt: string };

function buildItems(pool: { src: string; alt: string }[], seg: number): DomeItem[] {
  const xCols = Array.from({ length: seg }, (_, i) => -37 + i * 2);
  const evenYs = [-4, -2, 0, 2, 4];
  const oddYs = [-3, -1, 1, 3, 5];

  const coords = xCols.flatMap((x, c) => {
    const ys = c % 2 === 0 ? evenYs : oddYs;
    return ys.map((y) => ({ x, y, sizeX: 2, sizeY: 2 }));
  });

  const totalSlots = coords.length;
  const usedImages = Array.from({ length: totalSlots }, (_, i) => pool[i % pool.length]);

  // Avoid the same image landing on two adjacent tiles when the pool is
  // much smaller than the slot count (it always is here — 10 images
  // cycling through 175 slots).
  for (let i = 1; i < usedImages.length; i++) {
    if (usedImages[i].src === usedImages[i - 1].src) {
      for (let j = i + 1; j < usedImages.length; j++) {
        if (usedImages[j].src !== usedImages[i].src) {
          const tmp = usedImages[i];
          usedImages[i] = usedImages[j];
          usedImages[j] = tmp;
          break;
        }
      }
    }
  }

  return coords.map((c, i) => ({ ...c, src: usedImages[i].src, alt: usedImages[i].alt }));
}

function computeItemBaseRotation(offsetX: number, offsetY: number, sizeX: number, sizeY: number, segments: number) {
  const unit = 360 / segments / 2;
  const rotateY = unit * (offsetX + (sizeX - 1) / 2);
  const rotateX = unit * (offsetY - (sizeY - 1) / 2);
  return { rotateX, rotateY };
}

const FIT = 0.5;
const MIN_RADIUS = 600;
const MAX_RADIUS = Infinity;
const PAD_FACTOR = 0.25;
const OVERLAY_BLUR_COLOR = '#120F17';
const MAX_VERTICAL_ROTATION_DEG = 5;
const ENLARGE_TRANSITION_MS = 300;
const SEGMENTS = 35;
const OPENED_IMAGE_WIDTH = '250px';
const OPENED_IMAGE_HEIGHT = '350px';
const IMAGE_BORDER_RADIUS = '30px';
const OPENED_IMAGE_BORDER_RADIUS = '30px';
// Full color, not the ported component's own grayscale default — matches
// the rest of this app's imagery (the flat gallery is full color too).
const GRAYSCALE = false;

const GALLERY_IMAGES = GALLERY_IMAGE_FILES.map((file) => ({ src: `/${file}`, alt: galleryImageCaption(file) }));

export function DomeGallery() {
  const { videoSize } = useCamera();
  const { result: handResult } = useTracking();
  const stageSize = useWindowSize();

  const rightMiddleExtended = useRightMiddleExtended(handResult);
  const rightRingExtended = useRightRingExtended(handResult);
  const rightIndexExtended = useRightIndexExtended(handResult);

  const ringTipLandmark = getRightHandRingTip(handResult);
  const ringScreenPos =
    rightRingExtended && ringTipLandmark && videoSize
      ? landmarkToScreen(ringTipLandmark, videoSize, stageSize)
      : null;

  const indexTipLandmark = getRightHandIndexTip(handResult);
  const hoverScreenPos =
    rightIndexExtended && indexTipLandmark && videoSize
      ? landmarkToScreen(indexTipLandmark, videoSize, stageSize)
      : null;

  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const sphereRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const focusedElRef = useRef<HTMLElement | null>(null);
  const originalTilePositionRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  const rotationRef = useRef({ x: 0, y: 0 });
  const openingRef = useRef(false);
  const openStartedAtRef = useRef(0);

  const scrollLockedRef = useRef(false);
  const lockScroll = useCallback(() => {
    if (scrollLockedRef.current) return;
    scrollLockedRef.current = true;
    document.body.classList.add('dome-scroll-lock');
  }, []);
  const unlockScroll = useCallback(() => {
    if (!scrollLockedRef.current) return;
    if (rootRef.current?.getAttribute('data-enlarging') === 'true') return;
    scrollLockedRef.current = false;
    document.body.classList.remove('dome-scroll-lock');
  }, []);

  const items = useMemo(() => buildItems(GALLERY_IMAGES, SEGMENTS), []);

  const applyTransform = useCallback((xDeg: number, yDeg: number) => {
    const el = sphereRef.current;
    if (el) {
      el.style.transform = `translateZ(calc(var(--radius) * -1)) rotateX(${xDeg}deg) rotateY(${yDeg}deg)`;
    }
  }, []);

  const lockedRadiusRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      const w = Math.max(1, cr.width);
      const h = Math.max(1, cr.height);
      const minDim = Math.min(w, h);
      const aspect = w / h;
      const basis = aspect >= 1.3 ? w : minDim;
      let radius = basis * FIT;
      radius = Math.min(radius, h * 1.35);
      radius = clamp(radius, MIN_RADIUS, MAX_RADIUS);
      lockedRadiusRef.current = Math.round(radius);

      const viewerPad = Math.max(8, Math.round(minDim * PAD_FACTOR));
      root.style.setProperty('--radius', `${lockedRadiusRef.current}px`);
      root.style.setProperty('--viewer-pad', `${viewerPad}px`);
      root.style.setProperty('--overlay-blur-color', OVERLAY_BLUR_COLOR);
      root.style.setProperty('--tile-radius', IMAGE_BORDER_RADIUS);
      root.style.setProperty('--enlarge-radius', OPENED_IMAGE_BORDER_RADIUS);
      root.style.setProperty('--image-filter', GRAYSCALE ? 'grayscale(1)' : 'none');
      applyTransform(rotationRef.current.x, rotationRef.current.y);

      const enlargedOverlay = viewerRef.current?.querySelector<HTMLElement>('.dome-enlarge');
      if (enlargedOverlay && frameRef.current && mainRef.current) {
        const frameR = frameRef.current.getBoundingClientRect();
        const mainR = mainRef.current.getBoundingClientRect();

        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = `position: absolute; width: ${OPENED_IMAGE_WIDTH}; height: ${OPENED_IMAGE_HEIGHT}; visibility: hidden;`;
        document.body.appendChild(tempDiv);
        const tempRect = tempDiv.getBoundingClientRect();
        document.body.removeChild(tempDiv);

        enlargedOverlay.style.left = `${frameR.left - mainR.left + (frameR.width - tempRect.width) / 2}px`;
        enlargedOverlay.style.top = `${frameR.top - mainR.top + (frameR.height - tempRect.height) / 2}px`;
      }
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [applyTransform]);

  useEffect(() => {
    applyTransform(rotationRef.current.x, rotationRef.current.y);
  }, [applyTransform]);

  // Right middle finger raised: continuous auto-spin, unless the ring
  // finger is also up (ring-follow below takes priority in that case).
  // Unlike ring-follow, this isn't driven by a tracked position at all,
  // so it needs its own rAF loop to read smoothly rather than stepping
  // at the (much lower) tracking frame rate.
  useEffect(() => {
    if (!rightMiddleExtended || rightRingExtended) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const nextY = wrapAngleSigned(rotationRef.current.y + config.domeSpinSpeedDegPerSec * dt);
      rotationRef.current = { x: rotationRef.current.x, y: nextY };
      applyTransform(rotationRef.current.x, nextY);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [rightMiddleExtended, rightRingExtended, applyTransform]);

  // Right ring finger raised: the dome's rotation follows the
  // fingertip's screen-space movement since the pose began — same
  // delta-to-rotation math the ported component originally used for a
  // real pointer drag, fed from the tracked fingertip instead. Takes
  // priority over the middle-finger auto-spin above if both are up.
  // Depends on plain numbers (not the pos object itself, which is a
  // fresh reference every render) so this only re-runs when the tracked
  // position actually changes.
  const ringFollowStartRef = useRef<{ rot: { x: number; y: number }; pos: { x: number; y: number } } | null>(null);
  useEffect(() => {
    if (!rightRingExtended || !ringScreenPos) {
      ringFollowStartRef.current = null;
      return;
    }
    if (!ringFollowStartRef.current) {
      ringFollowStartRef.current = { rot: { ...rotationRef.current }, pos: ringScreenPos };
      return;
    }
    const { rot, pos } = ringFollowStartRef.current;
    const dx = ringScreenPos.x - pos.x;
    const dy = ringScreenPos.y - pos.y;
    const nextX = clamp(
      rot.x - dy / config.domeRingFollowSensitivity,
      -MAX_VERTICAL_ROTATION_DEG,
      MAX_VERTICAL_ROTATION_DEG,
    );
    const nextY = wrapAngleSigned(rot.y + dx / config.domeRingFollowSensitivity);
    rotationRef.current = { x: nextX, y: nextY };
    applyTransform(nextX, nextY);
  }, [rightRingExtended, ringScreenPos?.x, ringScreenPos?.y, applyTransform]);

  // Right index finger raised: whichever tile it's physically hovering
  // (real 2D rect containment, not the flat gallery's X-only rule) grows
  // slightly. Mutates tile styles directly, matching applyTransform's
  // own imperative style, rather than routing through React state.
  const itemImageNodesRef = useRef(new Map<number, HTMLDivElement>());
  const hoveredItemIndexRef = useRef<number | null>(null);
  useEffect(() => {
    let nextHovered: number | null = null;
    if (hoverScreenPos) {
      for (const [i, el] of itemImageNodesRef.current) {
        const rect = el.getBoundingClientRect();
        if (
          hoverScreenPos.x >= rect.left &&
          hoverScreenPos.x <= rect.right &&
          hoverScreenPos.y >= rect.top &&
          hoverScreenPos.y <= rect.bottom
        ) {
          nextHovered = i;
          break;
        }
      }
    }
    const prevHovered = hoveredItemIndexRef.current;
    if (nextHovered === prevHovered) return;
    if (prevHovered !== null) {
      const prevEl = itemImageNodesRef.current.get(prevHovered);
      if (prevEl) prevEl.style.transform = 'translateZ(0)';
    }
    if (nextHovered !== null) {
      const nextEl = itemImageNodesRef.current.get(nextHovered);
      if (nextEl) nextEl.style.transform = `translateZ(0) scale(${config.domeHoverScale})`;
    }
    hoveredItemIndexRef.current = nextHovered;
  }, [hoverScreenPos?.x, hoverScreenPos?.y]);

  useEffect(() => {
    const scrim = scrimRef.current;
    if (!scrim) return;
    const close = () => {
      if (performance.now() - openStartedAtRef.current < 250) return;
      const el = focusedElRef.current;
      if (!el) return;
      const parent = el.parentElement as HTMLElement | null;
      if (!parent) return;
      const overlay = viewerRef.current?.querySelector<HTMLElement>('.dome-enlarge');
      if (!overlay) return;
      const refDiv = parent.querySelector<HTMLElement>('.dome-item__image--reference');
      const originalPos = originalTilePositionRef.current;
      if (!originalPos) {
        overlay.remove();
        if (refDiv) refDiv.remove();
        parent.style.setProperty('--rot-y-delta', '0deg');
        parent.style.setProperty('--rot-x-delta', '0deg');
        el.style.visibility = '';
        el.style.zIndex = '0';
        focusedElRef.current = null;
        rootRef.current?.removeAttribute('data-enlarging');
        openingRef.current = false;
        unlockScroll();
        return;
      }
      const currentRect = overlay.getBoundingClientRect();
      const rootRect = rootRef.current!.getBoundingClientRect();
      const originalPosRelativeToRoot = {
        left: originalPos.left - rootRect.left,
        top: originalPos.top - rootRect.top,
        width: originalPos.width,
        height: originalPos.height,
      };
      const overlayRelativeToRoot = {
        left: currentRect.left - rootRect.left,
        top: currentRect.top - rootRect.top,
        width: currentRect.width,
        height: currentRect.height,
      };
      const animatingOverlay = document.createElement('div');
      animatingOverlay.className = 'dome-enlarge-closing';
      animatingOverlay.style.cssText = `position:absolute;left:${overlayRelativeToRoot.left}px;top:${overlayRelativeToRoot.top}px;width:${overlayRelativeToRoot.width}px;height:${overlayRelativeToRoot.height}px;z-index:9999;border-radius: var(--enlarge-radius, 32px);overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:all ${ENLARGE_TRANSITION_MS}ms ease-out;pointer-events:none;margin:0;transform:none;`;
      const originalImg = overlay.querySelector('img');
      if (originalImg) {
        const img = originalImg.cloneNode() as HTMLImageElement;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        animatingOverlay.appendChild(img);
      }
      overlay.remove();
      rootRef.current!.appendChild(animatingOverlay);
      void animatingOverlay.getBoundingClientRect();
      requestAnimationFrame(() => {
        animatingOverlay.style.left = originalPosRelativeToRoot.left + 'px';
        animatingOverlay.style.top = originalPosRelativeToRoot.top + 'px';
        animatingOverlay.style.width = originalPosRelativeToRoot.width + 'px';
        animatingOverlay.style.height = originalPosRelativeToRoot.height + 'px';
        animatingOverlay.style.opacity = '0';
      });
      const cleanup = () => {
        animatingOverlay.remove();
        originalTilePositionRef.current = null;
        if (refDiv) refDiv.remove();
        parent.style.transition = 'none';
        el.style.transition = 'none';
        parent.style.setProperty('--rot-y-delta', '0deg');
        parent.style.setProperty('--rot-x-delta', '0deg');
        requestAnimationFrame(() => {
          el.style.visibility = '';
          el.style.opacity = '0';
          el.style.zIndex = '0';
          focusedElRef.current = null;
          rootRef.current?.removeAttribute('data-enlarging');
          requestAnimationFrame(() => {
            parent.style.transition = '';
            el.style.transition = 'opacity 300ms ease-out';
            requestAnimationFrame(() => {
              el.style.opacity = '1';
              setTimeout(() => {
                el.style.transition = '';
                el.style.opacity = '';
                openingRef.current = false;
                unlockScroll();
              }, 300);
            });
          });
        });
      };
      animatingOverlay.addEventListener('transitionend', cleanup, { once: true });
    };
    scrim.addEventListener('click', close);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      scrim.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [unlockScroll]);

  const openItemFromElement = useCallback(
    (el: HTMLElement) => {
      if (openingRef.current) return;
      openingRef.current = true;
      openStartedAtRef.current = performance.now();
      lockScroll();
      const parent = el.parentElement as HTMLElement;
      focusedElRef.current = el;
      el.setAttribute('data-focused', 'true');
      const offsetX = getDataNumber(parent, 'offsetX', 0);
      const offsetY = getDataNumber(parent, 'offsetY', 0);
      const sizeX = getDataNumber(parent, 'sizeX', 2);
      const sizeY = getDataNumber(parent, 'sizeY', 2);
      const parentRot = computeItemBaseRotation(offsetX, offsetY, sizeX, sizeY, SEGMENTS);
      const parentY = normalizeAngle(parentRot.rotateY);
      const globalY = normalizeAngle(rotationRef.current.y);
      let rotY = -(parentY + globalY) % 360;
      if (rotY < -180) rotY += 360;
      const rotX = -parentRot.rotateX - rotationRef.current.x;
      parent.style.setProperty('--rot-y-delta', `${rotY}deg`);
      parent.style.setProperty('--rot-x-delta', `${rotX}deg`);
      const refDiv = document.createElement('div');
      refDiv.className = 'dome-item__image dome-item__image--reference';
      refDiv.style.opacity = '0';
      refDiv.style.transform = `rotateX(${-parentRot.rotateX}deg) rotateY(${-parentRot.rotateY}deg)`;
      parent.appendChild(refDiv);

      void refDiv.offsetHeight;

      const tileR = refDiv.getBoundingClientRect();
      const mainR = mainRef.current?.getBoundingClientRect();
      const frameR = frameRef.current?.getBoundingClientRect();

      if (!mainR || !frameR || tileR.width <= 0 || tileR.height <= 0) {
        openingRef.current = false;
        focusedElRef.current = null;
        parent.removeChild(refDiv);
        unlockScroll();
        return;
      }

      originalTilePositionRef.current = { left: tileR.left, top: tileR.top, width: tileR.width, height: tileR.height };
      el.style.visibility = 'hidden';
      el.style.zIndex = '0';
      const overlay = document.createElement('div');
      overlay.className = 'dome-enlarge';
      overlay.style.position = 'absolute';
      overlay.style.left = frameR.left - mainR.left + 'px';
      overlay.style.top = frameR.top - mainR.top + 'px';
      overlay.style.width = frameR.width + 'px';
      overlay.style.height = frameR.height + 'px';
      overlay.style.opacity = '0';
      overlay.style.zIndex = '30';
      overlay.style.willChange = 'transform, opacity';
      overlay.style.transformOrigin = 'top left';
      overlay.style.transition = `transform ${ENLARGE_TRANSITION_MS}ms ease, opacity ${ENLARGE_TRANSITION_MS}ms ease`;
      const rawSrc = parent.dataset.src || el.querySelector('img')?.src || '';
      const img = document.createElement('img');
      img.src = rawSrc;
      overlay.appendChild(img);
      viewerRef.current!.appendChild(overlay);
      const tx0 = tileR.left - frameR.left;
      const ty0 = tileR.top - frameR.top;
      const sx0 = tileR.width / frameR.width;
      const sy0 = tileR.height / frameR.height;

      const validSx0 = isFinite(sx0) && sx0 > 0 ? sx0 : 1;
      const validSy0 = isFinite(sy0) && sy0 > 0 ? sy0 : 1;

      overlay.style.transform = `translate(${tx0}px, ${ty0}px) scale(${validSx0}, ${validSy0})`;

      setTimeout(() => {
        if (!overlay.parentElement) return;
        overlay.style.opacity = '1';
        overlay.style.transform = 'translate(0px, 0px) scale(1, 1)';
        rootRef.current?.setAttribute('data-enlarging', 'true');
      }, 16);

      const onFirstEnd = (ev: TransitionEvent) => {
        if (ev.propertyName !== 'transform') return;
        overlay.removeEventListener('transitionend', onFirstEnd);
        const prevTransition = overlay.style.transition;
        overlay.style.transition = 'none';
        overlay.style.width = OPENED_IMAGE_WIDTH;
        overlay.style.height = OPENED_IMAGE_HEIGHT;
        const newRect = overlay.getBoundingClientRect();
        overlay.style.width = frameR.width + 'px';
        overlay.style.height = frameR.height + 'px';
        void overlay.offsetWidth;
        overlay.style.transition = `left ${ENLARGE_TRANSITION_MS}ms ease, top ${ENLARGE_TRANSITION_MS}ms ease, width ${ENLARGE_TRANSITION_MS}ms ease, height ${ENLARGE_TRANSITION_MS}ms ease`;
        const centeredLeft = frameR.left - mainR.left + (frameR.width - newRect.width) / 2;
        const centeredTop = frameR.top - mainR.top + (frameR.height - newRect.height) / 2;
        requestAnimationFrame(() => {
          overlay.style.left = `${centeredLeft}px`;
          overlay.style.top = `${centeredTop}px`;
          overlay.style.width = OPENED_IMAGE_WIDTH;
          overlay.style.height = OPENED_IMAGE_HEIGHT;
        });
        const cleanupSecond = () => {
          overlay.removeEventListener('transitionend', cleanupSecond);
          overlay.style.transition = prevTransition;
        };
        overlay.addEventListener('transitionend', cleanupSecond, { once: true });
      };
      overlay.addEventListener('transitionend', onFirstEnd);
    },
    [lockScroll, unlockScroll],
  );

  const onTileClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (openingRef.current) return;
      openItemFromElement(e.currentTarget);
    },
    [openItemFromElement],
  );

  useEffect(() => {
    return () => {
      document.body.classList.remove('dome-scroll-lock');
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="dome-root"
      style={
        {
          '--segments-x': SEGMENTS,
          '--segments-y': SEGMENTS,
          '--overlay-blur-color': OVERLAY_BLUR_COLOR,
          '--tile-radius': IMAGE_BORDER_RADIUS,
          '--enlarge-radius': OPENED_IMAGE_BORDER_RADIUS,
          '--image-filter': GRAYSCALE ? 'grayscale(1)' : 'none',
        } as CSSProperties
      }
    >
      <div ref={mainRef} className="dome-main">
        <div className="dome-stage">
          <div ref={sphereRef} className="dome-sphere">
            {items.map((it, i) => (
              <div
                key={`${it.x},${it.y},${i}`}
                className="dome-item"
                data-src={it.src}
                data-offset-x={it.x}
                data-offset-y={it.y}
                data-size-x={it.sizeX}
                data-size-y={it.sizeY}
                style={
                  {
                    '--offset-x': it.x,
                    '--offset-y': it.y,
                    '--item-size-x': it.sizeX,
                    '--item-size-y': it.sizeY,
                  } as CSSProperties
                }
              >
                <div
                  className="dome-item__image"
                  role="button"
                  tabIndex={0}
                  aria-label={it.alt || 'Open image'}
                  onClick={onTileClick}
                  ref={(node) => {
                    if (node) itemImageNodesRef.current.set(i, node);
                    else itemImageNodesRef.current.delete(i);
                  }}
                >
                  <img src={it.src} draggable={false} alt={it.alt} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dome-overlay" />
        <div className="dome-overlay dome-overlay--blur" />
        <div className="dome-edge-fade dome-edge-fade--top" />
        <div className="dome-edge-fade dome-edge-fade--bottom" />

        <div className="dome-viewer" ref={viewerRef}>
          <div ref={scrimRef} className="dome-scrim" />
          <div ref={frameRef} className="dome-frame" />
        </div>
      </div>
    </div>
  );
}
