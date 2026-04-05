import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login({ email, password });
      toast.success('Welcome back!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <h1>Welcome Back</h1>
        <p>Sign in to your account to continue</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div className="form-actions">
            <button className="btn-primary w-full" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>
        <div style={{ textAlign: 'center', margin: '16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #333' }} />
            <span style={{ color: '#888', fontSize: 13 }}>or</span>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid #333' }} />
          </div>
          <a
            href="https://t.me/yourotpservicebot?start=login"
            className="btn-primary w-full"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none', background: '#2AABEE' }}
          >
            Login with Telegram
          </a>
        </div>
        <p className="mt-4 text-sm" style={{ textAlign: 'center' }}>
          Don't have an account? <Link to="/signup">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
