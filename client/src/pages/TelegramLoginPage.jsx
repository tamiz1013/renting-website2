import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../lib/api.js';
import toast from 'react-hot-toast';

export default function TelegramLoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState('loading'); // loading | error

  useEffect(() => {
    const user_id = searchParams.get('user_id');
    const code = searchParams.get('code');

    if (!user_id || !code) {
      setStatus('error');
      return;
    }

    api.telegramLogin({ user_id, code })
      .then((data) => {
        localStorage.setItem('token', data.token);
        return refreshUser();
      })
      .then(() => {
        toast.success('Logged in via Telegram!');
        navigate('/', { replace: true });
      })
      .catch((err) => {
        setStatus('error');
        toast.error(err.message || 'Login link expired or invalid');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'error') {
    return (
      <div className="auth-page">
        <div className="auth-box" style={{ textAlign: 'center' }}>
          <h1>Login Failed</h1>
          <p>This login link is invalid or has expired.</p>
          <p style={{ marginTop: 16 }}>
            Please go back to Telegram and click <strong>Start</strong> again to get a new link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-box" style={{ textAlign: 'center' }}>
        <h1>Logging in...</h1>
        <p>Please wait while we verify your Telegram login.</p>
      </div>
    </div>
  );
}
