import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type Konva from 'konva';
import { Layer, Rect, Stage } from 'react-konva';
import {
  autoLabels,
  halfExtents,
  type Annotation,
  type CatalogItem,
  type Hall,
  type Item,
} from '@salla/shared';
import { HallLayer } from '../editor2d/HallLayer';
import { AnnotationLayer } from '../editor2d/AnnotationLayer';
import { tablesUnderDecor } from '../editor2d/BlueprintStage';
import { ItemNode } from '../editor2d/ItemNode';
import { BLUEPRINT, CM, layerRank } from '../editor2d/units';
import { preloadImages } from '../editor2d/images';

export interface BlueprintImage {
  url: string;
  width: number;
  height: number;
}

const PAD = 70;
const noop = () => {};
const passThrough = (pos: Konva.Vector2d) => pos;

function Plan({
  hall,
  items,
  catalog,
  width,
  height,
  pixelRatio,
  onDone,
  annotations,
}: {
  annotations: readonly Annotation[];
  hall: Hall;
  items: readonly Item[];
  catalog: ReadonlyMap<string, CatalogItem>;
  width: number;
  height: number;
  pixelRatio: number;
  onDone: (img: BlueprintImage) => void;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const scale = Math.min(
    (width - 2 * PAD) / (hall.width * CM),
    (height - 2 * PAD) / (hall.length * CM),
  );
  const x = (width - hall.width * CM * scale) / 2;
  const y = (height - hall.length * CM * scale) / 2;
  const labels = autoLabels(items, catalog);
  const decorated = tablesUnderDecor(items);
  const sorted = [...items].sort((a, b) => layerRank(a.type, a.mount) - layerRank(b.type, b.mount));

  useEffect(() => {
    void document.fonts.ready.then(() => {
      const stage = stageRef.current!;
      stage.draw();
      onDone({
        url: stage.toDataURL({ pixelRatio, mimeType: 'image/png' }),
        width: width * pixelRatio,
        height: height * pixelRatio,
      });
    });
  }, [onDone, pixelRatio, width, height]);

  return (
    <Stage ref={stageRef} width={width} height={height}>
      <Layer listening={false}>
        <Rect x={0} y={0} width={width} height={height} fill={BLUEPRINT.paper} />
      </Layer>
      <Layer listening={false} x={x} y={y} scaleX={scale} scaleY={scale}>
        <HallLayer hall={hall} scale={scale} />
        <AnnotationLayer annotations={annotations} scale={scale} only="below" />
        {sorted.map((item) => {
          const cat = catalog.get(item.type);
          const ext = halfExtents(item, cat);
          return (
            <ItemNode
              key={item.id}
              item={{ ...item, locked: false }}
              cat={cat}
              selected={false}
              label={item.label?.trim() || labels.get(item.id)}
              decor={item.tableDecor ? catalog.get(item.tableDecor) : undefined}
              decorated={decorated.has(item.id)}
              showName={ext.hx * 2 >= 1.5 && ext.hy * 2 >= 0.25}
              dragBoundFunc={passThrough}
              onPointerDown={noop}
              onDragEnd={noop}
              onTap={noop}
            />
          );
        })}
        <AnnotationLayer annotations={annotations} scale={scale} only="above" />
      </Layer>
    </Stage>
  );
}

/**
 * Renders the 2D blueprint (with labels and dimensions) off-screen at high resolution,
 * independent of the live editor's zoom and selection.
 */
export async function renderBlueprint(
  hall: Hall,
  items: readonly Item[],
  catalog: ReadonlyMap<string, CatalogItem>,
  {
    width = 1600,
    pixelRatio = 2.5,
    annotations = [],
  }: { width?: number; pixelRatio?: number; annotations?: readonly Annotation[] } = {},
): Promise<BlueprintImage> {
  // The floor-plan photo is a drawing aid, not part of the printed plan.
  hall = { ...hall, underlay: undefined };
  // Top views of scanned decor must be loaded before the one-shot draw.
  await preloadImages(
    items.flatMap((i) => [
      catalog.get(i.type)?.topView,
      i.tableDecor ? catalog.get(i.tableDecor)?.topView : undefined,
    ]),
  );
  const height = Math.round(((width - 2 * PAD) * hall.length) / hall.width + 2 * PAD);
  const host = document.createElement('div');
  const root = createRoot(host);
  return new Promise<BlueprintImage>((resolve, reject) => {
    const done = (img: BlueprintImage) => {
      resolve(img);
      setTimeout(() => root.unmount(), 0);
    };
    try {
      root.render(
        <Plan
          hall={hall}
          items={items}
          catalog={catalog}
          width={width}
          height={height}
          pixelRatio={pixelRatio}
          onDone={done}
          annotations={annotations}
        />,
      );
    } catch (err) {
      root.unmount();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
