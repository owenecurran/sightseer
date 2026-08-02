import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { CommentsTrigger } from '@/components/comments-section';
import { SaveToBoard } from '@/components/save-to-board';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Bigger than the other icons (was 24, matching share/comment) — the
// like button is the single most-used action, worth making an obviously
// bigger target than the rest.
const HEART_SIZE = 30;
const ICON_SIZE = 24;

type VisitActionsRowProps = {
  visitId: string;
  isLiked: boolean;
  likeCount: number;
  onToggleLike: () => void;
  onShare: () => void;
  isCopied: boolean;
  isOwnerOrTagged: boolean;
  commentCount: number;
  isCommentsOpen: boolean;
  onToggleComments: () => void;
};

// One inline row for heart/comment/share/save — used identically by the feed
// (index.tsx) and the visit-detail screen, so "all icons inline" is
// structural (one shared component, plain flexbox) rather than something
// that needs per-platform handling.
export function VisitActionsRow({
  visitId,
  isLiked,
  likeCount,
  onToggleLike,
  onShare,
  isCopied,
  isOwnerOrTagged,
  commentCount,
  isCommentsOpen,
  onToggleComments,
}: VisitActionsRowProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <Pressable onPress={onToggleLike} hitSlop={8} style={styles.actionButton}>
        <Ionicons
          name={isLiked ? 'heart' : 'heart-outline'}
          size={HEART_SIZE}
          color={isLiked ? theme.text : theme.textSecondary}
        />
        <ThemedText type="small" themeColor={isLiked ? 'text' : 'textSecondary'}>
          {likeCount}
        </ThemedText>
      </Pressable>

      <CommentsTrigger count={commentCount} isOpen={isCommentsOpen} onPress={onToggleComments} />

      <Pressable onPress={onShare} hitSlop={8} style={styles.actionButton}>
        <Ionicons name="arrow-redo-outline" size={ICON_SIZE} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {isCopied ? 'Copied ✓' : 'Share'}
        </ThemedText>
      </Pressable>

      <View style={styles.spacer} />

      <SaveToBoard visitId={visitId} isOwnerOrTagged={isOwnerOrTagged} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  spacer: {
    flex: 1,
  },
});
