import { useMemo } from 'react';
import { sq } from '../../i18n/sq';
import { useEditor } from '../../model/store';
import { AnnotationProperties } from './AnnotationProperties';
import { HallSettings } from './HallSettings';
import { ItemProperties } from './ItemProperties';
import { ProjectSettings } from './ProjectSettings';
import { Summary } from './Summary';

/** Right panel: selected item properties, or project + hall settings and the summary. */
export function PropertiesPanel({ kind }: { kind: 'project' | 'hall' }) {
  const items = useEditor((s) => s.project.items);
  const selection = useEditor((s) => s.selection);
  const selected = useMemo(() => items.filter((i) => selection.includes(i.id)), [items, selection]);
  const annotation = useEditor((s) =>
    s.annotationId ? s.project.annotations?.find((a) => a.id === s.annotationId) : undefined,
  );
  if (annotation) return <AnnotationProperties key={annotation.id} annotation={annotation} />;

  if (selected.length > 0) {
    return (
      <div className="panel-section">
        <ItemProperties items={selected} />
      </div>
    );
  }
  if (kind === 'hall') {
    return (
      <>
        <p className="note">{sq.halls.editorHint}</p>
        <HallSettings />
      </>
    );
  }
  return (
    <>
      <Summary />
      <ProjectSettings />
      <HallSettings />
    </>
  );
}
