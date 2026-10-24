export function ProductBadge({
  soldOut,
  badge,
}: {
  soldOut: boolean;
  badge: string | null;
}) {
  if (soldOut) {
    return (
      <span className="product-card__badge product-card__badge--sold-out">Épuisé</span>
    );
  }
  return badge ? <span className="product-card__badge">{badge}</span> : null;
}
