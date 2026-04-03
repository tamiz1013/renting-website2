import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCountdown } from '../hooks/useCountdown.js';
import { useConfirm } from './ConfirmDialog.jsx';
import { CopyButton } from './CopyButton.jsx';

export default function AssignmentCard({ assignment }) {
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [reportComment, setReportComment] = useState('');
  const [showReport, setShowReport] = useState(false);

  const a = assignment;
  const countdown = useCountdown(a.short_term_expires_at);

  // Poll for messages every 5 seconds
  const { data: messagesData } = useQuery({
    queryKey: ['inbox-poll', a.email_id],
    queryFn: () => api.pollInbox(a.email_id),
    refetchInterval: 5000,
    enabled: !!a.email_id,
  });

  const messages = messagesData?.messages || [];
  const latestWithCode = messages.find((m) => m.hasCode);

  const handleAction = async (action) => {
    setBusy(true);
    try {
      const body = { email_id: a.email_id, lock_token: a.lock_token };

      if (action === 'complete') {
        await api.shortTermComplete(body);
        toast.success('Completed!');
      } else if (action === 'release') {
        const ok = await confirm({ title: 'Release Email', message: 'Release this email and get a refund?', danger: false, confirmLabel: 'Release' });
        if (!ok) { setBusy(false); return; }
        await api.shortTermRelease(body);
        toast.success('Released and refunded');
      } else if (action === 'ban') {
        const ok = await confirm({ title: 'Ban Platform', message: 'Mark this platform as banned on this email? You will get a refund.', danger: true, confirmLabel: 'Ban' });
        if (!ok) { setBusy(false); return; }
        await api.shortTermBan(body);
        toast.success('Banned and refunded');
      }

      queryClient.invalidateQueries({ queryKey: ['shortTermActive'] });
      refreshUser();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async () => {
    if (!reportComment.trim()) { toast.error('Enter a comment'); return; }
    setBusy(true);
    try {
      await api.shortTermReport({ email_id: a.email_id, lock_token: a.lock_token, comment: reportComment });
      toast.success('Report submitted');
      setShowReport(false);
      setReportComment('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="assignment-card">
      {dialog}
      <div className="flex items-center justify-between mb-2">
        <span className="platform-name">{a.current_platform}</span>
        <div className={`timer ${countdown.expired ? 'timer-expired' : ''}`}>
          {countdown.expired ? 'EXPIRED' : countdown.display}
        </div>
      </div>

      <div className="email-display flex items-center gap-2">
        {a.email_id}
        <CopyButton text={a.email_id} label="Copy" />
      </div>

      {/* Latest OTP/Message */}
      {messages.length > 0 && (
        <div className="mb-3">
          {latestWithCode ? (
            <div className="message-item">
              <div className="flex items-center justify-between">
                <span className="otp-code">{latestWithCode.code}</span>
                <CopyButton text={latestWithCode.code} label="Copy OTP" />
              </div>
              {latestWithCode.body && (
                <div className="text-xs text-dim mt-2" style={{ maxHeight: 60, overflow: 'hidden' }}>
                  {latestWithCode.body}
                </div>
              )}
            </div>
          ) : (
            <div className="message-item">
              <div className="text-sm text-dim">
                {messages[0].body?.slice(0, 200)}
              </div>
            </div>
          )}
          <div className="text-xs text-dim mt-2">{messages.length} message(s) received</div>
        </div>
      )}

      {messages.length === 0 && (
        <div className="text-sm text-dim mb-3">Waiting for messages...</div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button className="btn-success btn-sm" onClick={() => handleAction('complete')} disabled={busy}>
          Complete
        </button>
        <button className="btn-ghost btn-sm" onClick={() => handleAction('release')} disabled={busy}>
          Release
        </button>
        {!a.short_term_otp_received && (
          <button className="btn-danger btn-sm" onClick={() => handleAction('ban')} disabled={busy}>
            Ban
          </button>
        )}
        <button className="btn-ghost btn-sm" onClick={() => setShowReport(!showReport)} disabled={busy}>
          Report
        </button>
      </div>

      {showReport && (
        <div className="mt-2">
          <textarea
            rows={2}
            value={reportComment}
            onChange={(e) => setReportComment(e.target.value)}
            placeholder="Describe the issue..."
            style={{ marginBottom: 8 }}
          />
          <button className="btn-warning btn-sm" onClick={handleReport} disabled={busy}>
            Submit Report
          </button>
        </div>
      )}
    </div>
  );
}
