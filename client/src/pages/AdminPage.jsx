import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '../lib/api.js';
import { useConfirm } from '../components/ConfirmDialog.jsx';

const TABS = ['emails', 'pricing', 'deposits', 'logs', 'users', 'review'];

export default function AdminPage() {
  const [tab, setTab] = useState('emails');

  return (
    <div>
      <h1 className="page-title">Admin Panel</h1>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'emails' && <EmailsTab />}
      {tab === 'pricing' && <PricingTab />}
      {tab === 'deposits' && <DepositsTab />}
      {tab === 'logs' && <LogsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'review' && <ReviewTab />}
    </div>
  );
}

// ──── Emails Tab ────
function EmailsTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [bulkForm, setBulkForm] = useState({ mother_email: '', app_password: '', child_emails: '' });
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['adminEmails', page],
    queryFn: () => api.adminGetEmails(page),
  });

  const emails = data?.emails || [];
  const totalPages = data?.pages || 1;

  const handleBulkAdd = async (e) => {
    e.preventDefault();
    setAdding(true);
    try {
      const child_emails = bulkForm.child_emails.split('\n').map((e) => e.trim()).filter(Boolean);

      if (child_emails.length === 0) { toast.error('Enter at least one child email'); setAdding(false); return; }

      await api.adminBulkAddEmails({
        mother_email: bulkForm.mother_email,
        app_password: bulkForm.app_password,
        child_emails,
      });
      toast.success('Emails added');
      setBulkForm({ mother_email: '', app_password: '', child_emails: '' });
      queryClient.invalidateQueries({ queryKey: ['adminEmails'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (email_id, platform, action) => {
    try {
      await api.adminTogglePlatform({ email_id, platform, action });
      toast.success(`${action} applied`);
      queryClient.invalidateQueries({ queryKey: ['adminEmails'] });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleForceRelease = async (email_id) => {
    try {
      await api.adminForceRelease({ email_id });
      toast.success('Force released');
      queryClient.invalidateQueries({ queryKey: ['adminEmails'] });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      {/* Bulk add form */}
      <div className="card mb-4">
        <h3 className="mb-3">Bulk Add Emails</h3>
        <form onSubmit={handleBulkAdd}>
          <div className="grid-3 mb-3">
            <div className="form-group">
              <label>Mother Email</label>
              <input value={bulkForm.mother_email} onChange={(e) => setBulkForm({ ...bulkForm, mother_email: e.target.value })} placeholder="mother@icloud.com" required />
            </div>
            <div className="form-group">
              <label>App Password</label>
              <input value={bulkForm.app_password} onChange={(e) => setBulkForm({ ...bulkForm, app_password: e.target.value })} placeholder="xxxx-xxxx-xxxx-xxxx" required />
            </div>
          </div>
          <div className="form-group">
            <label>Child Emails (one per line)</label>
            <textarea rows={4} value={bulkForm.child_emails} onChange={(e) => setBulkForm({ ...bulkForm, child_emails: e.target.value })} placeholder="child1@icloud.com&#10;child2@icloud.com" required />
          </div>
          <button className="btn-primary" type="submit" disabled={adding}>
            {adding ? 'Adding...' : 'Add Emails'}
          </button>
        </form>
      </div>

      {/* Email list */}
      {isLoading && <p className="text-dim">Loading...</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email ID</th>
              <th>Lock</th>
              <th>Platforms</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((em) => (
              <tr key={em.email_id}>
                <td className="font-mono text-sm">{em.email_id}</td>
                <td>
                  {em.lock_type ? (
                    <span className="badge badge-warning">{em.lock_type}</span>
                  ) : (
                    <span className="badge badge-success">free</span>
                  )}
                </td>
                <td>
                  <div className="flex gap-2 flex-wrap">
                    {em.platform_status && Object.entries(
                      typeof em.platform_status.toJSON === 'function'
                        ? em.platform_status.toJSON()
                        : em.platform_status
                    ).map(([plat, status]) => (
                      <div key={plat} className="flex items-center gap-2">
                        <span className={`badge ${status.banned ? 'badge-danger' : status.available ? 'badge-success' : 'badge-warning'}`}>
                          {plat}
                        </span>
                        <select
                          className="btn-sm"
                          style={{ fontSize: 10, padding: '2px 4px', background: 'var(--bg)', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 4 }}
                          onChange={(e) => { if (e.target.value) handleToggle(em.email_id, plat, e.target.value); e.target.value = ''; }}
                          defaultValue=""
                        >
                          <option value="">⚙</option>
                          <option value="ban">Ban</option>
                          <option value="unban">Unban</option>
                          <option value="make_available">Available</option>
                          <option value="make_unavailable">Unavailable</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </td>
                <td>
                  {em.lock_type && (
                    <button className="btn-danger btn-sm" onClick={() => handleForceRelease(em.email_id)}>
                      Force Release
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 mt-4">
        <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
        <span className="text-sm text-dim">Page {page} of {totalPages}</span>
        <button className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

// ──── Pricing Tab ────
function PricingTab() {
  const queryClient = useQueryClient();

  // ── Short-Term Per-Platform ──
  const [stForm, setStForm] = useState({ platform: '', short_term_price: '' });
  const [stSaving, setStSaving] = useState(false);

  const { data: stData, isLoading: stLoading } = useQuery({
    queryKey: ['adminPricing'],
    queryFn: api.adminGetPricing,
  });
  const stPricing = stData?.pricing || [];

  const handleStSave = async (e) => {
    e.preventDefault();
    setStSaving(true);
    try {
      await api.adminUpdatePricing({
        platform: stForm.platform,
        short_term_price: parseFloat(stForm.short_term_price),
      });
      toast.success('Short-term pricing saved');
      queryClient.invalidateQueries({ queryKey: ['adminPricing'] });
      setStForm({ platform: '', short_term_price: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setStSaving(false);
    }
  };

  const loadStPricing = (p) => {
    setStForm({ platform: p.platform, short_term_price: String(p.short_term_price) });
  };

  // ── Long-Term Global ──
  const [ltForm, setLtForm] = useState({ long_term_7d_price: '', long_term_1m_price: '', long_term_3m_price: '' });
  const [ltSaving, setLtSaving] = useState(false);

  const { data: ltData, isLoading: ltLoading } = useQuery({
    queryKey: ['adminLtPricing'],
    queryFn: api.adminGetLongTermPricing,
    onSuccess: (d) => {
      if (d?.pricing) {
        setLtForm({
          long_term_7d_price: String(d.pricing.long_term_7d_price ?? ''),
          long_term_1m_price: String(d.pricing.long_term_1m_price ?? ''),
          long_term_3m_price: String(d.pricing.long_term_3m_price ?? ''),
        });
      }
    },
  });

  // Populate form when data loads (onSuccess may not fire in all RQ versions)
  const ltPricingDoc = ltData?.pricing;
  const [ltFormInitialized, setLtFormInitialized] = useState(false);
  if (ltPricingDoc && !ltFormInitialized) {
    setLtForm({
      long_term_7d_price: String(ltPricingDoc.long_term_7d_price ?? ''),
      long_term_1m_price: String(ltPricingDoc.long_term_1m_price ?? ''),
      long_term_3m_price: String(ltPricingDoc.long_term_3m_price ?? ''),
    });
    setLtFormInitialized(true);
  }

  const handleLtSave = async (e) => {
    e.preventDefault();
    setLtSaving(true);
    try {
      await api.adminUpdateLongTermPricing({
        long_term_7d_price: parseFloat(ltForm.long_term_7d_price),
        long_term_1m_price: parseFloat(ltForm.long_term_1m_price),
        long_term_3m_price: parseFloat(ltForm.long_term_3m_price),
      });
      toast.success('Long-term pricing saved');
      queryClient.invalidateQueries({ queryKey: ['adminLtPricing'] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLtSaving(false);
    }
  };

  return (
    <div>
      {/* ── Short-Term Platform Pricing ── */}
      <div className="card mb-4">
        <h3 className="mb-3">Short-Term Platform Pricing</h3>
        <form onSubmit={handleStSave}>
          <div className="grid-3 mb-3">
            <div className="form-group">
              <label>Platform</label>
              <input value={stForm.platform} onChange={(e) => setStForm({ ...stForm, platform: e.target.value })} placeholder="facebook" required />
            </div>
            <div className="form-group">
              <label>Price (10-min rental)</label>
              <input type="number" step="0.01" min="0" value={stForm.short_term_price} onChange={(e) => setStForm({ ...stForm, short_term_price: e.target.value })} required />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={stSaving}>
            {stSaving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>

      {stLoading && <p className="text-dim">Loading...</p>}
      <div className="table-wrap mb-5">
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>Short-Term Price</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stPricing.map((p) => (
              <tr key={p.platform}>
                <td style={{ textTransform: 'capitalize' }}>{p.platform}</td>
                <td className="font-mono">${p.short_term_price}</td>
                <td>
                  <button className="btn-ghost btn-sm" onClick={() => loadStPricing(p)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Long-Term Global Pricing ── */}
      <div className="card mb-4">
        <h3 className="mb-3">Long-Term Pricing (Global)</h3>
        {ltLoading ? (
          <p className="text-dim">Loading...</p>
        ) : (
          <form onSubmit={handleLtSave}>
            <div className="grid-3 mb-3">
              <div className="form-group">
                <label>7-Day Price</label>
                <input type="number" step="0.01" min="0" value={ltForm.long_term_7d_price} onChange={(e) => setLtForm({ ...ltForm, long_term_7d_price: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>1-Month Price</label>
                <input type="number" step="0.01" min="0" value={ltForm.long_term_1m_price} onChange={(e) => setLtForm({ ...ltForm, long_term_1m_price: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>3-Month Price</label>
                <input type="number" step="0.01" min="0" value={ltForm.long_term_3m_price} onChange={(e) => setLtForm({ ...ltForm, long_term_3m_price: e.target.value })} required />
              </div>
            </div>
            <button className="btn-primary" type="submit" disabled={ltSaving}>
              {ltSaving ? 'Saving...' : 'Save Long-Term Pricing'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ──── Deposits Tab ────
function DepositsTab() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['adminDeposits', status],
    queryFn: () => api.adminGetDeposits(status),
  });

  const deposits = data?.deposits || [];

  const handleAction = async (deposit_id, action) => {
    try {
      if (action === 'approve') {
        await api.adminApproveDeposit({ deposit_id });
        toast.success('Deposit approved');
      } else {
        await api.adminRejectDeposit({ deposit_id });
        toast.success('Deposit rejected');
      }
      queryClient.invalidateQueries({ queryKey: ['adminDeposits'] });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {['pending', 'approved', 'rejected'].map((s) => (
          <button key={s} className={`btn-ghost btn-sm ${status === s ? 'btn-primary' : ''}`} onClick={() => setStatus(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-dim">Loading...</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Amount</th>
              <th>Tx ID</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {deposits.map((d) => (
              <tr key={d._id}>
                <td>{d.user_id?.name || 'Unknown'} <span className="text-dim text-xs">({d.user_id?.email})</span></td>
                <td className="font-mono">${d.amount.toFixed(2)}</td>
                <td className="font-mono text-xs" style={{ maxWidth: 160, wordBreak: 'break-all' }}>{d.transaction_id || '—'}</td>
                <td>
                  <span className={`badge ${d.status === 'approved' ? 'badge-success' : d.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                    {d.status}
                  </span>
                </td>
                <td className="text-dim">{new Date(d.createdAt).toLocaleString()}</td>
                <td>
                  {d.status === 'pending' && (
                    <div className="flex gap-2">
                      <button className="btn-success btn-sm" onClick={() => handleAction(d._id, 'approve')}>Approve</button>
                      <button className="btn-danger btn-sm" onClick={() => handleAction(d._id, 'reject')}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {deposits.length === 0 && !isLoading && (
              <tr><td colSpan={6} className="text-dim" style={{ textAlign: 'center' }}>No {status} deposits</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──── Logs Tab ────
function LogsTab() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState({ action: '', email_id: '' });

  const params = { page, limit: 50 };
  if (filter.action) params.action = filter.action;
  if (filter.email_id) params.email_id = filter.email_id;

  const { data, isLoading } = useQuery({
    queryKey: ['adminLogs', params],
    queryFn: () => api.adminGetLogs(params),
  });

  const logs = data?.logs || [];
  const totalPages = data?.pages || 1;

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          placeholder="Filter by action..."
          value={filter.action}
          onChange={(e) => { setFilter({ ...filter, action: e.target.value }); setPage(1); }}
          style={{ maxWidth: 200 }}
        />
        <input
          placeholder="Filter by email_id..."
          value={filter.email_id}
          onChange={(e) => { setFilter({ ...filter, email_id: e.target.value }); setPage(1); }}
          style={{ maxWidth: 200 }}
        />
      </div>

      {isLoading && <p className="text-dim">Loading...</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Action</th>
              <th>Email</th>
              <th>Platform</th>
              <th>Amount</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l._id}>
                <td>{l.user_id?.name || 'System'}</td>
                <td><span className="badge badge-info">{l.action}</span></td>
                <td className="font-mono text-xs">{l.email_id || '—'}</td>
                <td>{l.platform || '—'}</td>
                <td className="font-mono">{l.amount != null ? `$${l.amount}` : '—'}</td>
                <td className="text-dim text-xs">{new Date(l.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
        <span className="text-sm text-dim">Page {page} of {totalPages}</span>
        <button className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

// ──── Review Tab (Banned & Reported Emails) ────
function ReviewTab() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [view, setView] = useState('banned');

  const { data: bannedData, isLoading: bannedLoading } = useQuery({
    queryKey: ['adminBanned'],
    queryFn: api.adminGetBannedEmails,
    enabled: view === 'banned',
  });

  const { data: reportedData, isLoading: reportedLoading } = useQuery({
    queryKey: ['adminReported'],
    queryFn: api.adminGetReportedEmails,
    enabled: view === 'reported',
  });

  const emails = view === 'banned' ? (bannedData?.emails || []) : (reportedData?.emails || []);
  const loading = view === 'banned' ? bannedLoading : reportedLoading;

  const handleResolve = async (email_id) => {
    const ok = await confirm({
      title: 'Resolve Email',
      message: `Unban and return "${email_id}" to the pool?`,
      confirmLabel: 'Resolve',
    });
    if (!ok) return;
    try {
      await api.adminResolveEmail({ email_id });
      toast.success('Email resolved');
      queryClient.invalidateQueries({ queryKey: ['adminBanned'] });
      queryClient.invalidateQueries({ queryKey: ['adminReported'] });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (email_id) => {
    const ok = await confirm({
      title: 'Delete Email',
      message: `Permanently delete "${email_id}" from inventory? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.adminDeleteEmail({ email_id });
      toast.success('Email deleted');
      queryClient.invalidateQueries({ queryKey: ['adminBanned'] });
      queryClient.invalidateQueries({ queryKey: ['adminReported'] });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      {dialog}
      <div className="flex gap-2 mb-4">
        <button className={`btn-ghost btn-sm ${view === 'banned' ? 'btn-primary' : ''}`} onClick={() => setView('banned')}>
          Globally Banned
        </button>
        <button className={`btn-ghost btn-sm ${view === 'reported' ? 'btn-primary' : ''}`} onClick={() => setView('reported')}>
          Reported
        </button>
      </div>

      {loading && <p className="text-dim">Loading...</p>}

      {!loading && emails.length === 0 && (
        <p className="text-dim" style={{ textAlign: 'center', padding: '2rem' }}>
          No {view} emails to review
        </p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email ID</th>
              <th>Status</th>
              <th>Platforms</th>
              <th>{view === 'banned' ? 'Ban Count' : 'Reports'}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((em) => (
              <tr key={em.email_id}>
                <td className="font-mono text-sm">{em.email_id}</td>
                <td>
                  {em.globally_banned && <span className="badge badge-danger">Globally Banned</span>}
                  {em.problem_count > 0 && !em.globally_banned && <span className="badge badge-warning">Reported</span>}
                  {em.lock_type && <span className="badge badge-info ml-1">{em.lock_type}</span>}
                </td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    {em.platform_status && Object.entries(
                      typeof em.platform_status.toJSON === 'function'
                        ? em.platform_status.toJSON()
                        : em.platform_status
                    ).map(([plat, status]) => (
                      <span key={plat} className={`badge ${status.banned ? 'badge-danger' : status.available ? 'badge-success' : 'badge-warning'}`}>
                        {plat}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="font-mono">
                  {view === 'banned' ? (em.ban_records?.length || 0) : em.problem_count}
                </td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn-success btn-sm" onClick={() => handleResolve(em.email_id)}>Resolve</button>
                    <button className="btn-danger btn-sm" onClick={() => handleDelete(em.email_id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──── Users Tab ────
function UsersTab() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['adminUsers', page],
    queryFn: () => api.adminGetUsers(page),
  });

  const users = data?.users || [];
  const totalPages = data?.pages || 1;

  const handleRoleChange = async (user_id, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const ok = await confirm({
      title: 'Change Role',
      message: `Change this user's role to ${newRole}?`,
      confirmLabel: 'Change',
    });
    if (!ok) return;

    try {
      await api.adminChangeRole({ user_id, role: newRole });
      toast.success('Role updated');
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
      {dialog}
      {isLoading && <p className="text-dim">Loading...</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Balance</th>
              <th>Rentals</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td className="text-sm">{u.email}</td>
                <td>
                  <span className={`badge ${u.role === 'admin' ? 'badge-info' : 'badge-success'}`}>{u.role}</span>
                </td>
                <td className="font-mono">${u.balance?.toFixed(2)}</td>
                <td>{u.active_rentals?.length || 0}</td>
                <td className="text-dim text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <button className="btn-ghost btn-sm" onClick={() => handleRoleChange(u._id, u.role)}>
                    Toggle Role
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
        <span className="text-sm text-dim">Page {page} of {totalPages}</span>
        <button className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
