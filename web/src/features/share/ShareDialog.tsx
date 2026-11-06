import { useCallback, useEffect, useState } from 'react';
import { Copy, ExternalLink, Link2, Send, Star, Trash } from 'lucide-react';
import { formatDate, formatDateTime } from '@salla/shared';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { sq } from '../../i18n/sq';
import { flushSave } from '../../model/autosave';
import { useEditor } from '../../model/store';
import { ConfirmDialog } from '../editor/ConfirmDialog';

export interface ShareComment {
  id: string;
  author: string;
  text: string;
  fromClient: boolean;
  createdAt: string;
}

interface ShareInfo {
  token: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
  approval?: { optionId: string; optionName: string; by: string; at: string };
  comments: ShareComment[];
}

export const shareUrl = (token: string) =>
  `${window.location.origin}${window.location.pathname}#/share/${token}`;

/**
 * "Ndaj me klientin": private links the client opens on their own phone (no account) to walk
 * through the design, approve an option and comment.
 */
export function ShareDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} title={sq.share.title} onClose={onClose} wide>
      {open && <ShareBody onClose={onClose} />}
    </Modal>
  );
}

function ShareBody({ onClose }: { onClose: () => void }) {
  const id = useEditor((s) => s.meta?.id);
  const [shares, setShares] = useState<ShareInfo[] | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setShares(await api.get<ShareInfo[]>(`/api/projects/${id}/shares`));
    } catch {
      setError(true);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!id) return;
    // The client sees what is saved: save pending edits first.
    await flushSave();
    await api.post(`/api/projects/${id}/shares`, {});
    await load();
  };

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopied(token);
    } catch {
      // Clipboard needs HTTPS; the field is selectable as a fallback.
      setCopied(null);
    }
  };

  const active = (s: ShareInfo) => !s.revoked && Date.parse(s.expiresAt) > Date.now();

  return (
    <div className="share">
      <p className="muted small">{sq.share.intro}</p>
      <button type="button" className="btn btn-primary" onClick={() => void create()}>
        <Link2 size={18} />
        <span>{sq.share.create}</span>
      </button>
      {error && <p className="form-error">{sq.errors.offline}</p>}
      {shares?.length === 0 && <p className="muted">{sq.share.none}</p>}
      {shares?.map((s) => (
        <section key={s.token} className={`share-card${active(s) ? '' : ' inactive'}`}>
          <div className="share-url">
            <input
              readOnly
              value={shareUrl(s.token)}
              aria-label={sq.share.link}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={sq.share.copy}
              title={sq.share.copy}
              onClick={() => void copy(s.token)}
            >
              <Copy size={18} />
            </button>
            <a
              className="icon-btn"
              href={shareUrl(s.token)}
              target="_blank"
              rel="noreferrer"
              aria-label={sq.share.open}
              title={sq.share.open}
            >
              <ExternalLink size={18} />
            </a>
            {active(s) && (
              <button
                type="button"
                className="icon-btn btn-danger"
                aria-label={sq.share.revoke}
                title={sq.share.revoke}
                onClick={() => setRevoke(s.token)}
              >
                <Trash size={18} />
              </button>
            )}
          </div>
          <p className="muted small">
            {copied === s.token && <strong>{sq.share.copied} · </strong>}
            {s.revoked
              ? sq.share.revoked
              : active(s)
                ? sq.share.expires(formatDate(s.expiresAt))
                : sq.share.expired}
            {' · '}
            {sq.share.createdBy(s.createdBy, formatDateTime(s.createdAt))}
          </p>
          {s.approval && <Approval approval={s.approval} />}
          <Comments
            comments={s.comments}
            onSend={async (text) => {
              const comments = await api.post<ShareComment[]>(`/api/shares/${s.token}/comments`, {
                text,
              });
              setShares((list) =>
                (list ?? []).map((x) => (x.token === s.token ? { ...x, comments } : x)),
              );
            }}
          />
        </section>
      ))}
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {sq.common.close}
        </button>
      </div>
      <ConfirmDialog
        open={!!revoke}
        title={sq.share.revoke}
        confirmLabel={sq.share.revoke}
        danger
        onConfirm={async () => {
          if (revoke) await api.del(`/api/shares/${revoke}`);
          setRevoke(null);
          await load();
        }}
        onClose={() => setRevoke(null)}
      >
        <p>{sq.share.revokeBody}</p>
      </ConfirmDialog>
    </div>
  );
}

function Approval({ approval }: { approval: NonNullable<ShareInfo['approval']> }) {
  const finalId = useEditor((s) => s.project.finalOptionId);
  const isFinal = finalId === approval.optionId;
  return (
    <div className="share-approval">
      <Star size={16} className="final-star" aria-hidden />
      <span>
        {sq.share.approved(
          approval.by,
          approval.optionName || sq.options.name(0),
          formatDateTime(approval.at),
        )}
      </span>
      {!isFinal && (
        <button
          type="button"
          className="btn"
          onClick={() => useEditor.getState().setFinalOption(approval.optionId)}
        >
          {sq.options.markFinal}
        </button>
      )}
    </div>
  );
}

export function Comments({
  comments,
  onSend,
  askName,
}: {
  comments: ShareComment[];
  onSend: (text: string, name?: string) => Promise<void>;
  /** Client view: ask for the writer's name. */
  askName?: { value: string; onChange: (v: string) => void };
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="share-comments">
      {comments.map((c) => (
        <div key={c.id} className={`comment${c.fromClient ? ' from-client' : ''}`}>
          <span className="small">
            <strong>{c.author}</strong> · {formatDateTime(c.createdAt)}
          </span>
          <p>{c.text}</p>
        </div>
      ))}
      <form
        className="comment-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim() || (askName && !askName.value.trim())) return;
          setBusy(true);
          try {
            await onSend(text.trim(), askName?.value.trim());
            setText('');
          } finally {
            setBusy(false);
          }
        }}
      >
        {askName && (
          <input
            value={askName.value}
            placeholder={sq.share.yourName}
            aria-label={sq.share.yourName}
            onChange={(e) => askName.onChange(e.target.value)}
          />
        )}
        <textarea
          value={text}
          rows={2}
          placeholder={sq.share.commentPlaceholder}
          aria-label={sq.share.commentPlaceholder}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="btn" disabled={busy || !text.trim()}>
          <Send size={16} />
          <span>{sq.share.send}</span>
        </button>
      </form>
    </div>
  );
}
