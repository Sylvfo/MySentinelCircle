import { CircleType } from '@prisma/client';

// Every new account starts with these, empty, as a base to fill in.
export const DEFAULT_CIRCLES = [
  { label: 'Premier cercle', circleType: CircleType.FIRST },
  { label: 'Voisins', circleType: CircleType.BASIC },
  { label: 'Sport', circleType: CircleType.BASIC },
  { label: 'Travail', circleType: CircleType.BASIC },
];
