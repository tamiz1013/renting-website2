export default function LoginPage() {
  return (
    <div className="auth-page">
      <div className="auth-box">
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📧</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>Email Rental Service</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: 15, lineHeight: 1.6 }}>
            Instant temporary email addresses for OTP verification and sign-ups.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 24, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--success)', fontSize: 18 }}>⚡</span>
              <span>Short-term emails — get OTP codes in seconds</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--primary)', fontSize: 18 }}>🔒</span>
              <span>Long-term rentals — keep an email for days or weeks</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--warning)', fontSize: 18 }}>📬</span>
              <span>Real-time inbox — view incoming messages instantly</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--danger)', fontSize: 18 }}>🤖</span>
              <span>API & Telegram bot access for automation</span>
            </div>
          </div>
        </div>

        <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
          Sign in to get started
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <a
            href="/api/auth/google"
            className="login-btn"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '12px 20px', borderRadius: 'var(--radius)', textDecoration: 'none',
              background: '#fff', color: '#333', fontWeight: 600, fontSize: 15,
              border: '1px solid #ddd', transition: 'opacity 0.15s',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
            <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>or</span>
            <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
          </div>

          <a
            href="https://t.me/yourotpservicebot?start=login"
            className="login-btn"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '12px 20px', borderRadius: 'var(--radius)', textDecoration: 'none',
              background: '#2AABEE', color: '#fff', fontWeight: 600, fontSize: 15,
              border: 'none', transition: 'opacity 0.15s',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
              <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.53 8.15l-1.67 7.88c-.12.56-.45.7-.91.43l-2.52-1.86-1.22 1.17c-.13.14-.25.25-.51.25l.18-2.58 4.7-4.25c.2-.18-.05-.29-.31-.11l-5.82 3.67-2.5-.78c-.54-.17-.55-.54.11-.8l9.79-3.77c.45-.17.85.11.68.75z"/>
            </svg>
            Continue with Telegram
          </a>
        </div>
      </div>
    </div>
  );
}
