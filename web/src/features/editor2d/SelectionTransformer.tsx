import { useEffect, useRef, useState, type RefObject } from 'react';
import type Konva from 'konva';
import { Transformer } from 'react-konva';
import type { Item } from '@salla/shared';
import { catalogMap } from '../../model/store';
import { BLUEPRINT } from './units';

const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];

interface Props {
  stageRef: RefObject<Konva.Stage | null>;
  selected: Item[];
  onTransformEnd: (ids: string[]) => void;
}

function anchorsFor(selected: Item[]): string[] {
  if (selected.length !== 1) return [];
  const rule = catalogMap.get(selected[0]!.type)?.resizable;
  if (rule === 'width') return ['middle-left', 'middle-right'];
  if (rule === 'both')
    return [
      'top-left',
      'top-center',
      'top-right',
      'middle-right',
      'bottom-right',
      'bottom-center',
      'bottom-left',
      'middle-left',
    ];
  return [];
}

function useShiftKey(): boolean {
  const [shift, setShift] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => setShift(e.shiftKey);
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    return () => {
      window.removeEventListener('keydown', on);
      window.removeEventListener('keyup', on);
    };
  }, []);
  return shift;
}

/** Konva Transformer bound to the selected, unlocked items. */
export function SelectionTransformer({ stageRef, selected, onTransformEnd }: Props) {
  const trRef = useRef<Konva.Transformer>(null);
  const shift = useShiftKey();
  const movable = selected.filter((i) => !i.locked);

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = movable.map((i) => stage.findOne(`#${i.id}`)).filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  });

  return (
    <Transformer
      ref={trRef}
      rotateEnabled
      rotationSnaps={shift ? [] : ROTATION_SNAPS}
      rotationSnapTolerance={8}
      enabledAnchors={anchorsFor(movable)}
      keepRatio={false}
      flipEnabled={false}
      ignoreStroke
      borderStroke={BLUEPRINT.selection}
      borderDash={[4, 4]}
      anchorStroke={BLUEPRINT.selection}
      anchorFill="#ffffff"
      anchorSize={14}
      anchorCornerRadius={7}
      rotateAnchorOffset={28}
      padding={4}
      boundBoxFunc={(oldBox, newBox) =>
        Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8 ? oldBox : newBox
      }
      onTransformEnd={() => onTransformEnd((trRef.current?.nodes() ?? []).map((n) => n.id()))}
    />
  );
}
