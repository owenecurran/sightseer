import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/page-loader";
import { TextField } from "@/components/ui/text-field";
import { Spacing } from "@/constants/theme";
import {
  InlineContactAccess,
  isInlineContactAccessAvailable,
} from "@/components/inline-contact-access";
import { PhoneVerify } from "@/components/phone-verify";
import { useAuth } from "@/lib/auth-context";
import {
  getDeviceContactsHashed,
  syncContactHashes,
  isPhoneNotVerified,
  widenContactAccess,
  type ContactAccess,
  type MatchedUser,
} from "@/lib/contacts";
import { followUser } from "@/lib/follows";
import { ensureInviteCode, inviteUrl } from "@/lib/invites";
import { shareText } from "@/lib/share";
import { SITE_ORIGIN } from "@/lib/site";

type MatchedRow = { contactName: string; user: MatchedUser };
type UnmatchedRow = { contactName: string };

// Everything "Find friends" does, without the screen around it.
//
// Extracted so the sign-up step and the Settings entry are the SAME screen
// rather than two that drift. Both halves of contact matching live here
// together on purpose: sharing your contacts finds people who saved their
// number, and saving your own number is what lets them find you. Neither
// works alone, so splitting them across two places was what produced 41
// accounts with neither.
type FindFriendsPanelProps = {
  // Hides the "let friends find you" prompt's section label during sign-up,
  // where the whole screen is already that question.
  compact?: boolean;
};

export function FindFriendsPanel({ compact = false }: FindFriendsPanelProps) {
  const { session, profile, refreshProfile } = useAuth();
  const [status, setStatus] = useState<
    "idle" | "loading" | "denied" | "loaded" | "error"
  >("idle");
  const [matched, setMatched] = useState<MatchedRow[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedRow[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<ContactAccess>("all");

  // Drives Apple's contact access button. Local to this screen and never
  // sent anywhere — iOS does the searching, against contacts this app
  // cannot read.
  const [contactSearch, setContactSearch] = useState("");
  const canShareOneContact = isInlineContactAccessAvailable();

  // The viewer's own durable invite link, minted on arrival rather than on
  // each press. Every invite sent from this screen used to be the sentence
  // "come check out Sightseer with me!" and nothing else — no link, so
  // nobody could follow it and no share could ever be attributed to anyone.
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    ensureInviteCode().then((minted) => {
      if (!cancelled) setInviteCode(minted);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Verified, not merely typed. The old field took a number on trust and
  // hashed it, so anybody could claim anybody's — harmless while nobody had
  // one, and not something to hand a beta.
  const isFindable = profile?.hashed_phone != null;

  async function handleSync() {
    setStatus("loading");
    setError(null);
    try {
      const result = await getDeviceContactsHashed();
      if (result === "denied") {
        setStatus("denied");
        return;
      }
      const { contacts, access: granted } = result;
      setAccess(granted);
      // sync rather than match: this both answers "who is here" and records
      // the phonebook, so that anyone on it who joins LATER can be announced.
      // Nothing but peppered hashes is stored — see sync_contact_hashes.
      const users = await syncContactHashes(contacts.map((c) => c.hash));
      const byHash = new Map(users.map((u) => [u.hashed_phone, u]));

      const matchedRows: MatchedRow[] = [];
      const unmatchedRows: UnmatchedRow[] = [];
      const seenUserIds = new Set<string>();
      for (const contact of contacts) {
        const user = byHash.get(contact.hash);
        if (user && !seenUserIds.has(user.id)) {
          seenUserIds.add(user.id);
          matchedRows.push({ contactName: contact.name, user });
        } else if (!user) {
          unmatchedRows.push({ contactName: contact.name });
        }
      }
      setMatched(matchedRows);
      setUnmatched(unmatchedRows);
      setStatus("loaded");
    } catch (err) {
      if (isPhoneNotVerified(err)) {
        // Not a failure so much as a precondition. The panel below already
        // explains it; an error line on top would just say it twice.
        setStatus("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not sync contacts.");
      setStatus("error");
    }
  }

  async function handleFollow(row: MatchedRow) {
    if (!session) return;
    try {
      await followUser({
        followerId: session.user.id,
        followeeId: row.user.id,
        followeeIsPrivate: row.user.is_private,
      });
      setFollowingIds((prev) => new Set(prev).add(row.user.id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not follow that person.",
      );
    }
  }

  function handleInvite(contactName: string) {
    // The link is the whole point of an invite. Without a code it falls back
    // to the bare site, which at least goes somewhere — but nothing sent that
    // way can be credited to anyone, so the minted code is the normal path.
    const url = inviteCode ? inviteUrl(inviteCode) : SITE_ORIGIN;
    const who = profile?.name ?? profile?.handle;
    const message = who
      ? `Hey ${contactName} - ${who} has invited you to join Sightseer. ${url}`
      : `Hey ${contactName}, come and see Sightseer. ${url}`;
    shareText(message).catch(() => {});
  }

  // iOS 18 lets somebody widen a limited grant from inside the app. Re-syncs
  // on success, because the newly-shared contacts are exactly the ones that
  // have not been checked yet.
  async function handleWidenAccess() {
    const added = await widenContactAccess();
    if (added) await handleSync();
  }

  // iOS tells us the visible contact set changed; it does not say what was
  // added. Re-syncing is the only way to find out, and it is cheap.
  //
  // Two ways to arrive here, and both should sync:
  //
  //  - the list is already on screen, so it is now out of date;
  //  - somebody is mid-search in the block below, which means the change
  //    almost certainly IS them sharing a contact. This is the case the
  //    block exists for, and requiring a prior sync would have left it
  //    doing nothing at all for the person who never granted access.
  //
  // What neither branch will do is fire on an untouched screen. The event
  // also arrives when contacts are edited in Apple's own app, and putting a
  // permission prompt in front of somebody because they renamed an entry
  // elsewhere would be the app acting entirely on its own.
  const isSearching = contactSearch.trim().length > 0;
  const handleAccessChanged = useCallback(() => {
    if (status !== "loaded" && !isSearching) return;
    void handleSync();
    // handleSync is redeclared every render but reads nothing it would go
    // stale on — only setters and module-level functions.
  }, [status, isSearching]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >

        {status === "idle" && (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Sightseer can check your contacts against people already using the
              app, and let you invite the ones who aren&apos;t. Your contacts
              never leave your device unhashed.
            </ThemedText>
            <Button label="Sync contacts" onPress={handleSync} />
          </>
        )}

        {status === "loading" && <PageLoader />}

        {status === "denied" && (
          <ThemedText type="small" themeColor="textSecondary">
            Contacts permission was denied. You can allow it from your
            device&apos;s system settings for Sightseer, then come back and try
            again.
          </ThemedText>
        )}

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        {/* Shown whatever the sync status is, because it is not about the
            sync. Someone who has just been told none of their contacts are
            here is exactly the person who should be asked whether their own
            friends can find THEM. */}
        {!isFindable && (
          <View style={styles.section}>
            {!compact && (
              <ThemedText type="sectionLabel">Verify your number</ThemedText>
            )}
            <PhoneVerify
              mode="link"
              caption="Checking your contacts needs a verified number, and it is what lets people who have yours find you. We text you a code. The number is scrambled before it is stored and never kept as a number."
              onVerified={() => {
                // Re-read the profile so hashed_phone lands, which is what
                // flips this block out of the way and unlocks the sync.
                void refreshProfile();
              }}
            />
          </View>
        )}

        {/* Said before the results, because it changes what the results
            mean. Under a limited grant this screen has only ever seen the
            handful of people who were shared with it, so "none of your
            contacts are on Sightseer" would be a claim about four people
            dressed up as a claim about the whole address book. */}
        {status === "loaded" && access === "limited" && (
          <View style={styles.section}>
            <ThemedText type="small" themeColor="textSecondary">
              You have shared only some of your contacts with Sightseer, so this
              list covers just those. You can share more without giving access
              to all of them.
            </ThemedText>
            <Button
              label="Choose more contacts"
              variant="secondary"
              onPress={() => void handleWidenAccess()}
            />
          </View>
        )}

        {/* Deliberately NOT gated on having synced, or on the permission
            having been granted, or refused. This is the way in for somebody
            who does not want to hand over an address book at all: they type a
            name, iOS finds it among contacts this app cannot see, and one tap
            shares that person and nobody else. On anything below iOS 18 the
            whole block renders nothing. */}
        {canShareOneContact && (
          <View style={styles.section}>
            <ThemedText type="sectionLabel">Find one person</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Search for someone by name and share just their contact, without giving Sightseer
              the rest.
            </ThemedText>
            <TextField
              placeholder="Search your contacts"
              value={contactSearch}
              onChangeText={setContactSearch}
              autoCapitalize="words"
              autoCorrect={false}
            />
            <InlineContactAccess query={contactSearch} onAccessChanged={handleAccessChanged} />
          </View>
        )}

        {status === "loaded" && (
          <>
            <View style={styles.section}>
              <ThemedText type="sectionLabel">Already on Sightseer</ThemedText>
              {matched.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  {/* The unqualified sentence is a claim about your whole
                      address book, and under a limited grant this screen has
                      not seen your whole address book. */}
                  {access === "limited"
                    ? "None of the contacts you shared are on Sightseer yet."
                    : "None of your contacts are on Sightseer yet."}
                </ThemedText>
              )}
              {matched.map((row) => (
                <Pressable
                  key={row.user.id}
                  onPress={() =>
                    router.push({
                      pathname: "/user/[id]",
                      params: { id: row.user.id },
                    })
                  }
                >
                  <ThemedView type="backgroundSelected" style={styles.row}>
                    <ThemedText type="default">
                      {row.user.name ?? row.user.handle ?? row.contactName}
                    </ThemedText>
                    <Pressable
                      onPress={() => handleFollow(row)}
                      disabled={followingIds.has(row.user.id)}
                      hitSlop={8}
                    >
                      <ThemedText
                        type="small"
                        themeColor={
                          followingIds.has(row.user.id)
                            ? "textSecondary"
                            : "sage"
                        }
                      >
                        {followingIds.has(row.user.id)
                          ? "Following ✓"
                          : "Follow"}
                      </ThemedText>
                    </Pressable>
                  </ThemedView>
                </Pressable>
              ))}
            </View>

            <View style={styles.section}>
              <ThemedText type="sectionLabel">Not on Sightseer yet</ThemedText>
              {unmatched.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  Everyone with a number matches an existing account.
                </ThemedText>
              )}
              {unmatched.map((row, index) => (
                <View key={`${row.contactName}-${index}`} style={styles.row}>
                  <ThemedText type="default">{row.contactName}</ThemedText>
                  <Pressable
                    onPress={() => handleInvite(row.contactName)}
                    hitSlop={8}
                  >
                    <ThemedText type="small" themeColor="sage">
                      Invite
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  body: {
    // Scrollable, which it never was: a phonebook of any real size ran off
    // the bottom of the screen with no way to reach the rest of it.
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
});
