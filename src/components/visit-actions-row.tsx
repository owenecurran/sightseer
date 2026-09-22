import { StyleSheet, View } from "react-native";

import { CommentsTrigger } from "@/components/comments-section";
import { SaveToBoard } from "@/components/save-to-board";
import { ActionSticker } from "@/components/ui/action-sticker";
import { Spacing } from "@/constants/theme";
// Every press here sits on top of the card's flip gesture, so each one is
// guarded — on web a drag that ends over the heart would otherwise like the
// review on the way past. See src/lib/card-drag-guard.ts.
import { guardCardPress } from "@/lib/card-drag-guard";

// Each action owns one accent for the life of the app, so the row is
// learnable by colour as well as by glyph.
const LIKE_ACCENT = 2;
const COMMENT_ACCENT = 3;
const SHARE_ACCENT = 1;
const SAVE_ACCENT = 0;

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
  return (
    <View style={styles.row}>
      <ActionSticker
        icon={isLiked ? "heart" : "heart-outline"}
        accentIndex={LIKE_ACCENT}
        active={isLiked}
        count={likeCount}
        onPress={guardCardPress(onToggleLike)}
        accessibilityLabel={isLiked ? "Unlike" : "Like"}
      />

      <CommentsTrigger
        count={commentCount}
        isOpen={isCommentsOpen}
        onPress={guardCardPress(onToggleComments)}
        accentIndex={COMMENT_ACCENT}
      />

      {/* The icon swaps to a tick on copy — the row carries no labels, so
          the glyph is the only place the tap can be acknowledged. */}
      <ActionSticker
        icon={isCopied ? "checkmark-outline" : "arrow-redo-outline"}
        accentIndex={SHARE_ACCENT}
        active={isCopied}
        onPress={guardCardPress(onShare)}
        accessibilityLabel="Share"
      />

      <SaveToBoard
        visitId={visitId}
        isOwnerOrTagged={isOwnerOrTagged}
        accentIndex={SAVE_ACCENT}
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
