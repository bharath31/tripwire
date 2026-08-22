import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/playground', '/setup', '/security', '/pricing.md'];
  return routes.map((route, index) => ({
    url: `https://tripwire.bharath.sh${route}`,
    lastModified: new Date('2026-08-22'),
    changeFrequency: index === 0 ? 'weekly' : 'monthly',
    priority: index === 0 ? 1 : route === '/setup' ? 0.9 : 0.7,
  }));
}
