import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import AssignmentCard from '../components/AssignmentCard.jsx';

export default function HomePage() {
  const { refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [requesting, setRequesting] = useState(false);

  const { data: pricingData } = useQuery({
    queryKey: ['pricing'],
    queryFn: api.getPricing,
  });

  const { data: activeData, isLoading: loadingActive } = useQuery({
    queryKey: ['shortTermActive'],
    queryFn: api.shortTermActive,
    refetchInterval: 5000,
  });

  const platforms = pricingData?.pricing || [];
  const assignments = activeData?.assignments || [];

  const handleRequest = async () => {
    if (!selectedPlatform) {
      toast.error('Select a platform');
      return;
    }
    setRequesting(true);
    try {
      const result = await api.shortTermAssign({ platform: selectedPlatform });
      toast.success(`Email assigned for ${selectedPlatform}`);
      queryClient.invalidateQueries({ queryKey: ['shortTermActive'] });
      refreshUser();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Short-Term Email Rental</h1>

      {/* Platform Selection */}
      <div className="card mb-4">
        <h3 className="mb-3">Request an Email</h3>
        <div className="grid-cards mb-3">
          {platforms.map((p) => (
            <button
              key={p.platform}
              className={`card ${selectedPlatform === p.platform ? 'active' : ''}`}
              style={{
                cursor: 'pointer',
                border: selectedPlatform === p.platform ? '2px solid var(--primary)' : '1px solid var(--border)',
                textAlign: 'left',
              }}
              onClick={() => setSelectedPlatform(p.platform)}
            >
              <div className="flex items-center justify-between">
                <span style={{ textTransform: 'capitalize', fontWeight: 600, color: 'var(--text)' }}>{p.platform}</span>
                <span className="font-mono text-success">${p.short_term_price}</span>
              </div>
              <div className="text-xs text-dim mt-2">10 minutes • OTP delivery</div>
            </button>
          ))}
        </div>
        <button
          className="btn-primary"
          onClick={handleRequest}
          disabled={requesting || !selectedPlatform}
        >
          {requesting ? 'Requesting...' : `Get ${selectedPlatform || 'Email'}`}
        </button>
      </div>

      {/* Active Assignments */}
      <h2 className="mb-3">Active Assignments ({assignments.length}/3)</h2>
      {loadingActive && <p className="text-dim">Loading...</p>}

      {assignments.length === 0 && !loadingActive && (
        <p className="text-dim">No active assignments. Request an email above.</p>
      )}

      <div className="grid-cards">
        {assignments.map((a) => (
          <AssignmentCard key={a.email_id} assignment={a} />
        ))}
      </div>
    </div>
  );
}
