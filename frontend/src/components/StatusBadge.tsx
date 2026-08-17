export default function StatusBadge({ state }: { state: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-slate-100 text-slate-700',
    STARTED: 'bg-blue-100 text-blue-700',
    RUNNING: 'bg-blue-100 text-blue-700',
    SUCCESS: 'bg-green-100 text-green-700',
    FAILURE: 'bg-red-100 text-red-700',
    REVOKED: 'bg-red-100 text-red-700',
  }

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[state] || 'bg-slate-100 text-slate-700'}`}>
      {state}
    </span>
  )
}