// Cloudflare Pages Function: GET /api/og
// Renders a social share-card PNG via workers-og (satori + resvg, WASM-based —
// the Cloudflare-runtime equivalent of @vercel/og). No params → the brand card
// (used as the landing page's og:image); with params → the per-result verdict
// card (used by the playground's "share card" button).
import { ImageResponse } from 'workers-og';
import { parseParams, buildCardHtml, buildBrandHtml } from '../_lib/og.js';

interface PagesContext {
  request: Request;
}

export const onRequestGet = async (context: PagesContext): Promise<Response> => {
  const { skill, status, errors, warnings, hasResult } = parseParams(context.request.url);
  const html = hasResult ? buildCardHtml(skill, status, errors, warnings) : buildBrandHtml();
  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    format: 'png',
  });
};
