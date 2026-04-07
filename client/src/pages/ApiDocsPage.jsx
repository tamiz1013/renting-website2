import { useState } from 'react';
import { CopyButton } from '../components/CopyButton.jsx';

const BASE_URL = window.location.origin;

const endpoints = [
  {
    id: 'get-me',
    method: 'GET',
    path: '/api/v1/me',
    title: 'Get Account Info',
    desc: 'Returns your account name, email, balance, and active short-term rentals.',
    body: null,
    response: `{
  "name": "John",
  "email": "john@example.com",
  "balance": 25.50,
  "active_rentals": [
    {
      "email_id": "user123@icloud.com",
      "platform": "instagram",
      "expires_at": "2026-04-06T12:30:00Z",
      "lock_type": "short_term"
    }
  ]
}`,
  },
  {
    id: 'platforms',
    method: 'GET',
    path: '/api/v1/platforms',
    title: 'List Platforms',
    desc: 'Returns all available short-term platforms with pricing and rental duration.',
    body: null,
    response: `{
  "platforms": [
    { "platform": "instagram", "price": 0.50, "duration_minutes": 30 },
    { "platform": "twitter", "price": 0.75, "duration_minutes": 30 }
  ]
}`,
  },
  {
    id: 'request',
    method: 'POST',
    path: '/api/v1/short-term/request',
    title: 'Request Email',
    desc: 'Request a short-term email for a specific platform. Deducts balance immediately. Returns the email address and a lock_token you must use for all subsequent actions.',
    body: `{ "platform": "instagram" }`,
    response: `{
  "email_id": "user123@icloud.com",
  "platform": "instagram",
  "lock_token": "a1b2c3d4e5f6...",
  "assigned_at": "2026-04-06T12:00:00Z",
  "expires_at": "2026-04-06T12:30:00Z",
  "price": 0.50
}`,
  },
  {
    id: 'active',
    method: 'GET',
    path: '/api/v1/short-term/active',
    title: 'List Active Assignments',
    desc: 'Returns all your currently active short-term email assignments.',
    body: null,
    response: `{
  "assignments": [
    {
      "email_id": "user123@icloud.com",
      "platform": "instagram",
      "lock_token": "a1b2c3d4e5f6...",
      "assigned_at": "2026-04-06T12:00:00Z",
      "expires_at": "2026-04-06T12:30:00Z",
      "inbox_received": false
    }
  ]
}`,
  },
  {
    id: 'inbox',
    method: 'GET',
    path: '/api/v1/short-term/inbox?email_id={email_id}',
    title: 'Poll Inbox',
    desc: 'Check for incoming messages/OTP for your active email. Poll this endpoint every few seconds after requesting an email.',
    body: null,
    query: 'email_id=user123@icloud.com',
    response: `{
  "messages": [
    {
      "subject": "Your verification code",
      "sender": "Instagram",
      "otp": "483291",
      "time": "2026-04-06T12:02:15Z",
      "body": "Your Instagram code is 483291..."
    }
  ],
  "count": 1
}`,
  },
  {
    id: 'complete',
    method: 'POST',
    path: '/api/v1/short-term/complete',
    title: 'Complete (OTP Received)',
    desc: 'Mark the assignment as complete after you have received and used the OTP. No refund after this.',
    body: `{
  "email_id": "user123@icloud.com",
  "lock_token": "a1b2c3d4e5f6..."
}`,
    response: `{ "message": "Assignment completed", "email_id": "user123@icloud.com" }`,
  },
  {
    id: 'release',
    method: 'POST',
    path: '/api/v1/short-term/release',
    title: 'Release Email',
    desc: 'Release the email before the timer expires. You get a full refund only if no inbox messages were received.',
    body: `{
  "email_id": "user123@icloud.com",
  "lock_token": "a1b2c3d4e5f6..."
}`,
    response: `{ "message": "Released and refunded", "email_id": "user123@icloud.com", "refunded": 0.50 }`,
  },
  {
    id: 'ban',
    method: 'POST',
    path: '/api/v1/short-term/ban',
    title: 'Ban Email',
    desc: 'Ban an email if it is already registered on the platform. Only works before OTP is received. You get a full refund.',
    body: `{
  "email_id": "user123@icloud.com",
  "lock_token": "a1b2c3d4e5f6..."
}`,
    response: `{ "message": "Platform banned and refunded", "email_id": "user123@icloud.com", "refunded": 0.50 }`,
  },
  {
    id: 'report',
    method: 'POST',
    path: '/api/v1/short-term/report',
    title: 'Report Issue',
    desc: 'Report a problem with the email (e.g. wrong OTP, email not working). Only works after inbox has received messages.',
    body: `{
  "email_id": "user123@icloud.com",
  "lock_token": "a1b2c3d4e5f6...",
  "comment": "Received OTP but it was invalid"
}`,
    response: `{ "message": "Report submitted" }`,
  },
];

function MethodBadge({ method }) {
  const colors = {
    GET: '#22c55e',
    POST: '#6366f1',
    PUT: '#f59e0b',
    DELETE: '#ef4444',
  };
  return (
    <span
      style={{
        background: colors[method] || '#888',
        color: '#fff',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: 'monospace',
        letterSpacing: 0.5,
      }}
    >
      {method}
    </span>
  );
}

function CodeBlock({ code, language }) {
  return (
    <div style={{ position: 'relative' }}>
      <pre
        style={{
          background: '#0f1117',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '12px 16px',
          overflow: 'auto',
          fontSize: 13,
          lineHeight: 1.5,
          color: '#e4e6f0',
        }}
      >
        <code>{code}</code>
      </pre>
      <div style={{ position: 'absolute', top: 8, right: 8 }}>
        <CopyButton text={code} label="Copy" />
      </div>
    </div>
  );
}

function EndpointCard({ ep }) {
  const [expanded, setExpanded] = useState(false);

  const curlExample = ep.method === 'GET'
    ? `curl -H "X-API-Key: YOUR_API_KEY" \\\n  "${BASE_URL}${ep.body ? ep.path : ep.query ? ep.path.split('?')[0] + '?' + ep.query : ep.path}"`
    : `curl -X ${ep.method} \\\n  -H "X-API-Key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${ep.body}' \\\n  "${BASE_URL}${ep.path}"`;

  const pythonExample = ep.method === 'GET'
    ? `import requests

resp = requests.get(
    "${BASE_URL}${ep.query ? ep.path.split('?')[0] : ep.path}",${ep.query ? `\n    params={"email_id": "user123@icloud.com"},` : ''}
    headers={"X-API-Key": "YOUR_API_KEY"}
)
print(resp.json())`
    : `import requests

resp = requests.post(
    "${BASE_URL}${ep.path}",
    json=${ep.body || '{}'},
    headers={"X-API-Key": "YOUR_API_KEY"}
)
print(resp.json())`;

  const nodeExample = ep.method === 'GET'
    ? `const resp = await fetch("${BASE_URL}${ep.query ? ep.path.split('?')[0] + '?' + ep.query : ep.path}", {
  headers: { "X-API-Key": "YOUR_API_KEY" }
});
const data = await resp.json();
console.log(data);`
    : `const resp = await fetch("${BASE_URL}${ep.path}", {
  method: "${ep.method}",
  headers: {
    "X-API-Key": "YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${ep.body || '{}'})
});
const data = await resp.json();
console.log(data);`;

  return (
    <div
      id={ep.id}
      className="card"
      style={{ marginBottom: 16 }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <MethodBadge method={ep.method} />
        <code style={{ fontSize: 14, flex: 1, color: 'var(--text)' }}>{ep.path}</code>
        <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{ep.title}</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 18, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 16 }}>
          <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 16 }}>{ep.desc}</p>

          {ep.body && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Request Body</div>
              <CodeBlock code={ep.body} />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Response</div>
            <CodeBlock code={ep.response} />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Examples</div>
            <ExampleTabs curl={curlExample} python={pythonExample} node={nodeExample} />
          </div>
        </div>
      )}
    </div>
  );
}

function ExampleTabs({ curl, python, node }) {
  const [tab, setTab] = useState('curl');
  const tabs = { curl, python, node };
  return (
    <div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 0 }}>
        {Object.keys(tabs).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? '#0f1117' : 'transparent',
              color: tab === t ? 'var(--text)' : 'var(--text-dim)',
              border: '1px solid var(--border)',
              borderBottom: tab === t ? '1px solid #0f1117' : '1px solid var(--border)',
              borderRadius: '6px 6px 0 0',
              padding: '6px 16px',
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: -1,
              zIndex: tab === t ? 1 : 0,
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <CodeBlock code={tabs[tab]} />
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <h1 className="page-title">API Documentation</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 24, fontSize: 15 }}>
        Integrate short-term email services into your applications using our REST API.
      </p>

      {/* Quick nav */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>Quick Navigation</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {endpoints.map((ep) => (
            <a
              key={ep.id}
              href={`#${ep.id}`}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                fontSize: 13,
                color: 'var(--text)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(ep.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            >
              <MethodBadge method={ep.method} />
              {ep.title}
            </a>
          ))}
        </div>
      </div>

      {/* Authentication */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>Authentication</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 12 }}>
          All API requests require an API key. Generate one from your{' '}
          <a href="/profile">Profile page</a>. Pass it in the <code style={{ color: 'var(--primary)' }}>X-API-Key</code> header:
        </p>
        <CodeBlock code={`X-API-Key: your_api_key_here`} />
        <div
          style={{
            marginTop: 12,
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 6,
            fontSize: 13,
            color: '#fca5a5',
          }}
        >
          <strong>Security:</strong> Keep your API key secret. Do not share it or commit it to version control.
          If compromised, regenerate it from your profile.
        </div>
      </div>

      {/* Workflow */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>Typical Workflow</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { step: 1, text: 'List platforms to see what\'s available and pricing', id: 'platforms' },
            { step: 2, text: 'Request an email for your desired platform', id: 'request' },
            { step: 3, text: 'Poll the inbox every 3-5 seconds for incoming OTP', id: 'inbox' },
            { step: 4, text: 'OTP arrived → Complete the assignment', id: 'complete' },
            { step: 5, text: 'Email already registered? → Ban it (full refund)', id: 'ban' },
            { step: 6, text: 'Don\'t need it anymore? → Release (refund if no inbox)', id: 'release' },
          ].map(({ step, text, id }) => (
            <div
              key={step}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                background: 'var(--bg)',
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              <span
                style={{
                  background: 'var(--primary)',
                  color: '#fff',
                  borderRadius: '50%',
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {step}
              </span>
              <span style={{ flex: 1 }}>{text}</span>
              <a
                href={`#${id}`}
                style={{ fontSize: 12, color: 'var(--primary)' }}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                View →
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Rate Limits */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>Rate Limits</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
          The API is rate limited to <strong style={{ color: 'var(--text)' }}>100 requests per minute</strong> per IP address.
          Exceeding this limit will return a <code style={{ color: 'var(--danger)' }}>429</code> status code.
        </p>
      </div>

      {/* Errors */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>Error Format</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 12 }}>
          All errors return a JSON object with an <code style={{ color: 'var(--primary)' }}>error</code> field:
        </p>
        <CodeBlock
          code={`// HTTP 400 / 401 / 403 / 404 / 500
{ "error": "Description of what went wrong" }`}
        />
        <div style={{ marginTop: 12 }}>
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>Code</th>
                <th style={{ textAlign: 'left', padding: '6px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['400', 'Bad request — missing or invalid parameters'],
                ['401', 'Unauthorized — invalid or missing API key'],
                ['403', 'Forbidden — you don\'t own this resource'],
                ['404', 'Not found — no email available or assignment not found'],
                ['429', 'Rate limited — too many requests'],
                ['500', 'Server error — try again later'],
              ].map(([code, desc]) => (
                <tr key={code}>
                  <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'monospace', fontWeight: 600, color: parseInt(code) >= 500 ? 'var(--danger)' : parseInt(code) >= 400 ? 'var(--warning)' : 'var(--text)' }}>{code}</td>
                  <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)' }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full Example */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>Full JavaScript Example</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 12 }}>
          Complete workflow — request an email, poll for OTP, and complete:
        </p>
        <CodeBlock
          code={`const express = require('express');
const cors = require('cors');

const API_KEY = "your_api_key_here"; // replace with your actual API key
const BASE = "https://rent-email.onrender.com//api/v1";
const headers = { "X-API-Key": API_KEY, "Content-Type": "application/json" };

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

async function getEmail(platform) {
  // 1. Request email
  const assignRes = await fetch(\`\${BASE}/short-term/request\`, {
    method: "POST",
    headers,
    body: JSON.stringify({ platform }),
  });
  const assignData = await assignRes.json();
  if (!assignRes.ok || !assignData.email_id) {
    console.error("Request failed:", assignData);
    return null;
  }
  const { email_id, lock_token } = assignData;
  console.log(\`Got email: \${email_id}\`);

  // 2. Poll for OTP (every 5s, up to 5 minutes)
  for (let i = 0; i < 60; i++) {
    const inboxRes = await fetch(
      \`\${BASE}/short-term/inbox?email_id=\${encodeURIComponent(email_id)}\`,
      { headers }
    );
    const inboxData = await inboxRes.json();
    const messages = inboxData.messages || [];

    if (messages.length > 0) {
      console.log("Raw messages:", JSON.stringify(messages, null, 2));
    }

    for (const msg of messages) {
      // Try dedicated otp field first, then extract from subject/body via regex
      const text = msg.otp || msg.subject || msg.body || msg.text || "";
      const otpMatch = String(text).match(/\\b(\\d{4,8})\\b/);
      const otp = msg.otp || (otpMatch && otpMatch[1]);

      if (otp) {
        console.log(\`OTP received: \${otp}\`);

        // 3. Complete the assignment
        await fetch(\`\${BASE}/short-term/complete\`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email_id, lock_token }),
        });
        console.log("Done!");
        return otp;
      }
    }

    await new Promise((r) => setTimeout(r, 5000));
  }

  // No OTP received — release for refund
  await fetch(\`\${BASE}/short-term/release\`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email_id, lock_token }),
  });
  console.log("Released and refunded");
  return null;
}

// Usage
getEmail("x").then((otp) => console.log("Result:", otp));

app.listen(PORT, () => {
  console.log(\`Server running at http://localhost:\${PORT}/\`);
});`}
        />
      </div>

      {/* Endpoints */}
      <h2 style={{ marginBottom: 16, fontSize: 20 }}>Endpoints</h2>
      {endpoints.map((ep) => (
        <EndpointCard key={ep.id} ep={ep} />
      ))}

      <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-dim)', fontSize: 13 }}>
        Need help? Contact support via Telegram.
      </div>
    </div>
  );
}
