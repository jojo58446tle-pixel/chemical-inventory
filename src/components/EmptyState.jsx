import { SearchX } from 'lucide-react';

export function EmptyState({ title = 'No records found', text = 'Try another search or add a new NG record.' }) {
  return <div className="empty-state"><SearchX size={34} /><strong>{title}</strong><p>{text}</p></div>;
}
