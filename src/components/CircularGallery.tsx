import { useEffect, useRef } from 'react';
import type { OGLRenderingContext } from 'ogl';
import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from 'ogl';
import { useCamera } from '../context/CameraContext';
import { useTracking } from '../context/TrackingContext';
import { useWindowSize } from '../hooks/useWindowSize';
import { landmarkToScreen } from '../tracking/corners';
import { getRightHandIndexTip, getRightHandThumbTip } from '../tracking/gestures';
import { config } from '../config';
import { GALLERY_IMAGE_FILES } from '../data/galleryImages';
import './CircularGallery.css';

// Ported from React Bits' CircularGallery, adapted the same way
// TiltedCard/DomeGallery were: the WebGL mesh/curve/shader math is kept,
// but the input source changes from a real pointer drag + wheel +
// keyboard (this app has no mouse-driven interaction anywhere else) to
// a single hand gesture — right index/thumb pinch advances to the next
// image. Per request, the per-tile text label (the ported component's
// "Title" mesh, and all font-loading machinery that supported it) is
// dropped entirely. Real keyboard arrow/Home navigation is kept as a
// harmless bonus (it's what the container's own aria-label promises,
// and doesn't compete with the pinch the way a kept mouse-drag would
// have competed with hand-tracking-driven control).

function debounce<Args extends unknown[]>(func: (...args: Args) => void, wait: number) {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

function lerp(p1: number, p2: number, t: number) {
  return p1 + (p2 - p1) * t;
}

function createRoundedImageProgram(gl: OGLRenderingContext, texture: Texture, borderRadius: number) {
  return new Program(gl, {
    depthTest: false,
    depthWrite: false,
    vertex: `
      precision highp float;
      attribute vec3 position;
      attribute vec2 uv;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      uniform float uTime;
      uniform float uSpeed;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.z = (sin(p.x * 4.0 + uTime) * 1.5 + cos(p.y * 2.0 + uTime) * 1.5) * (0.1 + uSpeed * 0.5);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragment: `
      precision highp float;
      uniform vec2 uImageSizes;
      uniform vec2 uPlaneSizes;
      uniform sampler2D tMap;
      uniform float uBorderRadius;
      varying vec2 vUv;

      float roundedBoxSDF(vec2 p, vec2 b, float r) {
        vec2 d = abs(p) - b;
        return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0) - r;
      }

      void main() {
        vec2 ratio = vec2(
          min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
          min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
        );
        vec2 uv = vec2(
          vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
          vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
        );
        vec4 color = texture2D(tMap, uv);

        float d = roundedBoxSDF(vUv - 0.5, vec2(0.5 - uBorderRadius), uBorderRadius);
        float edgeSmooth = 0.002;
        float alpha = 1.0 - smoothstep(-edgeSmooth, edgeSmooth, d);

        gl_FragColor = vec4(color.rgb, alpha);
      }
    `,
    uniforms: {
      tMap: { value: texture },
      uPlaneSizes: { value: [0, 0] },
      uImageSizes: { value: [0, 0] },
      uSpeed: { value: 0 },
      uTime: { value: 100 * Math.random() },
      uBorderRadius: { value: borderRadius },
    },
    transparent: true,
  });
}

type ScreenSize = { width: number; height: number };
type Scroll = { ease: number; current: number; target: number; last: number };

type MediaOptions = {
  geometry: Plane;
  gl: OGLRenderingContext;
  image: string;
  index: number;
  length: number;
  scene: Transform;
  screen: ScreenSize;
  viewport: ScreenSize;
  bend: number;
  borderRadius: number;
};

class Media {
  geometry: Plane;
  gl: OGLRenderingContext;
  image: string;
  index: number;
  length: number;
  scene: Transform;
  screen: ScreenSize;
  viewport: ScreenSize;
  bend: number;
  borderRadius: number;

  program: Program;
  plane: Mesh;
  extra = 0;
  speed = 0;
  isBefore = false;
  isAfter = false;
  scale = 1;
  padding = 0;
  width = 0;
  widthTotal = 0;
  x = 0;

  constructor({ geometry, gl, image, index, length, scene, screen, viewport, bend, borderRadius }: MediaOptions) {
    this.geometry = geometry;
    this.gl = gl;
    this.image = image;
    this.index = index;
    this.length = length;
    this.scene = scene;
    this.screen = screen;
    this.viewport = viewport;
    this.bend = bend;
    this.borderRadius = borderRadius;

    const texture = new Texture(this.gl, { generateMipmaps: true });
    this.program = createRoundedImageProgram(this.gl, texture, this.borderRadius);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = this.image;
    img.onload = () => {
      texture.image = img;
      this.program.uniforms.uImageSizes.value = [img.naturalWidth, img.naturalHeight];
    };

    this.plane = new Mesh(this.gl, { geometry: this.geometry, program: this.program });
    this.plane.setParent(this.scene);

    this.onResize({ screen, viewport });
  }

  update(scroll: Scroll, direction: 'left' | 'right') {
    this.plane.position.x = this.x - scroll.current - this.extra;

    const x = this.plane.position.x;
    const H = this.viewport.width / 2;

    if (this.bend === 0) {
      this.plane.position.y = 0;
      this.plane.rotation.z = 0;
    } else {
      const bAbs = Math.abs(this.bend);
      const R = (H * H + bAbs * bAbs) / (2 * bAbs);
      const effectiveX = Math.min(Math.abs(x), H);
      const arc = R - Math.sqrt(R * R - effectiveX * effectiveX);
      if (this.bend > 0) {
        this.plane.position.y = -arc;
        this.plane.rotation.z = -Math.sign(x) * Math.asin(effectiveX / R);
      } else {
        this.plane.position.y = arc;
        this.plane.rotation.z = Math.sign(x) * Math.asin(effectiveX / R);
      }
    }

    this.speed = scroll.current - scroll.last;
    this.program.uniforms.uTime.value += 0.04;
    this.program.uniforms.uSpeed.value = this.speed;

    const planeOffset = this.plane.scale.x / 2;
    const viewportOffset = this.viewport.width / 2;
    this.isBefore = this.plane.position.x + planeOffset < -viewportOffset;
    this.isAfter = this.plane.position.x - planeOffset > viewportOffset;
    if (direction === 'right' && this.isBefore) {
      this.extra -= this.widthTotal;
      this.isBefore = this.isAfter = false;
    }
    if (direction === 'left' && this.isAfter) {
      this.extra += this.widthTotal;
      this.isBefore = this.isAfter = false;
    }
  }

  onResize({ screen, viewport }: { screen?: ScreenSize; viewport?: ScreenSize } = {}) {
    if (screen) this.screen = screen;
    if (viewport) this.viewport = viewport;
    this.scale = this.screen.height / 1500;
    this.plane.scale.y = (this.viewport.height * (900 * this.scale)) / this.screen.height;
    this.plane.scale.x = (this.viewport.width * (700 * this.scale)) / this.screen.width;
    this.program.uniforms.uPlaneSizes.value = [this.plane.scale.x, this.plane.scale.y];
    this.padding = 2;
    this.width = this.plane.scale.x + this.padding;
    this.widthTotal = this.width * this.length;
    this.x = this.width * this.index;
  }
}

type AppOptions = {
  images: string[];
  bend: number;
  borderRadius: number;
  scrollEase: number;
};

class App {
  container: HTMLElement;
  scroll: Scroll;
  onCheckDebounce: () => void;

  renderer: Renderer;
  gl: OGLRenderingContext;
  camera: Camera;
  scene: Transform;
  planeGeometry: Plane;

  mediasImages: string[] = [];
  medias: Media[] = [];
  screen: ScreenSize = { width: 0, height: 0 };
  viewport: ScreenSize = { width: 0, height: 0 };

  raf = 0;
  boundOnResize: () => void;
  boundOnKeyDown: (e: KeyboardEvent) => void;

  constructor(container: HTMLElement, { images, bend, borderRadius, scrollEase }: AppOptions) {
    this.container = container;
    this.scroll = { ease: scrollEase, current: 0, target: 0, last: 0 };
    this.onCheckDebounce = debounce(() => this.onCheck(), 200);

    this.renderer = new Renderer({ alpha: true, antialias: true, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0, 0, 0, 0);
    this.container.appendChild(this.gl.canvas);

    this.camera = new Camera(this.gl);
    this.camera.fov = 45;
    this.camera.position.z = 20;

    this.scene = new Transform();

    this.onResize();

    this.planeGeometry = new Plane(this.gl, { heightSegments: 50, widthSegments: 100 });
    this.createMedias(images, bend, borderRadius);

    this.boundOnResize = () => this.onResize();
    this.boundOnKeyDown = (e) => this.onKeyDown(e);
    window.addEventListener('resize', this.boundOnResize);
    this.container.addEventListener('keydown', this.boundOnKeyDown);

    this.update();
  }

  createMedias(images: string[], bend: number, borderRadius: number) {
    // Doubled so the wrap-around never shows the same handful of images
    // repeating at an obviously close distance (this app only has 10).
    this.mediasImages = images.concat(images);
    this.medias = this.mediasImages.map(
      (image, index) =>
        new Media({
          geometry: this.planeGeometry,
          gl: this.gl,
          image,
          index,
          length: this.mediasImages.length,
          scene: this.scene,
          screen: this.screen,
          viewport: this.viewport,
          bend,
          borderRadius,
        }),
    );
  }

  /** Advances exactly one item forward — the right index/thumb pinch's
   * effect, taking the place of the ported component's ArrowRight
   * keyboard handler (kept below, unchanged) as the hand-tracking input. */
  next() {
    if (!this.medias[0]) return;
    this.scroll.target += this.medias[0].width;
    this.onCheckDebounce();
  }

  onKeyDown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        this.scroll.target += this.medias[0]?.width ?? 0;
        this.onCheckDebounce();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.scroll.target -= this.medias[0]?.width ?? 0;
        this.onCheckDebounce();
        break;
      case 'Home':
        e.preventDefault();
        this.scroll.target = 0;
        this.onCheckDebounce();
        break;
      default:
        break;
    }
  }

  onCheck() {
    if (!this.medias[0]) return;
    const width = this.medias[0].width;
    const itemIndex = Math.round(Math.abs(this.scroll.target) / width);
    const item = width * itemIndex;
    this.scroll.target = this.scroll.target < 0 ? -item : item;
  }

  onResize() {
    this.screen = { width: this.container.clientWidth, height: this.container.clientHeight };
    this.renderer.setSize(this.screen.width, this.screen.height);
    this.camera.perspective({ aspect: this.screen.width / this.screen.height });
    const fov = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
    const width = height * this.camera.aspect;
    this.viewport = { width, height };
    this.medias.forEach((media) => media.onResize({ screen: this.screen, viewport: this.viewport }));
  }

  update() {
    this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
    const direction = this.scroll.current > this.scroll.last ? 'right' : 'left';
    this.medias.forEach((media) => media.update(this.scroll, direction));
    this.renderer.render({ scene: this.scene, camera: this.camera });
    this.scroll.last = this.scroll.current;
    this.raf = window.requestAnimationFrame(() => this.update());
  }

  destroy() {
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.boundOnResize);
    this.container.removeEventListener('keydown', this.boundOnKeyDown);
    if (this.renderer.gl.canvas.parentNode) {
      this.renderer.gl.canvas.parentNode.removeChild(this.renderer.gl.canvas);
    }
  }
}

const BEND = 3;
const BORDER_RADIUS = 0.05;
const SCROLL_EASE = 0.05;
const CAROUSEL_IMAGES = GALLERY_IMAGE_FILES.map((file) => `/${file}`);

export function CircularGallery() {
  const { videoSize } = useCamera();
  const { result: handResult } = useTracking();
  const stageSize = useWindowSize();

  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<App | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const app = new App(container, { images: CAROUSEL_IMAGES, bend: BEND, borderRadius: BORDER_RADIUS, scrollEase: SCROLL_EASE });
    appRef.current = app;
    return () => {
      appRef.current = null;
      app.destroy();
    };
  }, []);

  // Right index/thumb pinch tap-toggle (same hysteresis pattern as the
  // other pinches in this app) advances the carousel by one image per
  // tap. Raw fingertip positions, independent of any "extended" gate —
  // a pinch is its own distinct pose.
  const rightIndexTipLandmark = getRightHandIndexTip(handResult);
  const rightIndexTipScreenPos =
    rightIndexTipLandmark && videoSize ? landmarkToScreen(rightIndexTipLandmark, videoSize, stageSize) : null;
  const rightThumbTipLandmark = getRightHandThumbTip(handResult);
  const rightThumbScreenPos =
    rightThumbTipLandmark && videoSize ? landmarkToScreen(rightThumbTipLandmark, videoSize, stageSize) : null;
  const pinchDistance =
    rightIndexTipScreenPos && rightThumbScreenPos
      ? Math.hypot(rightIndexTipScreenPos.x - rightThumbScreenPos.x, rightIndexTipScreenPos.y - rightThumbScreenPos.y)
      : null;

  const isPinchTouchingRef = useRef(false);
  useEffect(() => {
    if (pinchDistance === null) {
      isPinchTouchingRef.current = false;
      return;
    }
    const { carouselAdvancePinchOnDistance, carouselAdvancePinchOffDistance } = config;
    if (!isPinchTouchingRef.current && pinchDistance < carouselAdvancePinchOnDistance) {
      isPinchTouchingRef.current = true;
      appRef.current?.next();
    } else if (isPinchTouchingRef.current && pinchDistance > carouselAdvancePinchOffDistance) {
      isPinchTouchingRef.current = false;
    }
  }, [pinchDistance]);

  return (
    <div
      className="circular-gallery"
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label="Circular image gallery. Use left and right arrow keys, or a right index/thumb pinch, to navigate."
    />
  );
}
