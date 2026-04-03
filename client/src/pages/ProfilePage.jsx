import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [depositAmount, setDepositAmount] = useState('');
  const [depositing, setDepositing] = useState(false);

  const { data: depositsData } = useQuery({
    queryKey: ['deposits'],
    queryFn: api.getDeposits,
  });

  const deposits = depositsData?.deposits || [];

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setChangingPw(true);
    try {
      await api.changePassword(pwForm);
      toast.success('Password updated');
      setPwForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChangingPw(false);
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setDepositing(true);
    try {
      await api.createDeposit({ amount });
      toast.success('Deposit request submitted');
      setDepositAmount('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDepositing(false);
    }
  };

  const activeShortTerm = user?.active_rentals?.filter((r) => r.lock_type === 'short_term').length || 0;
  const activeLongTerm = user?.active_rentals?.filter((r) => r.lock_type === 'long_term').length || 0;

  return (
    <div>
      <h1 className="page-title">Profile</h1>

      <div className="grid-2 mb-4">
        {/* User info */}
        <div className="card">
          <h3 className="mb-3">Account Info</h3>
          <div className="form-group">
            <label>Name</label>
            <div className="text-sm">{user?.name}</div>
          </div>
          <div className="form-group">
            <label>Email</label>
            <div className="text-sm">{user?.email}</div>
          </div>
          <div className="form-group">
            <label>Role</label>
            <span className={`badge ${user?.role === 'admin' ? 'badge-info' : 'badge-success'}`}>
              {user?.role}
            </span>
          </div>
          {user?.telegram_username && (
            <div className="form-group">
              <label>Telegram</label>
              <div className="text-sm">{user.telegram_username}</div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="card">
          <h3 className="mb-3">Stats</h3>
          <div className="grid-2">
            <div>
              <div className="text-dim text-xs">Balance</div>
              <div className="font-mono" style={{ fontSize: 24, color: 'var(--success)' }}>
                ${user?.balance?.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-dim text-xs">Active Rentals</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {activeShortTerm + activeLongTerm}
              </div>
            </div>
            <div>
              <div className="text-dim text-xs">Short-Term</div>
              <div className="text-sm">{activeShortTerm} active</div>
            </div>
            <div>
              <div className="text-dim text-xs">Long-Term</div>
              <div className="text-sm">{activeLongTerm} active</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2 mb-4">
        {/* Change password */}
        <div className="card">
          <h3 className="mb-3">Change Password</h3>
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                required
                minLength={6}
              />
            </div>
            <button className="btn-primary" type="submit" disabled={changingPw}>
              {changingPw ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Deposit */}
        <div className="card">
          <h3 className="mb-3">Request Deposit</h3>
          <form onSubmit={handleDeposit}>
            <div className="form-group">
              <label>Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="10.00"
                required
              />
            </div>
            <button className="btn-primary" type="submit" disabled={depositing}>
              {depositing ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>

          {deposits.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm mb-2">Recent Deposits</h4>
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
                    {deposits.slice(0, 10).map((d) => (
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
