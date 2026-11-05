import type { JSX } from 'react';
import type { CatalogItem, Hall, Item } from '@salla/shared';

export interface BuilderProps {
  item: Item;
  cat: CatalogItem;
  hall: Hall;
  evening: boolean;
}

/** Builds the item in its local frame: centered at the origin, width along x, depth along z, floor at y = 0. */
export type Builder = (props: BuilderProps) => JSX.Element | null;

/** Item height: explicit override, else catalog height. */
export const heightOf = (item: Item, cat: CatalogItem) => item.height ?? cat.height;
