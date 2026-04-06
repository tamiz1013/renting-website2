import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">📧 Email Rental</div>
        <nav className="sidebar-nav">
          <div className="sidebar-section"></div>
          <NavLink to="/" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            Home
          </NavLink>
          <NavLink to="/long-term" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            Long-Term Rent
          </NavLink>
          <NavLink to="/inbox" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            Inbox
          </NavLink>
          <NavLink to="/profile" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            Profile
          </NavLink>
          <NavLink to="/docs" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            API Docs
          </NavLink>

          {user?.role === 'admin' && (
            <>
              <div className="sidebar-section">Admin</div>
              <NavLink to="/admin" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                Admin Panel
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="text-sm text-dim mb-2">{user?.name}</div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-mono">${user?.balance?.toFixed(2)}</span>
            <button className="btn-ghost btn-sm" onClick={logout}>Logout</button>
          </div>
          <button
            className="btn-primary btn-sm"
            style={{ width: '100%' }}
            onClick={() => navigate('/deposit')}
          >
            + Deposit
          </button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
