import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';

export default function DepositPage() {
  const [amount, setAmount] = useState('');
  const [txId, setTxId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: depositsData, refetch } = useQuery({
    queryKey: ['deposits'],
    queryFn: api.getDeposits,
  });

  const deposits = depositsData?.deposits || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { toast.error('Enter a valid amount'); return; }
    if (!txId.trim()) { toast.error('Enter your transaction ID'); return; }
    setSubmitting(true);
    try {
      await api.createDeposit({ amount: parsed, transaction_id: txId.trim() });
      toast.success('Deposit request submitted! Waiting for admin approval.');
      setAmount('');
      setTxId('');
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Deposit Funds</h1>

      <div className="grid-2 mb-4" style={{ alignItems: 'start' }}>
        {/* QR + instructions */}
        <div className="card" style={{ textAlign: 'center' }}>
          <h3 className="mb-3">Pay via Binance Pay</h3>

          <div
            className="mb-3 text-sm"
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: 8,
              padding: '12px 16px',
              textAlign: 'left',
              lineHeight: 1.7,
            }}
          >
            <p style={{ marginBottom: 6, fontWeight: 600 }}>How to deposit:</p>
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              <li>Open the <strong>Binance</strong> app on your phone.</li>
              <li>Go to <strong>Pay → Scan QR</strong> and scan the code below.</li>
              <li>Enter the exact amount and complete the payment.</li>
              <li>Copy your <strong>Transaction / Order ID</strong> from Binance.</li>
              <li>Fill in the form on the right and click <em>Submit Request</em>.</li>
              <li>Wait for <strong>admin approval</strong> — your balance will be credited once confirmed.</li>
            </ol>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <img
              src="/qr.JPG"
              alt="Binance Pay QR Code"
              style={{
                width: 220,
                height: 220,
                objectFit: 'contain',
                borderRadius: 12,
                border: '2px solid var(--border)',
                background: '#fff',
                padding: 8,
              }}
            />
          </div>
          <p className="text-dim text-xs mt-3">Scan with Binance Pay</p>
        </div>

        {/* Form */}
        <div className="card">
          <h3 className="mb-3">Submit Deposit Request</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Amount (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10.00"
                required
              />
            </div>
            <div className="form-group">
              <label>Transaction / Order ID</label>
              <input
                type="text"
                value={txId}
                onChange={(e) => setTxId(e.target.value)}
                placeholder="Paste your Binance transaction ID"
                required
              />
            </div>
            <button className="btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Submitting...' : 'Submit Deposit Request'}
            </button>
          </form>

          {deposits.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm mb-2">Your Recent Deposits</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deposits.slice(0, 8).map((d) => (
                      <tr key={d._id}>
                        <td className="font-mono">${d.amount.toFixed(2)}</td>
                        <td>
                          <span className={`badge ${d.status === 'approved' ? 'badge-success' : d.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="text-dim">{new Date(d.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
