// Shared by ImageGallery (flat row/selected layout) and DomeGallery
// (rotating dome layout) — same 10 images, two different presentations.
// Order follows the numeric filename suffix (nature1 → nature10), left
// to right / first to last, regardless of file extension.
export const GALLERY_IMAGE_FILES = [
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

export function galleryImageCaption(file: string): string {
  const base = file.replace(/\.[^.]+$/, '').replace(/(\d+)$/, ' $1');
  return base.charAt(0).toUpperCase() + base.slice(1);
}
