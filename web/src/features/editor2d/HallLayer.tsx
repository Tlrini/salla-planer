import { memo } from 'react';
import { Arc, Circle, Group, Image as KonvaImage, Line, Rect, Shape, Text } from 'react-konva';
import type Konva from 'konva';
import { formatMeters, isRound, type Hall, type Item } from '@salla/shared';
import { sq } from '../../i18n/sq';
import { BLUEPRINT, CM, FONT_MONO } from './units';
import { useLoadedImage } from './images';

interface Props {
  hall: Hall;
  /** Current stage scale (px per cm), used to keep line labels a constant screen size. */
  scale: number;
}

function gridScene(w: number, h: number, every: number, skip: number) {
  return (ctx: Konva.Context, shape: Konva.Shape) => {
    ctx.beginPath();
    for (let x = every; x < w; x += every) {
      if (skip && Math.round(x) % skip === 0) continue;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = every; y < h; y += every) {
      if (skip && Math.round(y) % skip === 0) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.strokeShape(shape);
  };
}

function StructureNode({ item }: { item: Item }) {
  const w = item.width * CM;
  const d = item.depth * CM;
  const common = { x: item.x * CM, y: item.y * CM, rotation: item.rotation, listening: false };
  if (item.type === 'door') {
    return (
      <Group {...common}>
        <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill={BLUEPRINT.paper} />
        <Arc
          x={-w / 2}
          y={-d / 2}
          innerRadius={0}
          outerRadius={w}
          angle={90}
          rotation={-90}
          stroke={BLUEPRINT.lineSoft}
          strokeWidth={1}
          strokeScaleEnabled={false}
          dash={[8, 8]}
        />
        <Line
          points={[-w / 2, -d / 2, -w / 2, -d / 2 - w]}
          stroke={BLUEPRINT.line}
          strokeWidth={1.5}
          strokeScaleEnabled={false}
        />
      </Group>
    );
  }
  if (item.type === 'window') {
    return (
      <Group {...common}>
        <Rect
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={d}
          fill={BLUEPRINT.paper}
          stroke={BLUEPRINT.line}
          strokeWidth={1}
          strokeScaleEnabled={false}
        />
        <Line
          points={[-w / 2, 0, w / 2, 0]}
          stroke={BLUEPRINT.line}
          strokeWidth={1}
          strokeScaleEnabled={false}
        />
      </Group>
    );
  }
  return (
    <Group {...common}>
      <Rect
        x={-w / 2}
        y={-d / 2}
        width={w}
        height={d}
        fill="rgba(222, 236, 255, 0.35)"
        stroke={BLUEPRINT.line}
        strokeWidth={1.5}
        strokeScaleEnabled={false}
      />
    </Group>
  );
}

/** Clips to the circle inside a square of side `size`. */
const clipCircle = (size: number) => (ctx: Konva.Context) => {
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
};

function HallLayerImpl({ hall, scale }: Props) {
  const w = hall.width * CM;
  const h = hall.length * CM;
  const px = (n: number) => n / scale;
  const font = px(13);
  const off = px(22);
  const tick = px(6);
  const u = hall.underlay;
  const round = isRound(hall);
  const photo = useLoadedImage(u?.url);

  return (
    <Group>
      {round ? (
        <Circle name="background" x={w / 2} y={h / 2} radius={w / 2} fill={BLUEPRINT.hallFill} />
      ) : (
        <Rect name="background" x={0} y={0} width={w} height={h} fill={BLUEPRINT.hallFill} />
      )}
      {u && photo && (
        // Photo of the real floor plan, under the grid and the decor.
        <KonvaImage
          image={photo}
          x={u.x * CM}
          y={u.y * CM}
          width={u.width * CM}
          height={u.height * CM}
          opacity={u.opacity}
          listening={false}
        />
      )}
      <Group listening={false} clipFunc={round ? clipCircle(w) : undefined}>
        <Shape
          sceneFunc={gridScene(w, h, CM, 5 * CM)}
          stroke={BLUEPRINT.gridMinor}
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
        />
        <Shape
          sceneFunc={gridScene(w, h, 5 * CM, 0)}
          stroke={BLUEPRINT.gridMajor}
          strokeWidth={1}
          strokeScaleEnabled={false}
          listening={false}
        />
      </Group>
      {round ? (
        <Circle
          x={w / 2}
          y={h / 2}
          radius={w / 2}
          stroke={BLUEPRINT.line}
          strokeWidth={3}
          strokeScaleEnabled={false}
          listening={false}
        />
      ) : (
        <Rect
          x={0}
          y={0}
          width={w}
          height={h}
          stroke={BLUEPRINT.line}
          strokeWidth={3}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}

      {hall.structure.map((s) => (
        <StructureNode key={s.id} item={s} />
      ))}

      {/* width along the top */}
      <Group listening={false}>
        <Line
          points={[0, -off, w, -off]}
          stroke={BLUEPRINT.lineSoft}
          strokeWidth={1}
          strokeScaleEnabled={false}
        />
        <Line
          points={[0, -off - tick, 0, -off + tick]}
          stroke={BLUEPRINT.lineSoft}
          strokeWidth={1}
          strokeScaleEnabled={false}
        />
        <Line
          points={[w, -off - tick, w, -off + tick]}
          stroke={BLUEPRINT.lineSoft}
          strokeWidth={1}
          strokeScaleEnabled={false}
        />
        <Text
          x={0}
          y={-off - font * 1.5}
          width={w}
          align="center"
          text={round ? sq.hall.diameterValue(formatMeters(hall.width)) : formatMeters(hall.width)}
          fontSize={font}
          fontFamily={FONT_MONO}
          fill={BLUEPRINT.text}
        />
      </Group>
      {/* length along the left; a circle needs only its diameter */}
      <Group listening={false} visible={!round}>
        <Line
          points={[-off, 0, -off, h]}
          stroke={BLUEPRINT.lineSoft}
          strokeWidth={1}
          strokeScaleEnabled={false}
        />
        <Line
          points={[-off - tick, 0, -off + tick, 0]}
          stroke={BLUEPRINT.lineSoft}
          strokeWidth={1}
          strokeScaleEnabled={false}
        />
        <Line
          points={[-off - tick, h, -off + tick, h]}
          stroke={BLUEPRINT.lineSoft}
          strokeWidth={1}
          strokeScaleEnabled={false}
        />
        <Text
          x={-off - font * 1.5}
          y={h}
          width={h}
          rotation={-90}
          align="center"
          text={formatMeters(hall.length)}
          fontSize={font}
          fontFamily={FONT_MONO}
          fill={BLUEPRINT.text}
        />
      </Group>
    </Group>
  );
}

export const HallLayer = memo(HallLayerImpl);
