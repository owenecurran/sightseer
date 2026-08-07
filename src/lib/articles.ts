import { getCoverViewUrls } from '@/lib/covers';
import { supabase } from '@/lib/supabase';

export type ArticleListItem = {
  id: string;
  title: string;
  subtitle: string | null;
  coverPhotoUrl: string | null;
  publishedAt: string;
};

export type ArticleDetail = ArticleListItem & { body: string; authorName: string };

type RawListRow = {
  id: string;
  title: string;
  subtitle: string | null;
  cover_photo_r2_key: string | null;
  published_at: string;
};

export async function listPublishedArticles(limit = 5): Promise<ArticleListItem[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, subtitle, cover_photo_r2_key, published_at')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = data as RawListRow[];
  const coverIds = rows.filter((r) => r.cover_photo_r2_key).map((r) => r.id);
  const urls = coverIds.length > 0 ? await getCoverViewUrls('articles', coverIds) : {};

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    coverPhotoUrl: urls[row.id] ?? null,
    publishedAt: row.published_at,
  }));
}

type RawDetailRow = RawListRow & { body: string; users: { name: string | null; handle: string | null } | null };

export async function getArticle(id: string): Promise<ArticleDetail | null> {
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, subtitle, body, cover_photo_r2_key, published_at, users!author_id(name, handle)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as RawDetailRow;
  const urls = row.cover_photo_r2_key ? await getCoverViewUrls('articles', [row.id]) : {};

  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    coverPhotoUrl: urls[row.id] ?? null,
    publishedAt: row.published_at,
    authorName: row.users?.name ?? row.users?.handle ?? 'Sightseer',
  };
}

export type AdminArticleListItem = ArticleListItem & { published: boolean };

type RawAdminRow = {
  id: string;
  title: string;
  subtitle: string | null;
  cover_photo_r2_key: string | null;
  published_at: string | null;
  created_at: string;
};

// articles_select's RLS already lets an admin see drafts (published_at is
// null) alongside published articles — no separate admin-only query needed
// beyond just not filtering on published_at.
export async function listAllArticlesForAdmin(): Promise<AdminArticleListItem[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, subtitle, cover_photo_r2_key, published_at, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data as RawAdminRow[];
  const coverIds = rows.filter((r) => r.cover_photo_r2_key).map((r) => r.id);
  const urls = coverIds.length > 0 ? await getCoverViewUrls('articles', coverIds) : {};

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    coverPhotoUrl: urls[row.id] ?? null,
    publishedAt: row.published_at ?? row.created_at,
    published: row.published_at != null,
  }));
}

export async function createArticle(params: {
  authorId: string;
  title: string;
  subtitle: string | null;
  body: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('articles')
    .insert({ author_id: params.authorId, title: params.title, subtitle: params.subtitle, body: params.body })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateArticle(
  id: string,
  fields: { title: string; subtitle: string | null; body: string }
): Promise<void> {
  const { error } = await supabase
    .from('articles')
    .update({ title: fields.title, subtitle: fields.subtitle, body: fields.body })
    .eq('id', id);
  if (error) throw error;
}

export async function setArticlePublished(id: string, published: boolean): Promise<void> {
  const { error } = await supabase
    .from('articles')
    .update({ published_at: published ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteArticle(id: string): Promise<void> {
  const { error } = await supabase.from('articles').delete().eq('id', id);
  if (error) throw error;
}

export type ArticleForEdit = { id: string; title: string; subtitle: string | null; body: string; published: boolean };

export async function getArticleForEdit(id: string): Promise<ArticleForEdit | null> {
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, subtitle, body, published_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    subtitle: data.subtitle,
    body: data.body,
    published: data.published_at != null,
  };
}
