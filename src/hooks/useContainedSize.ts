import { useEffect, useState } from 'react';

/**
 * Largest width/height that fits the window while preserving `aspectRatio`
 * (width / height) — a JS "object-fit: contain" for a whole container, since
 * CSS `aspect-ratio` doesn't reliably auto-size a childless flex item.
 */
export function useContainedSize(aspectRatio: number | null) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const ratio = aspectRatio ?? 16 / 9;

    function update() {
      const windowRatio = window.innerWidth / window.innerHeight;
      if (windowRatio > ratio) {
        const height = window.innerHeight;
        setSize({ width: height * ratio, height });
      } else {
        const width = window.innerWidth;
        setSize({ width, height: width / ratio });
      }
    }

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [aspectRatio]);

  return size;
}
