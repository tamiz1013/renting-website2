import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function LongTermPage() {
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [duration, setDuration] = useState('7d');
  const [requesting, setRequesting] = useState(false);

  const { data: ltPricingData } = useQuery({
    queryKey: ['longTermPricing'],
    queryFn: api.getLongTermPricing,
  });

  const { data: activeData, isLoading } = useQuery({
    queryKey: ['longTermActive'],
    queryFn: api.longTermActive,
    refetchInterval: 10000,
  });

  const ltPricing = ltPricingData?.pricing;
  const rentals = activeData?.rentals || [];

  const durations = [
    { key: '7d', label: '7 Days', priceKey: 'long_term_7d_price' },
    { key: '1m', label: '1 Month', priceKey: 'long_term_1m_price' },
    { key: '3m', label: '3 Months', priceKey: 'long_term_3m_price' },
  ];

  const handleRequest = async () => {
    setRequesting(true);
    try {
      await api.longTermAssign({ duration });
      toast.success('Email rented!');
      queryClient.invalidateQueries({ queryKey: ['longTermActive'] });
      refreshUser();
      navigate('/inbox');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Long-Term Email Rental</h1>

      {/* Duration selector */}
      <div className="card mb-4">
        <h3 className="mb-3">Select Duration</h3>
        <div className="grid-3 mb-3">
          {durations.map((d) => (
            <button
              key={d.key}
              className="card"
              style={{
                cursor: 'pointer',
                border: duration === d.key ? '2px solid var(--primary)' : '1px solid var(--border)',
                textAlign: 'center',
              }}
              onClick={() => setDuration(d.key)}
            >
              <div style={{ fontWeight: 600, fontSize: 16 }}>{d.label}</div>
              <div className="font-mono text-success mt-2" style={{ fontSize: 20 }}>
                ${ltPricing?.[d.priceKey]?.toFixed(2) ?? '—'}
              </div>
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={handleRequest} disabled={requesting}>
          {requesting ? 'Requesting...' : 'Rent Email'}
        </button>
      </div>

      {/* Active long-term rentals */}
      <h2 className="mb-3">Your Long-Term Rentals ({rentals.length})</h2>
      {isLoading && <p className="text-dim">Loading...</p>}
      {rentals.length === 0 && !isLoading && (
        <p className="text-dim">No active long-term rentals.</p>
      )}
      <div className="grid-cards">
        {rentals.map((r) => (
          <div key={r.email_id} className="card">
            <div className="font-mono text-sm mb-2">{r.email_id}</div>
            <div className="text-xs text-dim">
              Expires: {new Date(r.rental_expiry).toLocaleDateString()}
            </div>
            <button className="btn-ghost btn-sm mt-2" onClick={() => navigate('/inbox')}>
              Open Inbox →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
