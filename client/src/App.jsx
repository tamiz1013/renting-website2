import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LongTermPage from './pages/LongTermPage.jsx';
import InboxPage from './pages/InboxPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import DepositPage from './pages/DepositPage.jsx';
import TransferPage from './pages/TransferPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import TelegramLoginPage from './pages/TelegramLoginPage.jsx';
import ApiDocsPage from './pages/ApiDocsPage.jsx';

function ProtectedRoute({ children, adminOnly }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/signup" element={user ? <Navigate to="/" /> : <SignupPage />} />
      <Route path="/tglogin" element={user ? <Navigate to="/" /> : <TelegramLoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="long-term" element={<LongTermPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="deposit" element={<DepositPage />} />
        <Route path="transfer" element={<TransferPage />} />
        <Route path="docs" element={<ApiDocsPage />} />
        <Route
          path="admin/*"
          element={
            <ProtectedRoute adminOnly>
              <AdminPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
