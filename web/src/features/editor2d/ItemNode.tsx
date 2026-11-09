import { memo } from 'react';
import { Circle, Group, Image as KonvaImage, Rect, Text, Line } from 'react-konva';
import type Konva from 'konva';
import {
  canopyStrands,
  isCanopy,
  chairPositions,
  decorPositions,
  type CatalogItem,
  type Item,
} from '@salla/shared';
import { BLUEPRINT, CM, FONT_UI, hexToRgba } from './units';
import { useLoadedImage } from './images';

interface Props {
  item: Item;
  cat: CatalogItem | undefined;
  selected: boolean;
  /** Label to draw in the center (user label or automatic T1, T2…). */
  label: string | undefined;
  /** Catalog item of the decor standing on this table (Item.tableDecor). */
  decor?: CatalogItem | undefined;
  /** A separately placed table-top item stands on this table: move the label out of its way. */
  decorated?: boolean;
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

/** Decor pieces on a table, drawn from their rendered top view (or as a small soft disc). */
function TableDecor({
  item,
  cat,
  decor,
  image,
}: {
  item: Item;
  cat: CatalogItem | undefined;
  decor: CatalogItem;
  image: HTMLImageElement | undefined;
}) {
  const span = Math.max(decor.width, decor.depth) * CM;
  return (
    <>
      {decorPositions(item, cat).map((p, i) =>
        image ? (
          <KonvaImage
            key={i}
            image={image}
            x={p.x * CM - span / 2}
            y={p.y * CM - span / 2}
            width={span}
            height={span}
            listening={false}
            perfectDrawEnabled={false}
          />
        ) : (
          <Circle
            key={i}
            x={p.x * CM}
            y={p.y * CM}
            radius={(decor.width * CM) / 2}
            fill={hexToRgba(decor.defaultColor, 0.7)}
            stroke={BLUEPRINT.lineSoft}
            strokeWidth={1}
            strokeScaleEnabled={false}
            listening={false}
          />
        ),
      )}
    </>
  );
}

/**
 * Ceiling decor over an area: only its outline reacts to taps (with a wide hit area for
 * fingers), so the tables under it stay selectable. The lines hint at the pattern.
 */
function CanopyShape({
  item,
  stroke,
  strokeWidth,
}: {
  item: Item;
  stroke: string;
  strokeWidth: number;
}) {
  const w = item.width * CM;
  const d = item.depth * CM;
  return (
    <>
      {canopyStrands(item).map((s, i) => (
        <Line
          key={i}
          points={[s.a.x * CM, s.a.z * CM, s.b.x * CM, s.b.z * CM]}
          stroke={hexToRgba(item.color, 0.35)}
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
        />
      ))}
      <Rect
        x={-w / 2}
        y={-d / 2}
        width={w}
        height={d}
        fillEnabled={false}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeScaleEnabled={false}
        hitStrokeWidth={28}
        dash={[12, 8]}
      />
    </>
  );
}

function ItemNodeImpl({
  item,
  cat,
  selected,
  label,
  decor,
  decorated,
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
  // Scanned decor: its rendered top view replaces the flat color fill.
  const topView = useLoadedImage(cat?.topView);
  // Hanging things (chandelier, ceiling decor) are drawn lighter so the floor shows through.
  const overhead = item.type === 'chandelier' || item.mount === 'ceiling';
  const fill = topView ? hexToRgba(item.color, 0.08) : hexToRgba(item.color, overhead ? 0.25 : 0.4);
  // Dashed: locked items (long dashes), wall and ceiling decor (short dashes).
  const dash = item.locked ? [10, 6] : item.mount ? [4, 4] : undefined;
  const canopy = isCanopy(item.type);
  const text = canopy ? undefined : (label ?? (showName ? cat?.name : undefined));
  const fontSize = label
    ? Math.max(18, Math.min(w, d) * (decor || decorated ? 0.2 : 0.3))
    : Math.max(14, Math.min(w, d, 400) * 0.14);
  // Text is counter-rotated to stay upright; keep its box inside the item so the
  // transformer bounds match the item itself.
  const upright = Math.round(item.rotation) % 180 === 0;
  const textWidth = (upright ? w : Math.min(w, d)) * 0.92;
  // Decor on the table sits in the middle; the label moves below it (still on the table).
  const decorImg = useLoadedImage(decor?.topView);
  const hasDecor = !!decor || !!decorated;
  const labelShift = hasDecor && label ? Math.min(w, d) * 0.3 : 0;

  const shape = canopy ? (
    <CanopyShape item={item} stroke={stroke} strokeWidth={strokeWidth} />
  ) : cat?.shape2d === 'circle' ? (
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
      {topView && (
        // The top view covers a max(width, depth) square around the center (see renderModel).
        <KonvaImage
          image={topView}
          x={-Math.max(w, d) / 2}
          y={-Math.max(w, d) / 2}
          width={Math.max(w, d)}
          height={Math.max(w, d)}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {shape}
      {decor && <TableDecor item={item} cat={cat} decor={decor} image={decorImg} />}
      {text ? (
        <Group y={labelShift} rotation={-item.rotation} listening={false}>
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
