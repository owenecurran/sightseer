import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { CommentsTrigger } from "@/components/comments-section";
import { SaveToBoard } from "@/components/save-to-board";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

// One size for every icon in the row (heart, comment, share, save) — per
// direct feedback the previous mix (heart deliberately bigger at 30,
// save at 26, comment/share at 24) didn't read as a considered hierarchy,
// just inconsistent.
const ICON_SIZE = 28;

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
          name={isLiked ? "heart" : "heart-outline"}
          size={ICON_SIZE}
          color={isLiked ? theme.text : theme.textSecondary}
        />
        <ThemedText
          type="small"
          themeColor={isLiked ? "text" : "textSecondary"}
        >
          {likeCount}
        </ThemedText>
      </Pressable>

      <CommentsTrigger
        count={commentCount}
        isOpen={isCommentsOpen}
        onPress={onToggleComments}
      />

      {/* Icon only, no "Share"/"Copied ✓" label — per direct feedback the
          text made this one button visually heavier than its neighbors,
          working against "all icons the same size, in line with each
          other." isCopied still needs *some* feedback that the tap
          registered; the icon itself swaps to a checkmark for that. */}
      <Pressable onPress={onShare} hitSlop={8} style={styles.actionButton}>
        <Ionicons
          name={isCopied ? "checkmark-outline" : "arrow-redo-outline"}
          size={ICON_SIZE}
          color={theme.textSecondary}
        />
      </Pressable>

      <SaveToBoard
        visitId={visitId}
        isOwnerOrTagged={isOwnerOrTagged}
        size={ICON_SIZE}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // A plain left-flowing row, evenly gapped — not clustered together in
  // the row's center (that was a misread of "center the icons": the ask
  // was for the icons to line up consistently with each other — same
  // size, same baseline, evenly spaced — not to bunch them away from the
  // row's edges).
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.four,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
});
