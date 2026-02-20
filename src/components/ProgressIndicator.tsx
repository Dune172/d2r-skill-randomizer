'use client';

interface ProgressIndicatorProps {
  status: 'idle' | 'generating' | 'building' | 'ready' | 'error';
  message?: string;
}

const STATUS_CONFIG = {
  generating: { text: 'Divining the threads of fate…', color: 'text-[#80b8e8]', spin: true },
  building:   { text: 'Forging the artifact…',         color: 'text-[#c8942a]', spin: true },
  ready:      { text: 'The artifact is ready.',         color: 'text-[#50c058]', spin: false },
  error:      { text: '',                               color: 'text-[#c84040]', spin: false },
  idle:       { text: '',                               color: '',               spin: false },
};

export default function ProgressIndicator({ status, message }: ProgressIndicatorProps) {
  if (status === 'idle') return null;

  const cfg = STATUS_CONFIG[status];

  return (
    <div className={`flex items-center gap-3 font-cinzel text-[11px] tracking-[0.18em] uppercase ${cfg.color}`}>
      {cfg.spin && (
        <svg className="animate-spin h-4 w-4 flex-shrink-0" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {!cfg.spin && status === 'ready' && <span>◆</span>}
      {!cfg.spin && status === 'error' && <span>✕</span>}
      <span>{status === 'error' ? (message || 'An error occurred') : cfg.text}</span>
    </div>
  );
}
