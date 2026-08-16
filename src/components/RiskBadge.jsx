import { AlertTriangle, CheckCircle2, CircleDot } from 'lucide-react';
import { riskClass } from '../lib/format';

export function RiskBadge({ level = 'PENDING', large = false }) {
  const Icon = level === 'HIGH' ? AlertTriangle : level === 'MEDIUM' ? CircleDot : CheckCircle2;
  return <span className={`risk-badge ${riskClass(level)} ${large ? 'risk-large' : ''}`}><Icon size={large ? 18 : 14} />{level}</span>;
}
