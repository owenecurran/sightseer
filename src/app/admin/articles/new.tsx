import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import {
  createArticle,
  getArticleForEdit,
  setArticlePublished,
  updateArticle,
} from '@/lib/articles';
import { useAuth } from '@/lib/auth-context';
import { uploadCoverPhoto } from '@/lib/covers';
import { pickImageFromLibrary } from '@/lib/image-picker';

// One screen for both create and edit (?id=), same pattern review-form.tsx
// already uses for a fresh review vs. resuming a draft — the form/fields are
// identical either way, only the save action (insert vs. update) differs.
export default function ArticleComposeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [body, setBody] = useState('');
  const [published, setPublished] = useState(false);
  const [pendingCoverUri, setPendingCoverUri] = useState<string | null>(null);
  const [pendingCoverMimeType, setPendingCoverMimeType] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(!id);

  useEffect(() => {
    if (!id) return;
    getArticleForEdit(id)
      .then((article) => {
        if (!article) {
          setError('This article is no longer available.');
          return;
        }
        setTitle(article.title);
        setSubtitle(article.subtitle ?? '');
        setBody(article.body);
        setPublished(article.published);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load that article.'))
      .finally(() => setHasLoadedOnce(true));
  }, [id]);

  async function handlePickCover() {
    const result = await pickImageFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required.');
      return;
    }
    if (!result) return;
    setPendingCoverUri(result.uri);
    setPendingCoverMimeType(result.mimeType);
  }

  async function handleSave() {
    if (!session || !title.trim() || !body.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      let articleId = id;
      if (articleId) {
        await updateArticle(articleId, { title: title.trim(), subtitle: subtitle.trim() || null, body: body.trim() });
      } else {
        articleId = await createArticle({
          authorId: session.user.id,
          title: title.trim(),
          subtitle: subtitle.trim() || null,
          body: body.trim(),
        });
      }

      if (pendingCoverUri) {
        await uploadCoverPhoto({ table: 'articles', id: articleId, uri: pendingCoverUri, mimeType: pendingCoverMimeType });
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that article.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTogglePublished() {
    if (!id) return;
    const next = !published;
    setPublished(next);
    try {
      await setArticlePublished(id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update publish state.');
      setPublished(!next);
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <BackLink seed="new" />

          <ThemedText type="displaySerif">{id ? 'Edit article' : 'New article'}</ThemedText>

          <TextField placeholder="Title" value={title} onChangeText={setTitle} />
          <TextField placeholder="Subtitle (optional)" value={subtitle} onChangeText={setSubtitle} />
          <TextField
            placeholder="Write the article — separate paragraphs with a blank line"
            value={body}
            onChangeText={setBody}
            multiline
            style={styles.bodyField}
          />

          <Button
            label={pendingCoverUri ? 'Cover photo selected ✓' : 'Add a cover photo (optional)'}
            variant="secondary"
            onPress={handlePickCover}
          />

          {id && (
            <Pressable onPress={handleTogglePublished} style={styles.checkboxRow}>
              <ThemedView type={published ? 'backgroundSelected' : 'backgroundElement'} style={styles.checkbox}>
                {published && <ThemedText type="smallBold">✓</ThemedText>}
              </ThemedView>
              <ThemedText type="small">Published — visible to everyone</ThemedText>
            </Pressable>
          )}

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <Button
            label={id ? 'Save changes' : 'Save draft'}
            onPress={handleSave}
            loading={isSaving}
            disabled={!title.trim() || !body.trim()}
          />
          {!id && (
            <ThemedText type="small" themeColor="textSecondary">
              New articles start unpublished — publish it from the edit screen once it's ready.
            </ThemedText>
          )}
        </Animated.ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  bodyField: {
    minHeight: 200,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
