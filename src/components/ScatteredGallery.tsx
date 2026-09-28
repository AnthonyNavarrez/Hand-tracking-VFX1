import { useEffect, useRef } from 'react';
import { useCamera } from '../context/CameraContext';
import { useTracking } from '../context/TrackingContext';
import { useWindowSize } from '../hooks/useWindowSize';
import { getRightHandIndexTip, useRightIndexExtended } from '../tracking/gestures';
import { landmarkToScreen } from '../tracking/corners';
import { GALLERY_IMAGE_FILES } from '../data/galleryImages';
import './ScatteredGallery.css';

const TILE_WIDTH = 160;
const TILE_HEIGHT = 240;
const EDGE_MARGIN = 24;

type Position = { x: number; y: number };

function randomPosition(stageWidth: number, stageHeight: number): Position {
  const maxX = Math.max(EDGE_MARGIN, stageWidth - TILE_WIDTH - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, stageHeight - TILE_HEIGHT - EDGE_MARGIN);
  return {
    x: EDGE_MARGIN + Math.random() * (maxX - EDGE_MARGIN),
    y: EDGE_MARGIN + Math.random() * (maxY - EDGE_MARGIN),
  };
}

export function ScatteredGallery() {
  const { videoSize } = useCamera();
  const { result: handResult } = useTracking();
  const stageSize = useWindowSize();
  const rightIndexExtended = useRightIndexExtended(handResult);

  const rightIndexTipLandmark = getRightHandIndexTip(handResult);
  const rightIndexTipScreenPos =
    rightIndexTipLandmark && videoSize ? landmarkToScreen(rightIndexTipLandmark, videoSize, stageSize) : null;
  // Same "aim" gate as every other mode's hover: armed only while the
  // right index finger is raised. The thumb doesn't factor in at all
  // here — no pinch, just the index finger.
  const pointerScreenPos = rightIndexExtended ? rightIndexTipScreenPos : null;

  // Random starting position per image, generated once (lazy ref init —
  // idempotent even under StrictMode's double-render, since it only
  // ever transitions null -> set, never back) when this mode first
  // renders. ScatteredGallery only mounts while the left-pinky gate is
  // up, so re-raising the pinky reshuffles everything fresh, matching
  // how every other Image FX mode resets on reveal.
  const positionsRef = useRef<Map<string, Position> | null>(null);
  if (!positionsRef.current) {
    const map = new Map<string, Position>();
    for (const file of GALLERY_IMAGE_FILES) {
      map.set(file, randomPosition(stageSize.width, stageSize.height));
    }
    positionsRef.current = map;
  }

  const tileNodesRef = useRef(new Map<string, HTMLDivElement>());

  // Hover = selected for this mode (no separate select action) — real
  // 2D rect containment, since positions are arbitrary (no row/grid to
  // reduce to an X-only rule the way the flat gallery does).
  let hoveredFile: string | null = null;
  if (pointerScreenPos) {
    for (const [file, node] of tileNodesRef.current) {
      const rect = node.getBoundingClientRect();
      if (
        pointerScreenPos.x >= rect.left &&
        pointerScreenPos.x <= rect.right &&
        pointerScreenPos.y >= rect.top &&
        pointerScreenPos.y <= rect.bottom
      ) {
        hoveredFile = file;
        break;
      }
    }
  }
  const hoveredFileRef = useRef<string | null>(null);
  hoveredFileRef.current = hoveredFile;

  // Right index finger raised and positioned on a card selects AND
  // starts dragging it, right there — no pinch. It keeps following the
  // fingertip every frame (also catching the finger sweeping onto a
  // card while already raised, not just the moment it's raised) for as
  // long as the finger stays up; lowering it ends the drag wherever the
  // card was left. Once a drag starts it stays locked to that file
  // (doesn't re-target) even if the fingertip briefly overlaps another
  // card's rect mid-drag.
  const draggedFileRef = useRef<string | null>(null);
  useEffect(() => {
    if (!rightIndexExtended) {
      draggedFileRef.current = null;
      return;
    }
    if (!draggedFileRef.current && hoveredFileRef.current) {
      draggedFileRef.current = hoveredFileRef.current;
    }
    const file = draggedFileRef.current;
    if (!file || !pointerScreenPos) return;
    positionsRef.current?.set(file, {
      x: pointerScreenPos.x - TILE_WIDTH / 2,
      y: pointerScreenPos.y - TILE_HEIGHT / 2,
    });
  }, [rightIndexExtended, pointerScreenPos?.x, pointerScreenPos?.y]);

  return (
    <div className="scattered-gallery">
      {GALLERY_IMAGE_FILES.map((file) => {
        const position = positionsRef.current!.get(file)!;
        const isSelected = hoveredFile === file || draggedFileRef.current === file;
        return (
          <div
            key={file}
            className={`scattered-gallery-item${isSelected ? ' scattered-gallery-item--selected' : ''}`}
            style={{ left: position.x, top: position.y, width: TILE_WIDTH, height: TILE_HEIGHT }}
            ref={(node) => {
              if (node) tileNodesRef.current.set(file, node);
              else tileNodesRef.current.delete(file);
            }}
          >
            <img src={`/${file}`} alt="" draggable={false} />
          </div>
        );
      })}
    </div>
  );
}
