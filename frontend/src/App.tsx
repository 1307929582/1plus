import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Veterans from './pages/Veterans';
import Codes from './pages/Codes';
import Verify from './pages/Verify';
import Settings from './pages/Settings';
import OAuthCallback from './pages/OAuthCallback';
import Layout from './components/Layout';

function App() {
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    const auth = localStorage.getItem('auth');
    setIsAuth(!!auth);
  }, []);

  const handleLogin = (username: string, password: string) => {
    const auth = btoa(`${username}:${password}`);
    localStorage.setItem('auth', auth);
    setIsAuth(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth');
    setIsAuth(false);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Verify />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/admin" element={
          isAuth ? <Layout onLogout={handleLogout} /> : <Login onLogin={handleLogin} />
        }>
          <Route index element={<Dashboard />} />
          <Route path="veterans" element={<Veterans />} />
          <Route path="codes" element={<Codes />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
