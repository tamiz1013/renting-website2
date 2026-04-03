import { useState } from 'react';

export default function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false, children }) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        {children}
        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook for managing confirm dialogs
export function useConfirm() {
  const [state, setState] = useState(null);

  const confirm = (opts) =>
    new Promise((resolve) => {
      setState({ ...opts, resolve });
    });

  const dialog = state ? (
    <ConfirmDialog
      title={state.title}
      message={state.message}
      danger={state.danger}
      confirmLabel={state.confirmLabel}
      onConfirm={() => { state.resolve(true); setState(null); }}
      onCancel={() => { state.resolve(false); setState(null); }}
    >
      {state.children}
    </ConfirmDialog>
  ) : null;

  return { confirm, dialog };
}
