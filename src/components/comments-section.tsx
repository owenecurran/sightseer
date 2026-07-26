import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { addComment, deleteComment, listComments, type Comment } from '@/lib/comments';

type CommentsSectionProps = {
  visitId: string;
  visitOwnerId: string;
  initialCount: number;
};

export function CommentsSection({ visitId, visitOwnerId, initialCount }: CommentsSectionProps) {
  const { session } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    if (!isExpanded) return;
    setIsLoading(true);
    setError(null);
    listComments(visitId)
      .then(setComments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load comments.'))
      .finally(() => setIsLoading(false));
  }, [isExpanded, visitId]);

  async function handleAddComment() {
    if (!session || !newComment.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const comment = await addComment(visitId, session.user.id, newComment.trim());
      setComments((prev) => [...prev, comment]);
      setCount((prev) => prev + 1);
      setNewComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that comment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    setError(null);
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setCount((prev) => Math.max(prev - 1, 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that comment.');
    }
  }

  if (!isExpanded) {
    return (
      <Pressable onPress={() => setIsExpanded(true)}>
        <ThemedText type="small" themeColor="textSecondary">
          {count > 0 ? `💬 ${count} comment${count === 1 ? '' : 's'}` : '💬 Add a comment'}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      {isLoading && <ThemedText type="small">Loading…</ThemedText>}

      {comments.map((comment) => {
        const canDelete =
          !!session && (comment.userId === session.user.id || session.user.id === visitOwnerId);
        return (
          <View key={comment.id} style={styles.commentRow}>
            <ThemedText type="small" style={styles.commentBody}>
              <ThemedText type="smallBold">{comment.authorName}</ThemedText> {comment.body}
            </ThemedText>
            {canDelete && (
              <Pressable onPress={() => handleDelete(comment.id)}>
                <ThemedText type="small" themeColor="textSecondary">
                  ✕
                </ThemedText>
              </Pressable>
            )}
          </View>
        );
      })}

      <View style={styles.addRow}>
        <TextField
          placeholder="Add a comment..."
          value={newComment}
          onChangeText={setNewComment}
          style={styles.addInput}
        />
        <Button
          label="Post"
          onPress={handleAddComment}
          loading={isSubmitting}
          disabled={!newComment.trim()}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  commentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  commentBody: {
    flex: 1,
  },
  addRow: {
    gap: Spacing.two,
  },
  addInput: {
    flex: 1,
  },
});
