export default function LoginPage() {
  return (
    <div className="auth-page">
      <div className="auth-box">
        <h1>Welcome</h1>
        <p>Sign in to your account to continue</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 24 }}>
          <a
            href="/api/auth/google"
            className="btn-primary w-full"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            Continue with Google
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
      </div>
    </div>
  );
}
