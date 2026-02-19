'use client';

interface ProgressIndicatorProps {
  status: 'idle' | 'generating' | 'building' | 'ready' | 'error';
  message?: string;
}

export default function ProgressIndicator({ status, message }: ProgressIndicatorProps) {
  if (status === 'idle') return null;

  const statusConfig = {
    generating: { text: 'Generating preview...', color: 'text-blue-400' },
    building: { text: 'Building mod (sprites + zip)...', color: 'text-amber-400' },
    ready: { text: 'Mod ready for download!', color: 'text-green-400' },
    error: { text: message || 'An error occurred', color: 'text-red-400' },
    idle: { text: '', color: '' },
  };

  const config = statusConfig[status];

  return (
    <div className={`flex items-center gap-2 ${config.color}`}>
      {(status === 'generating' || status === 'building') && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      <span className="text-sm">{config.text}</span>
    </div>
  );
}
