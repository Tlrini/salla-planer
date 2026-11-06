import { chairPositions, type CatalogItem, type Item } from '@salla/shared';

const SIZE = 40;

/** Small top-view icon drawn from the catalog geometry (same look as the blueprint). */
export function CatalogIcon({ cat }: { cat: CatalogItem }) {
  // Scanned decor shows its rendered photo-like thumbnail.
  if (cat.thumbnail)
    return (
      <img
        className="catalog-icon catalog-thumb"
        src={cat.thumbnail}
        width={SIZE}
        height={SIZE}
        alt=""
        loading="lazy"
      />
    );
  const pseudo: Item = {
    id: 'icon',
    type: cat.id,
    x: 0,
    y: 0,
    rotation: 0,
    width: cat.width,
    depth: cat.depth,
    color: cat.defaultColor,
  };
  const chairs = chairPositions(pseudo, cat);
  const reach = chairs.length ? 0.55 : 0;
  const span = Math.max(cat.width + reach * 2, cat.depth + reach * 2, 0.5);
  const k = (SIZE - 6) / span;
  const w = Math.max(cat.width * k, 3);
  const d = Math.max(cat.depth * k, 3);
  const c = SIZE / 2;
  const fill = cat.defaultColor;
  return (
    <svg
      className="catalog-icon"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      aria-hidden
    >
      <rect width={SIZE} height={SIZE} rx={8} className="catalog-icon-bg" />
      {chairs.map((p, i) => (
        <rect
          key={i}
          x={c + p.x * k - 0.22 * k}
          y={c + p.y * k - 0.22 * k}
          width={0.45 * k}
          height={0.45 * k}
          rx={1.5}
          className="catalog-icon-chair"
        />
      ))}
      {cat.shape2d === 'circle' ? (
        <ellipse
          cx={c}
          cy={c}
          rx={w / 2}
          ry={d / 2}
          fill={fill}
          fillOpacity={0.45}
          className="catalog-icon-shape"
        />
      ) : (
        <rect
          x={c - w / 2}
          y={c - d / 2}
          width={w}
          height={d}
          rx={1.5}
          fill={fill}
          fillOpacity={0.45}
          className="catalog-icon-shape"
        />
      )}
    </svg>
  );
}
