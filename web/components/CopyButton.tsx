'use client';

import { useState } from 'react';

interface CopyButtonProps {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  onCopy?: () => void;
}

export function CopyButton({ value, label = 'Copy', copiedLabel = 'Copied', className = '', onCopy }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'blocked'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
      onCopy?.();
      window.setTimeout(() => setState('idle'), 1600);
    } catch {
      setState('blocked');
    }
  }

  return (
    <button className={className || 'button'} type="button" onClick={copy}>
      {state === 'copied' ? copiedLabel : state === 'blocked' ? 'Select and copy' : label}
    </button>
  );
}
