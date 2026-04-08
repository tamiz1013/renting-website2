import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import toast from 'react-hot-toast';

export default function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error || !token) {
      setStatus('error');
      toast.error('Google login failed. Please try again.');
      return;
    }

    loginWithToken(token)
      .then(() => {
        toast.success('Logged in with Google!');
        navigate('/', { replace: true });
      })
      .catch(() => {
        setStatus('error');
        toast.error('Login failed');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'error') {
    return (
      <div className="auth-page">
        <div className="auth-box" style={{ textAlign: 'center' }}>
          <h1>Login Failed</h1>
          <p>Something went wrong with Google login.</p>
          <a href="/login" style={{ color: 'var(--primary)', marginTop: 16, display: 'inline-block' }}>
            ← Back to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-box" style={{ textAlign: 'center' }}>
        <h1>Logging in...</h1>
        <p>Please wait while we verify your Google login.</p>
      </div>
    </div>
  );
}
