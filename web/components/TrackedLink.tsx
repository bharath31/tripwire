'use client';

import Link from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { trackFunnel } from '@/lib/analytics';

interface TrackedLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  location: string;
  children: ReactNode;
}

export function TrackedLink({ href, location, children, onClick, ...props }: TrackedLinkProps) {
  return (
    <Link
      href={href}
      onClick={event => {
        trackFunnel('cta_clicked', { location, destination: href });
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
