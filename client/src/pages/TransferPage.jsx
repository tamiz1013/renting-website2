import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';

export default function TransferPage() {
  const { refreshUser } = useAuth();
  const { confirm, dialog } = useConfirm();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: historyData, refetch } = useQuery({
    queryKey: ['transfer-history'],
    queryFn: api.getTransferHistory,
  });

  const transfers = historyData?.transfers || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { toast.error('Enter a valid amount'); return; }
    if (!recipientEmail.trim()) { toast.error('Enter recipient email'); return; }

    const ok = await confirm({
      title: 'Confirm Transfer',
      message: `Send $${parsed.toFixed(2)} to ${recipientEmail.trim().toLowerCase()}? This cannot be undone.`,
      confirmLabel: 'Transfer',
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      await api.createTransfer({
        recipient_email: recipientEmail.trim().toLowerCase(),
        amount: parsed,
      });
      toast.success('Transfer successful!');
      setRecipientEmail('');
      setAmount('');
      refetch();
      refreshUser();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Transfer Balance</h1>

      <div className="grid-2 mb-4" style={{ alignItems: 'start' }}>
        {/* Transfer form */}
        <div className="card">
          <h3 className="mb-3">Send Funds</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Recipient Email</label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="user@example.com"
                required
              />
            </div>
            <div className="form-group">
              <label>Amount (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5.00"
                required
              />
            </div>
            <button className="btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Sending...' : 'Transfer'}
            </button>
          </form>
        </div>

        {/* Info */}
        <div className="card">
          <h3 className="mb-3">How it works</h3>
          <div
            className="text-sm"
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: 8,
              padding: '12px 16px',
              lineHeight: 1.7,
            }}
          >
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>Enter the <strong>email address</strong> of the account you want to send funds to.</li>
              <li>Enter the amount and confirm the transfer.</li>
              <li>The funds are <strong>transferred instantly</strong> — no admin approval needed.</li>
              <li>Transfers <strong>cannot be reversed</strong>. Double-check the recipient before confirming.</li>
            </ul>
          </div>
        </div>
      </div>

      {dialog}

      {/* Transfer history */}
      {transfers.length > 0 && (
        <div className="card">
          <h3 className="mb-3">Transfer History</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Account</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => (
                  <tr key={t._id}>
                    <td>
                      <span className={`badge ${t.amount > 0 ? 'badge-success' : 'badge-danger'}`}>
                        {t.amount > 0 ? 'Received' : 'Sent'}
                      </span>
                    </td>
                    <td className="font-mono">${Math.abs(t.amount).toFixed(2)}</td>
                    <td className="text-dim">{t.amount > 0 ? t.meta?.from_email : t.meta?.to_email}</td>
                    <td className="text-dim">{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
