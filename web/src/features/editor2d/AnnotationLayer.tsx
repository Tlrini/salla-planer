import { memo } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import { formatMeters, type Annotation } from '@salla/shared';
import { BLUEPRINT, CM, FONT_MONO, FONT_UI, hexToRgba } from './units';

interface Props {
  annotations: readonly Annotation[];
  /** Stage scale (px per cm) to keep measurement labels a constant screen size. */
  scale: number;
  selectedId?: string | null;
  /** Interactive (editor) or static (PDF snapshot). */
  onSelect?: (id: string) => void;
  onMove?: (id: string, dx: number, dy: number) => void;
  /** Zones are drawn under the decor, measurements and texts above it. */
  only: 'below' | 'above';
}

const SEL = BLUEPRINT.selection;

function MeasureShape({
  a,
  scale,
  selected,
}: {
  a: Extract<Annotation, { kind: 'measure' }>;
  scale: number;
  selected: boolean;
}) {
  const px = (n: number) => n / scale;
  const x1 = a.x1 * CM;
  const y1 = a.y1 * CM;
  const x2 = a.x2 * CM;
  const y2 = a.y2 * CM;
  const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  // End ticks perpendicular to the line.
  const t = px(7);
  const nx = -Math.sin(ang) * t;
  const ny = Math.cos(ang) * t;
  const color = selected ? SEL : '#FFD98A';
  const label = formatMeters(len, 2);
  const fs = px(13);
  const deg = (ang * 180) / Math.PI;
  const upright = deg > 90 || deg < -90 ? deg + 180 : deg;
  return (
    <>
      <Line
        points={[x1, y1, x2, y2]}
        stroke={color}
        strokeWidth={2}
        strokeScaleEnabled={false}
        dash={[8, 5]}
      />
      <Line
        points={[x1 - nx, y1 - ny, x1 + nx, y1 + ny]}
        stroke={color}
        strokeWidth={2}
        strokeScaleEnabled={false}
      />
      <Line
        points={[x2 - nx, y2 - ny, x2 + nx, y2 + ny]}
        stroke={color}
        strokeWidth={2}
        strokeScaleEnabled={false}
      />
      <Group x={(x1 + x2) / 2} y={(y1 + y2) / 2} rotation={upright}>
        <Rect
          x={-label.length * fs * 0.32 - px(4)}
          y={-fs - px(6)}
          width={label.length * fs * 0.64 + px(8)}
          height={fs + px(4)}
          fill={BLUEPRINT.paper}
          opacity={0.85}
          cornerRadius={px(3)}
        />
        <Text
          text={label}
          fontFamily={FONT_MONO}
          fontSize={fs}
          fill={color}
          align="center"
          width={label.length * fs * 0.64}
          offsetX={(label.length * fs * 0.64) / 2}
          y={-fs - px(4)}
        />
      </Group>
    </>
  );
}

function AnnotationNode({
  a,
  scale,
  selected,
  onSelect,
  onMove,
}: {
  a: Annotation;
  scale: number;
  selected: boolean;
  onSelect?: (id: string) => void;
  onMove?: (id: string, dx: number, dy: number) => void;
}) {
  const interactive = !!onSelect;
  const common = {
    name: 'annotation',
    draggable: interactive,
    listening: interactive,
    onPointerDown: (e: Konva.KonvaEventObject<PointerEvent>) => {
      e.cancelBubble = true;
      onSelect?.(a.id);
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      onMove?.(a.id, node.x() / CM, node.y() / CM);
      node.position({ x: 0, y: 0 });
    },
  };
  if (a.kind === 'zone') {
    const fs = Math.max(14 / scale, Math.min(a.width, a.height) * CM * 0.08);
    return (
      <Group {...common}>
        <Rect
          x={a.x * CM}
          y={a.y * CM}
          width={a.width * CM}
          height={a.height * CM}
          fill={hexToRgba(a.color, 0.18)}
          stroke={selected ? SEL : a.color}
          strokeWidth={selected ? 2.5 : 1.5}
          strokeScaleEnabled={false}
          dash={[10, 6]}
          cornerRadius={8 / scale}
        />
        {a.label && (
          <Text
            x={a.x * CM + 8 / scale}
            y={a.y * CM + 6 / scale}
            width={a.width * CM - 16 / scale}
            text={a.label}
            fontFamily={FONT_UI}
            fontStyle="600"
            fontSize={fs}
            fill={a.color}
            wrap="none"
            ellipsis
          />
        )}
      </Group>
    );
  }
  if (a.kind === 'text') {
    return (
      <Group {...common}>
        <Text
          x={a.x * CM}
          y={a.y * CM}
          text={a.text}
          fontFamily={FONT_UI}
          fontStyle="600"
          fontSize={a.size * CM}
          fill={selected ? SEL : BLUEPRINT.text}
          shadowColor={BLUEPRINT.paper}
          shadowBlur={4 / scale}
        />
      </Group>
    );
  }
  return (
    <Group {...common}>
      <MeasureShape a={a} scale={scale} selected={selected} />
      {/* Wider invisible line so a thin measurement is easy to tap. */}
      <Line
        points={[a.x1 * CM, a.y1 * CM, a.x2 * CM, a.y2 * CM]}
        stroke="transparent"
        strokeWidth={24}
        strokeScaleEnabled={false}
      />
    </Group>
  );
}

/** Measurements, texts and zones drawn on the plan (Project.annotations). */
function AnnotationLayerImpl({ annotations, scale, selectedId, onSelect, onMove, only }: Props) {
  return (
    <>
      {annotations
        .filter((a) => (only === 'below' ? a.kind === 'zone' : a.kind !== 'zone'))
        .map((a) => (
          <AnnotationNode
            key={a.id}
            a={a}
            scale={scale}
            selected={a.id === selectedId}
            onSelect={onSelect}
            onMove={onMove}
          />
        ))}
    </>
  );
}

export const AnnotationLayer = memo(AnnotationLayerImpl);

/** Live preview while dragging a measurement or a zone. */
export function ToolPreview({
  tool,
  from,
  to,
  scale,
}: {
  tool: 'measure' | 'zone' | 'calibrate';
  from: { x: number; y: number };
  to: { x: number; y: number };
  scale: number;
}) {
  if (tool === 'zone')
    return (
      <AnnotationNode
        a={{
          id: 'preview',
          kind: 'zone',
          x: Math.min(from.x, to.x),
          y: Math.min(from.y, to.y),
          width: Math.max(0.01, Math.abs(to.x - from.x)),
          height: Math.max(0.01, Math.abs(to.y - from.y)),
          color: '#C9A44C',
        }}
        scale={scale}
        selected
      />
    );
  return (
    <MeasureShape
      a={{ id: 'preview', kind: 'measure', x1: from.x, y1: from.y, x2: to.x, y2: to.y }}
      scale={scale}
      selected={tool === 'calibrate'}
    />
  );
}
