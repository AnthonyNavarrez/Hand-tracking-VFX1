import { useCamera } from '../context/CameraContext';
import { useTracking } from '../context/TrackingContext';
import { useWindowSize } from '../hooks/useWindowSize';
import { getRightHandIndexTip } from '../tracking/gestures';
import { landmarkToScreen } from '../tracking/corners';
import { TiltedCard } from './TiltedCard';
import './ImageGallery.css';

// Row order follows the numeric filename suffix (nature1 → nature10),
// left to right, regardless of file extension.
const IMAGE_FILES = [
  'nature1.jpg',
  'nature2.jpg',
  'nature3.webp',
  'nature4.jpg',
  'nature5.avif',
  'nature6.jpeg',
  'nature7.webp',
  'nature8.webp',
  'nature9.webp',
  'nature10.webp',
];

function captionFor(file: string): string {
  const base = file.replace(/\.[^.]+$/, '').replace(/(\d+)$/, ' $1');
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function ImageGallery() {
  const { videoSize } = useCamera();
  const { result: handResult } = useTracking();
  const stageSize = useWindowSize();

  // Same technique as HandVfxTool's rightHandScreenPos — drives
  // TiltedCard's tilt/scale springs in place of a real mouse position.
  const rightIndexTipLandmark = getRightHandIndexTip(handResult);
  const pointerScreenPos =
    rightIndexTipLandmark && videoSize ? landmarkToScreen(rightIndexTipLandmark, videoSize, stageSize) : null;

  return (
    <div className="image-gallery-row">
      {IMAGE_FILES.map((file) => (
        <div key={file} className="image-gallery-card-slot">
          <TiltedCard
            imageSrc={`/${file}`}
            altText={captionFor(file)}
            showTooltip={false}
            containerWidth="100%"
            containerHeight="100%"
            imageWidth="100%"
            imageHeight="100%"
            rotateAmplitude={10}
            scaleOnHover={1.08}
            pointerScreenPos={pointerScreenPos}
          />
        </div>
      ))}
    </div>
  );
}
