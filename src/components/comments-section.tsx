import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { getAvatarViewUrls } from '@/lib/avatar';
import { addComment, deleteComment, listComments, type Comment } from '@/lib/comments';

// Short, glanceable relative time ("2h", "3d") rather than a full date/time —
// matches how the rest of this app favors compact stat-style labels over
// verbose timestamps (e.g. "3 sights seen"). No existing shared formatter
// for this in the codebase, so it's local here rather than force-fitting an
// unrelated one.
function relativeTime(isoDate: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

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
  const theme = useTheme();
  const [comments, setComments] = useState<Comment[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    listComments(visitId)
      .then((fetched) => {
        setComments(fetched);
        return getAvatarViewUrls([...new Set(fetched.map((c) => c.userId))]);
      })
      .then(setAvatarUrls)
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
      if (!avatarUrls[comment.userId]) {
        getAvatarViewUrls([comment.userId]).then((urls) => setAvatarUrls((prev) => ({ ...prev, ...urls })));
      }
      setNewComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that comment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    setError(null);
    setIsDeleting(true);
    try {
      await deleteComment(pendingDeleteId);
      setComments((prev) => {
        const next = prev.filter((c) => c.id !== pendingDeleteId);
        onCountChange(next.length);
        return next;
      });
      setPendingDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that comment.');
    } finally {
      setIsDeleting(false);
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
            <Avatar uri={avatarUrls[comment.userId]} name={comment.authorName} size={28} />
            <View style={styles.commentBody}>
              <View style={styles.commentHeader}>
                <ThemedText type="smallBold">{comment.authorName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {relativeTime(comment.createdAt)}
                </ThemedText>
              </View>
              <ThemedText type="small">{comment.body}</ThemedText>
            </View>
            {canDelete && (
              <Pressable onPress={() => setPendingDeleteId(comment.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={16} color={theme.textSecondary} />
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

      <ConfirmDeleteModal
        visible={pendingDeleteId != null}
        message="Delete this comment?"
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
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
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  commentBody: {
    flex: 1,
    gap: Spacing.half,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.one,
  },
  addRow: {
    gap: Spacing.two,
  },
  addInput: {
    flex: 1,
  },
});
