import { regularCoverPreviewForColor } from '@/lib/notebook-cover-previews';
import { stationeryCoverUrl } from '@/lib/stationery-cover';

export default function StationeryCover({ title, color }: { title: string; color: string }) {
  const preview = regularCoverPreviewForColor(color);

  return (
    <>
      <img
        data-stationery-cover="front"
        className="stationery-cover-art"
        src={stationeryCoverUrl(title, color)}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'fill',
          zIndex: 6,
        }}
      />
      {preview ? (
        <img
          data-regular-cover-preview="true"
          className="stationery-cover-preview"
          src={preview.src}
          alt=""
          draggable={false}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
