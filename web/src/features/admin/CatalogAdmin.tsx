import { useRef, useState } from 'react';
import { Check, Trash, Upload } from 'lucide-react';
import { type CatalogItem, type CatalogUpdate } from '@salla/shared';
import { api } from '../../api/client';
import { sq } from '../../i18n/sq';
import { loadCatalog } from '../../model/bootstrap';
import { catalog, useCatalogVersion } from '../../model/store';
import { CatalogIcon } from '../catalog/CatalogIcon';

function parseNum(s: string): number | null {
  const v = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(v) && v >= 0 ? v : null;
}

const show = (n: number) => String(n).replace('.', ',');

function Row({ item }: { item: CatalogItem }) {
  const [name, setName] = useState(item.name);
  const [w, setW] = useState(show(item.width));
  const [d, setD] = useState(show(item.depth));
  const [h, setH] = useState(show(item.height));
  const [price, setPrice] = useState(show(item.price));
  const [active, setActive] = useState(item.active);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

  const patch: CatalogUpdate | null = (() => {
    const nw = parseNum(w);
    const nd = parseNum(d);
    const nh = parseNum(h);
    const np = parseNum(price);
    if (nw === null || nd === null || nh === null || np === null || !name.trim()) return null;
    return { name: name.trim(), width: nw, depth: nd, height: nh, price: np, active };
  })();
  const dirty =
    patch !== null &&
    (patch.name !== item.name ||
      patch.width !== item.width ||
      patch.depth !== item.depth ||
      patch.height !== item.height ||
      patch.price !== item.price ||
      patch.active !== item.active);

  const save = async () => {
    if (!patch) return;
    setState('saving');
    try {
      await api.put(`/api/catalog/${item.id}`, patch);
      await loadCatalog();
      setState('saved');
    } catch {
      setState('error');
    }
  };

  const upload = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    setState('saving');
    try {
      await api.upload(`/api/catalog/${item.id}/model`, form);
      await loadCatalog();
      setState('saved');
    } catch {
      setState('error');
    }
  };

  const removeModel = async () => {
    await api.del(`/api/catalog/${item.id}/model`);
    await loadCatalog();
  };

  return (
    <tr>
      <td>
        <CatalogIcon cat={item} />
      </td>
      <td>
        <input aria-label={sq.admin.name} value={name} onChange={(e) => setName(e.target.value)} />
        <span className="muted small">{sq.categories[item.category]}</span>
      </td>
      <td className="size-cells">
        <input
          aria-label={`${sq.admin.size} W`}
          className="mono"
          inputMode="decimal"
          value={w}
          onChange={(e) => setW(e.target.value)}
        />
        <span>×</span>
        <input
          aria-label={`${sq.admin.size} D`}
          className="mono"
          inputMode="decimal"
          value={d}
          onChange={(e) => setD(e.target.value)}
        />
        <span>×</span>
        <input
          aria-label={`${sq.admin.size} H`}
          className="mono"
          inputMode="decimal"
          value={h}
          onChange={(e) => setH(e.target.value)}
        />
      </td>
      <td>
        <input
          aria-label={sq.admin.price}
          className="mono price-input"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </td>
      <td>
        <input
          type="checkbox"
          aria-label={sq.admin.active}
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      </td>
      <td className="model-cell">
        <span className="small muted">
          {item.modelFile ? item.modelFile.split('/').pop() : sq.admin.noModel}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".glb,model/gltf-binary"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={16} />
          <span>{sq.admin.upload}</span>
        </button>
        {item.modelFile && (
          <button
            type="button"
            className="icon-btn btn-danger"
            onClick={() => void removeModel()}
            title={sq.admin.removeModel}
            aria-label={sq.admin.removeModel}
          >
            <Trash size={16} />
          </button>
        )}
      </td>
      <td>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || state === 'saving'}
          onClick={() => void save()}
        >
          {state === 'saved' && !dirty ? <Check size={16} /> : null}
          <span>{state === 'saved' && !dirty ? sq.admin.saved : sq.admin.save}</span>
        </button>
        {state === 'error' && <p className="form-error small">{sq.admin.uploadError}</p>}
      </td>
    </tr>
  );
}

/** Admin: names, sizes, prices, active flag and optional .glb model per catalog item. */
export function CatalogAdmin() {
  useCatalogVersion();
  return (
    <div className="table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th aria-hidden />
            <th>{sq.admin.name}</th>
            <th>{sq.admin.size}</th>
            <th>{sq.admin.price}</th>
            <th>{sq.admin.active}</th>
            <th>{sq.admin.model}</th>
            <th aria-hidden />
          </tr>
        </thead>
        <tbody>
          {catalog.map((c) => (
            <Row key={`${c.id}|${c.modelFile ?? ''}`} item={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
