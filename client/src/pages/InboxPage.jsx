import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { CopyButton } from '../components/CopyButton.jsx';

export default function InboxPage() {
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reportComment, setReportComment] = useState('');
  const [showReport, setShowReport] = useState(null);

  const { data: rentalsData, isLoading } = useQuery({
    queryKey: ['longTermActive'],
    queryFn: api.longTermActive,
    refetchInterval: 10000,
  });

  const rentals = rentalsData?.rentals || [];

  // Fetch messages for selected email
  const { data: messagesData, isLoading: loadingMessages } = useQuery({
    queryKey: ['inbox-messages', selectedEmail],
    queryFn: () => api.getMessages(selectedEmail),
    refetchInterval: 10000,
    enabled: !!selectedEmail,
  });

  const messages = messagesData?.messages || [];

  const handleRelease = async (email_id) => {
    const ok = await confirm({
      title: 'Release Email',
      message: 'Release this long-term rental?',
      danger: false,
      confirmLabel: 'Release',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.longTermRelease({ email_id });
      toast.success('Released');
      queryClient.invalidateQueries({ queryKey: ['longTermActive'] });
      refreshUser();
      if (selectedEmail === email_id) setSelectedEmail(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleBan = async (email_id) => {
    const ok = await confirm({
      title: 'Ban Email',
      message: 'Ban all platforms on this email? This should only be done if the inbox is empty.',
      danger: true,
      confirmLabel: 'Ban',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await api.longTermBan({ email_id });
      toast.success('Banned');
      queryClient.invalidateQueries({ queryKey: ['longTermActive'] });
      refreshUser();
      if (selectedEmail === email_id) setSelectedEmail(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async (email_id) => {
    if (!reportComment.trim()) { toast.error('Enter a comment'); return; }
    setBusy(true);
    try {
      await api.longTermReport({ email_id, comment: reportComment });
      toast.success('Report submitted');
      setShowReport(null);
      setReportComment('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {dialog}
      <h1 className="page-title">Inbox</h1>

      {isLoading && <p className="text-dim">Loading...</p>}
      {rentals.length === 0 && !isLoading && (
        <p className="text-dim">No long-term rentals. Go to Long-Term Rent to get one.</p>
      )}

      <div className="flex gap-4" style={{ alignItems: 'flex-start' }}>
        {/* Email list */}
        <div style={{ width: 280, flexShrink: 0 }}>
          {rentals.map((r) => (
            <div
              key={r.email_id}
              className="card mb-2"
              style={{
                cursor: 'pointer',
                border: selectedEmail === r.email_id ? '2px solid var(--primary)' : undefined,
              }}
              onClick={() => setSelectedEmail(r.email_id)}
            >
              <div className="font-mono text-sm">{r.email_id}</div>
              <div className="text-xs text-dim mt-2">
                Expires: {new Date(r.rental_expiry).toLocaleDateString()}
              </div>
              <div className="flex gap-2 mt-2">
                <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); handleRelease(r.email_id); }} disabled={busy}>
                  Release
                </button>
                <button className="btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); handleBan(r.email_id); }} disabled={busy}>
                  Ban
                </button>
                <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setShowReport(showReport === r.email_id ? null : r.email_id); }}>
                  Report
                </button>
              </div>
              {showReport === r.email_id && (
                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    rows={2}
                    value={reportComment}
                    onChange={(e) => setReportComment(e.target.value)}
                    placeholder="Describe the issue..."
                    style={{ marginBottom: 8 }}
                  />
                  <button className="btn-warning btn-sm" onClick={() => handleReport(r.email_id)} disabled={busy}>
                    Submit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Messages pane */}
        <div style={{ flex: 1 }}>
          {!selectedEmail && (
            <p className="text-dim">Select an email to view messages</p>
          )}
          {selectedEmail && loadingMessages && <p className="text-dim">Loading messages...</p>}
          {selectedEmail && !loadingMessages && messages.length === 0 && (
            <p className="text-dim">No messages yet</p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className="message-item">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-mono">{msg.senderName || 'Unknown sender'}</span>
                <span className="text-xs text-dim">
                  {msg.time ? new Date(msg.time).toLocaleString() : ''}
                </span>
              </div>
              {msg.subject && <div className="text-sm mb-2" style={{ fontWeight: 600 }}>{msg.subject}</div>}
              {msg.hasCode && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="otp-code">{msg.code}</span>
                  <CopyButton text={msg.code} label="Copy" />
                </div>
              )}
              {msg.body && (
                <div className="text-sm text-dim" style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
                  {msg.body}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
