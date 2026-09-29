import type { MarkdownInstance } from 'astro';
export interface PostMeta { title: string; description: string; date: string; author: string; tags: string[]; discussion?: string; draft?: boolean; }
const modules = import.meta.glob<MarkdownInstance<PostMeta>>('../content/blog/*.md', { eager: true });
export const posts = Object.entries(modules).filter(([, p]) => !p.frontmatter.draft).map(([path, p]) => ({
  ...p, slug: path.split('/').pop()!.replace(/\.md$/, ''),
  minutes: Math.max(1, Math.ceil(p.rawContent().split(/\s+/).length / 220)),
})).sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date));
export const postUrl = (slug: string) => `/blog/${slug}/`;
export const displayDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
