const API_BASE = '/api';

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      data?.error || `Request failed (${res.status})`,
      res.status,
      data?.details
    );
  }
  return data;
}

// Auth
export const api = {
  // Auth
  signup: (body) => request('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  getMe: () => request('/auth/me'),
  getMyReports: () => request('/auth/my-reports'),
  changePassword: (body) => request('/auth/password', { method: 'PUT', body: JSON.stringify(body) }),

  // Pricing (public)
  getPricing: () => request('/pricing'),
  getLongTermPricing: () => request('/pricing/long-term'),

  // Short-term
  shortTermAssign: (body) => request('/short-term/assign', { method: 'POST', body: JSON.stringify(body) }),
  shortTermComplete: (body) => request('/short-term/complete', { method: 'POST', body: JSON.stringify(body) }),
  shortTermRelease: (body) => request('/short-term/release', { method: 'POST', body: JSON.stringify(body) }),
  shortTermBan: (body) => request('/short-term/ban', { method: 'POST', body: JSON.stringify(body) }),
  shortTermReport: (body) => request('/short-term/report', { method: 'POST', body: JSON.stringify(body) }),
  shortTermActive: () => request('/short-term/active'),

  // Long-term
  longTermAssign: (body) => request('/long-term/assign', { method: 'POST', body: JSON.stringify(body) }),
  longTermRelease: (body) => request('/long-term/release', { method: 'POST', body: JSON.stringify(body) }),
  longTermBan: (body) => request('/long-term/ban', { method: 'POST', body: JSON.stringify(body) }),
  longTermReport: (body) => request('/long-term/report', { method: 'POST', body: JSON.stringify(body) }),
  longTermActive: () => request('/long-term/active'),

  // Inbox
  pollInbox: (email_id) => request(`/inbox/poll?email_id=${encodeURIComponent(email_id)}`),
  getMessages: (email_id) => request(`/inbox/messages?email_id=${encodeURIComponent(email_id)}`),

  // Deposits
  createDeposit: (body) => request('/deposits', { method: 'POST', body: JSON.stringify(body) }),
  getDeposits: () => request('/deposits'),

  // Admin
  adminGetEmails: (page = 1) => request(`/admin/emails?page=${page}`),
  adminBulkAddEmails: (body) => request('/admin/emails/bulk', { method: 'POST', body: JSON.stringify(body) }),
  adminTogglePlatform: (body) => request('/admin/emails/platform', { method: 'PUT', body: JSON.stringify(body) }),
  adminForceRelease: (body) => request('/admin/emails/force-release', { method: 'POST', body: JSON.stringify(body) }),
  adminGetPricing: () => request('/admin/pricing'),
  adminUpdatePricing: (body) => request('/admin/pricing', { method: 'PUT', body: JSON.stringify(body) }),
  adminGetLongTermPricing: () => request('/admin/pricing/long-term'),
  adminUpdateLongTermPricing: (body) => request('/admin/pricing/long-term', { method: 'PUT', body: JSON.stringify(body) }),
  adminGetDeposits: (status = 'pending') => request(`/admin/deposits?status=${status}`),
  adminApproveDeposit: (body) => request('/admin/deposits/approve', { method: 'POST', body: JSON.stringify(body) }),
  adminRejectDeposit: (body) => request('/admin/deposits/reject', { method: 'POST', body: JSON.stringify(body) }),
  adminGetLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/logs?${qs}`);
  },
  adminGetUsers: (page = 1) => request(`/admin/users?page=${page}`),
  adminChangeRole: (body) => request('/admin/users/role', { method: 'PUT', body: JSON.stringify(body) }),

  // Admin - review queue
  adminGetBannedEmails: () => request('/admin/review/banned'),
  adminGetReportedEmails: () => request('/admin/review/reported'),
  adminResolveEmail: (body) => request('/admin/review/resolve', { method: 'POST', body: JSON.stringify(body) }),
  adminRefundEmail: (body) => request('/admin/review/refund', { method: 'POST', body: JSON.stringify(body) }),
  adminDeleteEmail: (body) => request('/admin/review/delete', { method: 'DELETE', body: JSON.stringify(body) }),
};

export { ApiError };
