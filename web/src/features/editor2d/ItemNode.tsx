import { memo } from 'react';
import { Circle, Group, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import { chairPositions, type CatalogItem, type Item } from '@salla/shared';
import { BLUEPRINT, CM, FONT_UI, hexToRgba } from './units';

interface Props {
  item: Item;
  cat: CatalogItem | undefined;
  selected: boolean;
  /** Label to draw in the center (user label or automatic T1, T2…). */
  label: string | undefined;
  showName: boolean;
  dragBoundFunc: (this: Konva.Node, pos: Konva.Vector2d) => Konva.Vector2d;
  onPointerDown: (e: Konva.KonvaEventObject<PointerEvent>, id: string) => void;
  onDragEnd: (id: string) => void;
  onTap: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent | PointerEvent>, id: string) => void;
}

const CHAIR = 45;
const CHAIR_FALLBACK = '#C9A44C';

function Chairs({ item, cat }: { item: Item; cat: CatalogItem | undefined }) {
  const poses = chairPositions(item, cat);
  if (poses.length === 0) return null;
  const fill = hexToRgba(item.color2 ?? cat?.defaultColor2 ?? CHAIR_FALLBACK, 0.55);
  return (
    <>
      {poses.map((p, i) => (
        <Group key={i} x={p.x * CM} y={p.y * CM} rotation={p.rotation} listening={false}>
          <Rect
            x={-CHAIR / 2}
            y={-CHAIR / 2}
            width={CHAIR}
            height={CHAIR}
            cornerRadius={8}
            fill={fill}
            stroke={BLUEPRINT.lineSoft}
            strokeWidth={1}
            strokeScaleEnabled={false}
            perfectDrawEnabled={false}
          />
          <Rect
            x={-CHAIR / 2}
            y={-CHAIR / 2}
            width={CHAIR}
            height={8}
            fill={BLUEPRINT.lineSoft}
            perfectDrawEnabled={false}
          />
        </Group>
      ))}
    </>
  );
}

function ItemNodeImpl({
  item,
  cat,
  selected,
  label,
  showName,
  dragBoundFunc,
  onPointerDown,
  onDragEnd,
  onTap,
}: Props) {
  const w = item.width * CM;
  const d = item.depth * CM;
  const stroke = selected ? BLUEPRINT.selection : BLUEPRINT.line;
  const strokeWidth = selected ? 2.5 : 1.5;
  const fill = hexToRgba(item.color, item.type === 'chandelier' ? 0.25 : 0.4);
  const dash = item.locked ? [10, 6] : undefined;
  const text = label ?? (showName ? cat?.name : undefined);
  const fontSize = label
    ? Math.max(18, Math.min(w, d) * 0.3)
    : Math.max(14, Math.min(w, d, 400) * 0.14);
  // Text is counter-rotated to stay upright; keep its box inside the item so the
  // transformer bounds match the item itself.
  const upright = Math.round(item.rotation) % 180 === 0;
  const textWidth = (upright ? w : Math.min(w, d)) * 0.92;

  const shape =
    cat?.shape2d === 'circle' ? (
      <Circle
        radius={w / 2}
        scaleY={d / w}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeScaleEnabled={false}
        dash={dash}
      />
    ) : (
      <Rect
        x={-w / 2}
        y={-d / 2}
        width={w}
        height={d}
        cornerRadius={Math.min(6, w / 4, d / 4)}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeScaleEnabled={false}
        dash={dash}
      />
    );

  return (
    <Group
      id={item.id}
      name="item"
      x={item.x * CM}
      y={item.y * CM}
      rotation={item.rotation}
      draggable={!item.locked}
      dragBoundFunc={dragBoundFunc}
      onPointerDown={(e) => onPointerDown(e, item.id)}
      onDragEnd={() => onDragEnd(item.id)}
      onClick={(e) => onTap(e, item.id)}
      onTap={(e) => onTap(e, item.id)}
    >
      <Chairs item={item} cat={cat} />
      {shape}
      {text ? (
        <Group rotation={-item.rotation} listening={false}>
          <Text
            text={text}
            width={textWidth}
            offsetX={textWidth / 2}
            offsetY={fontSize / 2}
            align="center"
            fontSize={fontSize}
            fontFamily={FONT_UI}
            fontStyle={label ? '600' : 'normal'}
            fill={BLUEPRINT.text}
            wrap="none"
            ellipsis
          />
        </Group>
      ) : null}
    </Group>
  );
}

export const ItemNode = memo(ItemNodeImpl);
