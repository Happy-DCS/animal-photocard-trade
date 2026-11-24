import { PHOTO_CARD_GRID_CLASS } from "@/components/card/cardGrid";
import ScaledPhotoCard from "@/components/card/ScaledPhotoCard";

export default function MarketCardList({ cards, onCardClick }) {
  return (
    <ul className={PHOTO_CARD_GRID_CLASS}>
      {cards.map((card) => (
        <li key={card.id} className="w-full min-w-0">
          <ScaledPhotoCard
            variant={card.variant}
            card={card.card}
            point={card.point}
            status={card.status}
            isSoldOut={card.isSoldOut}
            onClick={() => onCardClick?.(card)}
          />
        </li>
      ))}
    </ul>
  );
}
