import { memo, Suspense, useMemo } from 'react';
import {
  baseHeight,
  tableDecorItems,
  type CatalogItem,
  type CatalogMap,
  type Hall,
  type Item,
  type Project,
} from '@salla/shared';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { BUILDERS, GenericBox } from './builders';
import { ChairInstances } from './ChairInstances';
import { GlbInstances, type PlacedModel } from './GlbInstances';
import { Hall3D } from './Hall3D';
import { Lighting } from './Lighting';
import { UplightWashes } from './UplightWashes';

interface ItemMeshProps {
  item: Item;
  cat: CatalogItem;
  hall: Hall;
  evening: boolean;
  baseY: number;
}

/** A procedurally built item (one builder per catalog type). */
const ItemMesh = memo(function ItemMesh({ item, cat, hall, evening, baseY }: ItemMeshProps) {
  const Builder = BUILDERS[item.type] ?? GenericBox;
  return (
    <group position={[item.x, baseY, item.y]} rotation={[0, (-item.rotation * Math.PI) / 180, 0]}>
      <Builder item={item} cat={cat} hall={hall} evening={evening} />
    </group>
  );
});

interface Props {
  project: Pick<Project, 'hall' | 'items'>;
  catalog: CatalogMap;
  evening: boolean;
  /** Bump when the (mutable) catalog map was reloaded, so the scene picks up new models. */
  catalogVersion?: number;
  /**
   * Off-screen renders (PDF, PNG, 360°): suspend until uploaded models are loaded instead of
   * showing the procedural stand-in, so the picture shows the real (scanned) decor.
   */
  waitForModels?: boolean;
}

/** The whole 3D hall built from the same project data as the 2D plan. */
export function HallScene({ project, catalog, evening, catalogVersion, waitForModels }: Props) {
  const { hall, items } = project;

  // Items with an uploaded .glb are grouped per catalog type and drawn instanced.
  const { procedural, models } = useMemo(() => {
    const procedural: Array<{ item: Item; cat: CatalogItem; baseY: number }> = [];
    const models = new Map<string, { cat: CatalogItem; placed: PlacedModel[] }>();
    // Decor chosen per table (Item.tableDecor) is placed like any other table-top item.
    const all = [...items, ...tableDecorItems(items, catalog)];
    for (const item of all) {
      const cat = catalog.get(item.type);
      if (!cat) continue;
      // Floor, table top, wall (its elevation) or ceiling (top against it).
      const baseY = baseHeight(item, all, catalog, hall.height);
      if (cat.modelFile) {
        const entry = models.get(cat.id) ?? { cat, placed: [] };
        entry.placed.push({ item, baseY });
        models.set(cat.id, entry);
      } else if (item.type !== 'chair') {
        // Plain chairs are instanced by ChairInstances.
        procedural.push({ item, cat, baseY });
      }
    }
    return { procedural, models: [...models.values()] };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalogVersion marks catalog changes
  }, [items, catalog, catalogVersion, hall.height]);

  return (
    <>
      <Lighting hall={hall} items={items} evening={evening} waitForEnv={waitForModels} />
      <Hall3D hall={hall} />
      {procedural.map(({ item, cat, baseY }) => (
        <ItemMesh key={item.id} item={item} cat={cat} hall={hall} evening={evening} baseY={baseY} />
      ))}
      {models.map(({ cat, placed }) => {
        // While the .glb loads, or if it is broken, show the procedural model instead.
        const fallback = placed.map(({ item, baseY }) => (
          <ItemMesh
            key={item.id}
            item={item}
            cat={cat}
            hall={hall}
            evening={evening}
            baseY={baseY}
          />
        ));
        return (
          <ErrorBoundary key={cat.id} fallback={fallback} resetKey={cat.modelFile}>
            {waitForModels ? (
              <GlbInstances cat={cat} placed={placed} />
            ) : (
              <Suspense fallback={fallback}>
                <GlbInstances cat={cat} placed={placed} />
              </Suspense>
            )}
          </ErrorBoundary>
        );
      })}
      <ChairInstances items={items} catalog={catalog} />
      <UplightWashes items={items} hall={hall} evening={evening} />
    </>
  );
}
