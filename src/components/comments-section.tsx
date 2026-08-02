import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { addComment, deleteComment, listComments, type Comment } from '@/lib/comments';

type CommentsTriggerProps = {
  count: number;
  isOpen: boolean;
  onPress: () => void;
};

// The dumb, always-inline half — icon + count, sits directly in
// visit-actions-row.tsx alongside heart/share/save. The expanded thread
// (CommentsThread below) renders separately, below the whole icon row.
export function CommentsTrigger({ count, isOpen, onPress }: CommentsTriggerProps) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.entryRow}>
      <Ionicons name={isOpen ? 'chatbubble' : 'chatbubble-outline'} size={24} color={theme.textSecondary} />
      {count > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {count}
        </ThemedText>
      )}
    </Pressable>
  );
}

type CommentsThreadProps = {
  visitId: string;
  visitOwnerId: string;
  onCountChange: (count: number) => void;
};

// The expanded fetch/list/add-comment panel — mounted only while open
// (isCommentsOpen lifted to the caller alongside CommentsTrigger), so this
// fetches on every mount rather than gating internally on its own isExpanded.
export function CommentsThread({ visitId, visitOwnerId, onCountChange }: CommentsThreadProps) {
  const { session } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    listComments(visitId)
      .then(setComments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load comments.'))
      .finally(() => setIsLoading(false));
  }, [visitId]);

  async function handleAddComment() {
    if (!session || !newComment.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const comment = await addComment(visitId, session.user.id, newComment.trim());
      setComments((prev) => {
        const next = [...prev, comment];
        onCountChange(next.length);
        return next;
      });
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
      setComments((prev) => {
        const next = prev.filter((c) => c.id !== commentId);
        onCountChange(next.length);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that comment.');
    }
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
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
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
