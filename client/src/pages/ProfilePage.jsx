import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [linkCode, setLinkCode] = useState(null);
  const [linkExpiry, setLinkExpiry] = useState(null);
  const [linkLoading, setLinkLoading] = useState(false);

  useEffect(() => {
    api.getMyReports()
      .then((data) => setReports(data.reports || []))
      .catch(() => {})
      .finally(() => setLoadingReports(false));
  }, []);

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

  const handleGenerateLink = async () => {
    setLinkLoading(true);
    try {
      const data = await api.generateTelegramLink();
      setLinkCode(data.code);
      setLinkExpiry(data.expires_at);
      toast.success('Link code generated!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLinkLoading(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!window.confirm('Unlink Telegram from your account?')) return;
    try {
      await api.unlinkTelegram();
      toast.success('Telegram unlinked');
      refreshUser();
    } catch (err) {
      toast.error(err.message);
    }
  };

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

        {/* Telegram Link */}
        <div className="card">
          <h3 className="mb-3">🤖 Telegram</h3>
          {user?.telegramLinked ? (
            <div>
              <div className="form-group">
                <span className="badge badge-success">✅ Connected</span>
              </div>
              <p className="text-sm text-dim mb-3">
                Your Telegram account is linked. You can use the bot to access all services.
              </p>
              <button className="btn-danger" onClick={handleUnlinkTelegram}>
                Unlink Telegram
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-dim mb-3">
                Link your Telegram to use the bot and access all services from Telegram.
              </p>
              {linkCode ? (
                <div>
                  <div className="form-group">
                    <label>Your Link Code</label>
                    <div className="font-mono" style={{ fontSize: 24, letterSpacing: 4, color: 'var(--primary)', fontWeight: 700 }}>
                      {linkCode}
                    </div>
                  </div>
                  <p className="text-sm text-dim mb-3">
                    Open the bot on Telegram and send:<br />
                    <code>/link {linkCode}</code>
                  </p>
                  <p className="text-xs text-dim">
                    Code expires at {new Date(linkExpiry).toLocaleTimeString()}
                  </p>
                </div>
              ) : (
                <button className="btn-primary" onClick={handleGenerateLink} disabled={linkLoading}>
                  {linkLoading ? 'Generating...' : '🔗 Link Telegram'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* My Reports */}
      <div className="card mb-4">
        <h3 className="mb-3">My Reports</h3>
        {loadingReports ? (
          <div className="text-dim text-sm">Loading...</div>
        ) : reports.length === 0 ? (
          <div className="text-dim text-sm">No reports submitted yet.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Type</th>
                  <th>Platform</th>
                  <th>Comment</th>
                  <th>Reported</th>
                  <th>Refunded</th>
                  <th>Resolved</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => (
                  <tr key={i}>
                    <td className="font-mono text-xs">{r.email_id}</td>
                    <td>
                      <span className={`badge ${r.lock_type === 'short_term' ? 'badge-info' : 'badge-warning'}`}>
                        {r.lock_type === 'short_term' ? 'Short' : 'Long'}
                      </span>
                    </td>
                    <td>{r.platform || '—'}</td>
                    <td className="text-sm">{r.comment || '—'}</td>
                    <td className="text-xs text-dim">{new Date(r.reported_at).toLocaleDateString()}</td>
                    <td>
                      {r.refunded ? (
                        <span className="badge badge-success">Refunded ${r.refund_amount}</span>
                      ) : (
                        <span className="badge badge-danger">Not Refunded</span>
                      )}
                    </td>
                    <td>
                      {r.deleted ? (
                        <span className="badge badge-warning">Deleted</span>
                      ) : r.resolved ? (
                        <span className="badge badge-success">Resolved</span>
                      ) : (
                        <span className="badge badge-danger">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
