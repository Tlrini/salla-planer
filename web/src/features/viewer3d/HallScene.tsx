import { memo, Suspense } from 'react';
import {
  supportHeight,
  type CatalogItem,
  type CatalogMap,
  type Hall,
  type Item,
  type Project,
} from '@salla/shared';
import { BUILDERS, GenericBox } from './builders';
import { ChairInstances } from './ChairInstances';
import { GlbModel } from './GlbModel';
import { Hall3D } from './Hall3D';
import { Lighting } from './Lighting';
import { UplightWashes } from './UplightWashes';
import { heightOf } from './builders/types';

interface ItemMeshProps {
  item: Item;
  cat: CatalogItem;
  hall: Hall;
  evening: boolean;
  baseY: number;
}

const ItemMesh = memo(function ItemMesh({ item, cat, hall, evening, baseY }: ItemMeshProps) {
  const Builder = BUILDERS[item.type] ?? GenericBox;
  const procedural = <Builder item={item} cat={cat} hall={hall} evening={evening} />;
  return (
    <group position={[item.x, baseY, item.y]} rotation={[0, (-item.rotation * Math.PI) / 180, 0]}>
      {cat.modelFile ? (
        <Suspense fallback={procedural}>
          <GlbModel
            url={cat.modelFile}
            width={item.width}
            depth={item.depth}
            height={heightOf(item, cat) || 1}
          />
        </Suspense>
      ) : (
        procedural
      )}
    </group>
  );
});

interface Props {
  project: Pick<Project, 'hall' | 'items'>;
  catalog: CatalogMap;
  evening: boolean;
}

/** The whole 3D hall built from the same project data as the 2D plan. */
export function HallScene({ project, catalog, evening }: Props) {
  const { hall, items } = project;
  return (
    <>
      <Lighting hall={hall} items={items} evening={evening} />
      <Hall3D hall={hall} />
      {items.map((item) => {
        const cat = catalog.get(item.type);
        // Chairs: instanced (custom GLB chairs are drawn per item instead).
        if (!cat || (item.type === 'chair' && !cat.modelFile)) return null;
        return (
          <ItemMesh
            key={item.id}
            item={item}
            cat={cat}
            hall={hall}
            evening={evening}
            baseY={supportHeight(item, items, catalog)}
          />
        );
      })}
      <ChairInstances items={items} catalog={catalog} />
      <UplightWashes items={items} hall={hall} evening={evening} />
    </>
  );
}
