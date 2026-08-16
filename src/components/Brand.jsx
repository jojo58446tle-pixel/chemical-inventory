import { ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Brand({ compact = false }) {
  return (
    <Link to="/" className="brand" aria-label="IQC Risk Assessment home">
      <span className="brand-mark"><ShieldCheck size={22} strokeWidth={2.3} /></span>
      {!compact && <span><strong>IQC Risk</strong><small>Assessment System</small></span>}
    </Link>
  );
}
