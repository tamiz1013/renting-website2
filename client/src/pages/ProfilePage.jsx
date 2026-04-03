import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });

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
      </div>
    </div>
  );
}
