import { Group, Rect, Text } from 'react-konva';
import { formatDecimal, itemBox, type Item } from '@salla/shared';
import { catalogMap } from '../../model/store';
import { BLUEPRINT, CM, FONT_MONO } from './units';

/** Size readout next to a single selected item (constant screen size). */
export function SelectionInfo({ selected, scale }: { selected: Item[]; scale: number }) {
  if (selected.length !== 1) return null;
  const item = selected[0]!;
  const cat = catalogMap.get(item.type);
  const box = itemBox(item, cat);
  const text =
    cat?.shape2d === 'circle' && item.width === item.depth
      ? `Ø ${formatDecimal(item.width)} m`
      : `${formatDecimal(item.width)} × ${formatDecimal(item.depth)} m`;
  const font = 12 / scale;
  const padX = 6 / scale;
  const padY = 3 / scale;
  const width = text.length * font * 0.62 + padX * 2;
  const height = font + padY * 2;
  const x = box.maxX * CM + 10 / scale;
  const y = box.minY * CM - height - 6 / scale;
  return (
    <Group x={x} y={y}>
      <Rect
        width={width}
        height={height}
        fill={BLUEPRINT.paper}
        stroke={BLUEPRINT.selection}
        strokeWidth={1}
        strokeScaleEnabled={false}
        cornerRadius={4 / scale}
      />
      <Text
        x={padX}
        y={padY}
        text={text}
        fontSize={font}
        fontFamily={FONT_MONO}
        fill={BLUEPRINT.selection}
      />
    </Group>
  );
}
