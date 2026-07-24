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

export function ImageGallery() {
  return (
    <div className="image-gallery-row">
      {IMAGE_FILES.map((file) => (
        <img key={file} className="image-gallery-card" src={`/${file}`} alt="" />
      ))}
    </div>
  );
}
