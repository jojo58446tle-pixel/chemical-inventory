import { useEffect, useState } from 'react';
import { ArrowRight, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { api } from '../lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.me().then(() => navigate('/admin', { replace: true })).catch(() => {}); }, [navigate]);

  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('');
    try { await api.login(password); navigate('/admin', { replace: true }); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return <main className="login-page"><div className="login-top"><Brand /><Link to="/">Public risk search <ArrowRight size={16} /></Link></div><section className="login-card"><div className="login-symbol"><ShieldCheck /></div><span className="eyebrow">AUTHORIZED PERSONNEL</span><h1>Admin access</h1><p>Enter your admin password to manage NG records, risk results, AI recommendations and alerts.</p>{error && <div className="error-banner">{error}</div>}<form onSubmit={submit}><label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required /></label><button className="button primary full-button" disabled={loading}>{loading ? <Loader2 className="spin" /> : <KeyRound />}{loading ? 'Signing in…' : 'Sign in securely'}</button></form></section></main>;
}
