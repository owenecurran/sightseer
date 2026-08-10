import { router } from 'expo-router';
import { useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TaggedUsersModal } from '@/components/tagged-users-modal';

export type FeedAuthorLineTaggedUser = { id: string; name: string };

type FeedAuthorLineProps = {
  authorId: string;
  authorName: string;
  taggedUsers: FeedAuthorLineTaggedUser[];
  style?: StyleProp<TextStyle>;
};

// "AuthorName with TaggedName [+ N others]" — previously a single plain
// string (formatAuthorLine, duplicated across index.tsx/visit/[id].tsx/
// tagged-in.tsx), which meant the whole line could only ever go to one
// place (the author's own profile). Per direct feedback, the author name
// and the first tagged name should each go to *their own* profile, and
// "+N others" should open a roster of everyone tagged — so this is now a
// shared component (same "one implementation, every caller matches"
// reasoning as FeedCardHeaderText) built from nested, independently
// tappable <ThemedText> spans rather than one opaque string, plus the
// modal for the "+N others" case.
export function FeedAuthorLine({ authorId, authorName, taggedUsers, style }: FeedAuthorLineProps) {
  const [isTaggedModalOpen, setIsTaggedModalOpen] = useState(false);

  function goToProfile(userId: string) {
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  }

  if (taggedUsers.length === 0) {
    return (
      <ThemedText type="smallBold" style={style} onPress={() => goToProfile(authorId)}>
        {authorName}
      </ThemedText>
    );
  }

  const [first, ...rest] = taggedUsers;

  return (
    <>
      <ThemedText type="smallBold" style={style}>
        <ThemedText type="smallBold" onPress={() => goToProfile(authorId)}>
          {authorName}
        </ThemedText>
        {' with '}
        <ThemedText type="smallBold" onPress={() => goToProfile(first.id)}>
          {first.name}
        </ThemedText>
        {rest.length > 0 && (
          <ThemedText type="smallBold" onPress={() => setIsTaggedModalOpen(true)}>
            {` + ${rest.length} other${rest.length > 1 ? 's' : ''}`}
          </ThemedText>
        )}
      </ThemedText>
      {rest.length > 0 && (
        <TaggedUsersModal
          visible={isTaggedModalOpen}
          onClose={() => setIsTaggedModalOpen(false)}
          userIds={taggedUsers.map((u) => u.id)}
        />
      )}
    </>
  );
}
