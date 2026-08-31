import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { FeedCardHeaderText } from '@/components/feed-place-photo-block';
import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
import { LocationSearchModal } from '@/components/location-search-modal';
import { MAX_VISIT_PHOTOS, PhotoGrid } from '@/components/photo-grid';
import { PhotoCropModal, type CroppedPhoto } from '@/components/photo-crop-modal';
import { PhotoSourceModal } from '@/components/photo-source-modal';
import { SaveToBoard } from '@/components/save-to-board';
import { TripSuggestionPrompt } from '@/components/trip-suggestion-prompt';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getTripSuggestion, type TripSuggestion } from '@/lib/trips';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DateCarousel } from '@/components/ui/date-carousel';
import { RatingSliderWithPreview } from '@/components/ui/rating-slider-with-preview';
import { TextField } from '@/components/ui/text-field';
import { TagSticker } from '@/components/ui/tag-sticker';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import type { Database } from '@/lib/database.types';
import { deleteDraftPhoto, getDraftForEdit, publishDraft, updateDraftFields, uploadPhotoForDraft } from '@/lib/drafts';
import { pickImageFromLibrary, takePhotoWithCamera } from '@/lib/image-picker';
import { getPlaceBreadcrumb, resolveStateCountries } from '@/lib/places-cache';
import { extractDateFromExif } from '@/lib/photo-clustering';
import { uploadPhotoForVisit } from '@/lib/photo-upload';
import { searchUsers, type SearchUserResult } from '@/lib/search';
import { supabase } from '@/lib/supabase';
import { listTags, setVisitTags, MAX_VISIT_TAGS, type Tag } from '@/lib/visit-tags';
import { goBack } from '@/lib/navigation';

// Mirrors edit-visit/[id].tsx's own PhotoSlot pattern — needed only for
// resuming a draft, which (unlike a fresh review) can arrive with photos
// already uploaded. The fresh-review path below keeps its original
// pendingPhotos/uploadedPhotoUris pair untouched.
type PhotoSlot =
  | { kind: 'existing'; id: string; url: string; position: number }
  | { kind: 'new'; uri: string; width: number; height: number };

type CropTarget =
  | { kind: 'pending' }
  | { kind: 'pending-recrop'; index: number }
  | { kind: 'after-save' }
  | { kind: 'draft-new' }
  | { kind: 'draft-recrop'; index: number };

// Swaps the item at `index` with its neighbor in `direction` — used by both
// photo-order controls below (pendingPhotos and photoSlots), which need
// identical swap semantics but operate on differently-shaped arrays.
function swapAdjacent<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

const DEBOUNCE_MS = 300;

type PlaceRow = Database['public']['Tables']['places']['Row'];
type UserRow = Database['public']['Tables']['users']['Row'];

// Local date, not toISOString() (which is UTC and rolls over to "tomorrow"
// in the evening for any timezone behind UTC).
function todayIsoDate(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function ReviewFormScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const { placeId, draftId } = useLocalSearchParams<{ placeId?: string; draftId?: string }>();
  const bottomInset = useBottomTabInset();
  const [error, setError] = useState<string | null>(null);
  // Arriving fresh (no placeId already picked, e.g. place/[id].tsx's "Add
  // your review") goes straight to the map instead of requiring an extra tap
  // on "Search for a place" first — that button/label still render as a
  // fallback (and a way to change the place later) once the picker's closed.
  // A draftId arrival doesn't auto-open either way — the draft-load effect
  // below decides, once it knows whether that draft already has a place.
  const [isPickerOpen, setIsPickerOpen] = useState(!placeId && !draftId);
  const scrollHandler = useHideOnScrollHandler();

  // Set once a draft has been loaded (or once one's been published this
  // session, back to null — see handleSaveVisit) — gates which photo model
  // and which button label render, and whether handlePlaceSelected resets
  // the rest of the form.
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(draftId ?? null);
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);

  const [selectedPlace, setSelectedPlace] = useState<PlaceRow | null>(null);
  const [breadcrumb, setBreadcrumb] = useState('');
  // "State, Country" — same `resolveStateCountries` RPC the real feed uses
  // (feed.ts's mapRawFeedVisit), not derived from `breadcrumb` above (a
  // different, full `>`-joined hierarchy string for the "Place" section),
  // so the Preview card's location line matches the feed's own formatting
  // exactly instead of just looking similar.
  const [previewStateCountry, setPreviewStateCountry] = useState<string | null>(null);
  // null = no score set yet — see rating-slider.tsx's own comment. Replaces
  // the earlier separate "add without reviewing" button: saving with this
  // still null just logs a plain visit with no rating attached.
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [visitedOn, setVisitedOn] = useState(todayIsoDate());
  const [isSavingVisit, setIsSavingVisit] = useState(false);
  const [savedVisitId, setSavedVisitId] = useState<string | null>(null);

  const [pendingPhotos, setPendingPhotos] = useState<CroppedPhoto[]>([]);
  const [uploadedPhotoUris, setUploadedPhotoUris] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [cropSource, setCropSource] = useState<{ uri: string; target: CropTarget } | null>(null);
  const [isPhotoSourceModalOpen, setIsPhotoSourceModalOpen] = useState(false);

  // Tag-specific-spots now goes through the same map picker as the review's
  // own place (LocationSearchModal), not a separate text-only autocomplete
  // list — see handleTagPlaceSelected below.
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [taggedPlaces, setTaggedPlaces] = useState<PlaceRow[]>([]);

  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleSuggestions, setPeopleSuggestions] = useState<SearchUserResult[]>([]);
  const [peopleAvatarUrls, setPeopleAvatarUrls] = useState<Record<string, string>>({});
  const [taggedUsers, setTaggedUsers] = useState<UserRow[]>([]);
  const [tagVocabulary, setTagVocabulary] = useState<Tag[]>([]);
  const [selectedTagSlugs, setSelectedTagSlugs] = useState<string[]>([]);

  const peopleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (peopleDebounceRef.current) clearTimeout(peopleDebounceRef.current);
    if (!session) return;

    if (!peopleQuery.trim()) {
      setPeopleSuggestions([]);
      return;
    }

    peopleDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchUsers(peopleQuery, session.user.id);
        setPeopleSuggestions(results);
        setPeopleAvatarUrls(results.length > 0 ? await getAvatarViewUrls(results.map((u) => u.id)) : {});
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed.');
      }
    }, DEBOUNCE_MS);

    return () => {
      if (peopleDebounceRef.current) clearTimeout(peopleDebounceRef.current);
    };
  }, [peopleQuery, session]);

  useEffect(() => {
    if (!selectedPlace) {
      setPreviewStateCountry(null);
      return;
    }
    let cancelled = false;
    resolveStateCountries([selectedPlace.id])
      .then((map) => {
        if (!cancelled) setPreviewStateCountry(map.get(selectedPlace.id) ?? null);
      })
      .catch(() => {
        if (!cancelled) setPreviewStateCountry(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPlace]);

  // LocationSearchModal already runs the fetchPlaceDetails/cachePlaceHierarchy
  // steps internally (see its onSelect) before handing back the final
  // PlaceRow — this just resets the rest of the review form for it.
  // Best-effort: an empty vocabulary just means no tag picker, never a
  // review that can't be written.
  useEffect(() => {
    listTags()
      .then(setTagVocabulary)
      .catch(() => setTagVocabulary([]));
  }, []);

  function handleToggleTag(slug: string) {
    setSelectedTagSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      // Silently ignoring the tap past the limit would look broken; the
      // picker dims unpicked tags once full, so this only guards the race.
      if (prev.length >= MAX_VISIT_TAGS) return prev;
      return [...prev, slug];
    });
  }

  async function handlePlaceSelected(place: PlaceRow) {
    setError(null);
    setIsPickerOpen(false);
    try {
      const crumb = await getPlaceBreadcrumb(place);
      setSelectedPlace(place);
      setBreadcrumb(crumb);
      // Resuming a draft: this might just be correcting an auto-picked
      // place (or resolving a "needs a location" one) — keep whatever
      // rating/note/photos/tags the draft already has instead of wiping
      // them like a genuinely fresh place pick does below.
      if (currentDraftId) return;
      setRating(null);
      setNote('');
      setVisitedOn(todayIsoDate());
      setSavedVisitId(null);
      setPendingPhotos([]);
      setUploadedPhotoUris([]);
      setTaggedPlaces([]);
      setPeopleQuery('');
      setPeopleSuggestions([]);
      setTaggedUsers([]);
      setSelectedTagSlugs([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that place.');
    }
  }

  // Cancelling the picker before ever picking a place means there's nothing
  // left on this screen worth seeing (no "Search places" fallback page
  // anymore, see isPickerOpen's own comment) — go back to wherever this
  // screen was pushed from (the Create menu, or place/[id]'s "Add your
  // review") instead of leaving the user on a blank review form. Once a
  // place IS selected, reopening the picker to change it and then cancelling
  // should just close it back to the filled-in form, not navigate away.
  function handlePickerCancel() {
    setIsPickerOpen(false);
    if (!selectedPlace) goBack();
  }

  // Arriving from place/[id]'s "Add your review" button — the place is
  // already in our DB (no Google Places round-trip needed), so this skips
  // straight past LocationSearchModal into the same reset handlePlaceSelected
  // already does for a normal search-picked place.
  useEffect(() => {
    if (!placeId) return;
    (async () => {
      const { data, error: fetchError } = await supabase.from('places').select('*').eq('id', placeId).single();
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      await handlePlaceSelected(data);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  // Arriving from drafts.tsx to resume an unfinished review. Seeds every
  // field the draft already has; a place-less draft ("Needs a location")
  // forces the picker open immediately instead of showing a blank form with
  // no way to reach it (mirrors the fresh-arrival isPickerOpen behavior).
  useEffect(() => {
    if (!draftId || !session) return;
    (async () => {
      try {
        const draft = await getDraftForEdit(draftId, session.user.id);
        if (!draft) {
          setError('This draft is no longer available.');
          return;
        }
        setCurrentDraftId(draft.id);
        setRating(draft.rating);
        setNote(draft.note ?? '');
        setVisitedOn(draft.visitedOn);
        setPhotoSlots(draft.photos.map((p) => ({ kind: 'existing', id: p.id, url: p.url, position: p.position })));
        if (draft.place) {
          setSelectedPlace(draft.place);
          setBreadcrumb(await getPlaceBreadcrumb(draft.place));
        } else {
          setIsPickerOpen(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load that draft.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, session]);

  // LocationSearchModal already runs fetchPlaceDetails/cachePlaceHierarchy
  // internally (see its onSelect) before handing back the final PlaceRow —
  // same as the review's own place picker (handlePlaceSelected above), just
  // appending to taggedPlaces instead of replacing selectedPlace.
  function handleTagPlaceSelected(place: PlaceRow) {
    setIsTagPickerOpen(false);
    setTaggedPlaces((prev) => {
      if (place.id === selectedPlace?.id || prev.some((p) => p.id === place.id)) return prev;
      return [...prev, place];
    });
  }

  function handleRemoveTag(placeId: string) {
    setTaggedPlaces((prev) => prev.filter((p) => p.id !== placeId));
  }

  function handleSelectPerson(user: UserRow) {
    setTaggedUsers((prev) => (prev.some((u) => u.id === user.id) ? prev : [...prev, user]));
    setPeopleQuery('');
    setPeopleSuggestions([]);
  }

  function handleRemovePerson(userId: string) {
    setTaggedUsers((prev) => prev.filter((u) => u.id !== userId));
  }

  function handleRemovePendingPhoto(index: number) {
    setPendingPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function handleRecropPendingPhoto(index: number) {
    setCropSource({ uri: pendingPhotos[index].uri, target: { kind: 'pending-recrop', index } });
  }

  function handleMovePendingPhoto(index: number, direction: -1 | 1) {
    setPendingPhotos((prev) => swapAdjacent(prev, index, direction));
  }

  function handleMoveDraftSlot(index: number, direction: -1 | 1) {
    setPhotoSlots((prev) => swapAdjacent(prev, index, direction));
  }

  // Every caller below still just does `const asset = await pickImage()` —
  // unchanged from before the camera option existed. What changed is
  // internal: instead of going straight to the library, this now opens
  // PhotoSourceModal and waits for a source choice, resolving the very
  // same promise once handlePhotoSourceChoice (or a cancel) actually picks
  // one — a manual resolver via ref, since the choice arrives later from a
  // separate event handler, not synchronously within this function.
  const pickImageResolveRef = useRef<((asset: ImagePicker.ImagePickerAsset | null) => void) | null>(null);

  function pickImage(): Promise<ImagePicker.ImagePickerAsset | null> {
    return new Promise((resolve) => {
      pickImageResolveRef.current = resolve;
      setIsPhotoSourceModalOpen(true);
    });
  }

  async function handlePhotoSourceChoice(source: 'camera' | 'library') {
    setIsPhotoSourceModalOpen(false);
    // exif:true — see handlePickPhoto/handleAddDraftPhoto below, which read
    // the photo's own taken-date off this to back-fill the visit date.
    const result =
      source === 'camera' ? await takePhotoWithCamera({ exif: true }) : await pickImageFromLibrary({ exif: true });
    if (result === 'denied') {
      setError(
        source === 'camera'
          ? 'Camera permission is required to take photos.'
          : 'Photo library permission is required to add photos.'
      );
      pickImageResolveRef.current?.(null);
    } else {
      pickImageResolveRef.current?.(result);
    }
    pickImageResolveRef.current = null;
  }

  function handlePhotoSourceCancel() {
    setIsPhotoSourceModalOpen(false);
    pickImageResolveRef.current?.(null);
    pickImageResolveRef.current = null;
  }

  async function handlePickPhoto() {
    if (pendingPhotos.length + uploadedPhotoUris.length >= MAX_VISIT_PHOTOS) return;
    setError(null);
    // First photo on the review only — back-fills the date to when the
    // photo was actually taken (matches bulk-upload's own per-cluster date
    // choice) rather than leaving it defaulted to today. Still just a
    // starting point: DateCarousel below stays freely editable after this,
    // and adding a *second* photo never overwrites whatever's there by then.
    const isFirstPhoto = pendingPhotos.length === 0 && uploadedPhotoUris.length === 0;
    const asset = await pickImage();
    if (!asset) return;
    if (isFirstPhoto) {
      const takenOn = extractDateFromExif(asset.exif);
      if (takenOn) setVisitedOn(takenOn);
    }
    setCropSource({ uri: asset.uri, target: { kind: 'pending' } });
  }

  async function handleAddPhotoAfterSave() {
    if (!savedVisitId || uploadedPhotoUris.length >= MAX_VISIT_PHOTOS) return;
    setError(null);
    const asset = await pickImage();
    if (asset) setCropSource({ uri: asset.uri, target: { kind: 'after-save' } });
  }

  // Draft-resume photo handling — mirrors edit-visit/[id].tsx's
  // handleAddPhoto/handleRecropSlot/handleRemoveSlot exactly.
  async function handleAddDraftPhoto() {
    if (photoSlots.length >= MAX_VISIT_PHOTOS) return;
    setError(null);
    // See handlePickPhoto's identical comment — same first-photo-only
    // back-fill, just against this flow's own photoSlots list instead.
    const isFirstPhoto = photoSlots.length === 0;
    const asset = await pickImage();
    if (!asset) return;
    if (isFirstPhoto) {
      const takenOn = extractDateFromExif(asset.exif);
      if (takenOn) setVisitedOn(takenOn);
    }
    setCropSource({ uri: asset.uri, target: { kind: 'draft-new' } });
  }

  function handleRecropDraftSlot(index: number) {
    const slot = photoSlots[index];
    setCropSource({ uri: slot.kind === 'existing' ? slot.url : slot.uri, target: { kind: 'draft-recrop', index } });
  }

  function handleRemoveDraftSlot(index: number) {
    const slot = photoSlots[index];
    if (slot.kind === 'existing') setDeletedPhotoIds((prev) => [...prev, slot.id]);
    setPhotoSlots((prev) => prev.filter((_, i) => i !== index));
  }

  function handleCropCancel() {
    setCropSource(null);
  }

  async function handleCropConfirm(result: CroppedPhoto) {
    const target = cropSource?.target;
    setCropSource(null);
    if (!target) return;

    if (target.kind === 'pending') {
      setPendingPhotos((prev) => [...prev, result]);
      return;
    }

    if (target.kind === 'pending-recrop') {
      const recropIndex = target.index;
      setPendingPhotos((prev) => prev.map((photo, i) => (i === recropIndex ? result : photo)));
      return;
    }

    if (target.kind === 'after-save' && savedVisitId) {
      setIsUploadingPhoto(true);
      try {
        await uploadPhotoForVisit({
          visitId: savedVisitId,
          uri: result.uri,
          mimeType: 'image/jpeg',
          width: result.width,
          height: result.height,
          position: uploadedPhotoUris.length,
        });
        setUploadedPhotoUris((prev) => [...prev, result.uri]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not upload that photo.');
      } finally {
        setIsUploadingPhoto(false);
      }
      return;
    }

    const newSlot: PhotoSlot = { kind: 'new', uri: result.uri, width: result.width, height: result.height };

    if (target.kind === 'draft-new') {
      setPhotoSlots((prev) => [...prev, newSlot]);
      return;
    }

    if (target.kind === 'draft-recrop') {
      const recropIndex = target.index;
      setPhotoSlots((prev) => {
        const existingSlot = prev[recropIndex];
        if (existingSlot.kind === 'existing') setDeletedPhotoIds((ids) => [...ids, existingSlot.id]);
        return prev.map((slot, i) => (i === recropIndex ? newSlot : slot));
      });
    }
  }

  // Offered right after publishing, when this review completes a cluster
  // that reads like a trip — see getTripSuggestion for the 2-vs-3 rule.
  const [tripSuggestion, setTripSuggestion] = useState<TripSuggestion | null>(null);

  async function handleSaveVisit() {
    if (!session || !selectedPlace) return;
    setError(null);
    setIsSavingVisit(true);
    const isPublishingDraft = currentDraftId != null;
    try {
      let visitId: string;

      if (isPublishingDraft && currentDraftId) {
        await updateDraftFields(currentDraftId, {
          placeId: selectedPlace.id,
          rating,
          note: note.trim() || null,
          visitedOn,
        });

        for (const photoId of deletedPhotoIds) {
          await deleteDraftPhoto(photoId);
        }

        // New photos are appended after every kept existing photo's own
        // position — matches edit-visit/[id].tsx's identical position math.
        const maxExistingPosition = photoSlots.reduce(
          (max, slot) => (slot.kind === 'existing' ? Math.max(max, slot.position) : max),
          -1
        );
        let nextPosition = maxExistingPosition + 1;
        for (const slot of photoSlots) {
          if (slot.kind !== 'new') continue;
          await uploadPhotoForDraft({
            draftId: currentDraftId,
            uri: slot.uri,
            mimeType: 'image/jpeg',
            width: slot.width,
            height: slot.height,
            position: nextPosition,
          });
          nextPosition += 1;
        }

        visitId = await publishDraft(currentDraftId);
        setUploadedPhotoUris([
          ...photoSlots.filter((slot) => slot.kind === 'existing').map((slot) => slot.url),
          ...photoSlots.filter((slot) => slot.kind === 'new').map((slot) => slot.uri),
        ]);
        setCurrentDraftId(null);
      } else {
        const { data, error: insertError } = await supabase
          .from('visits')
          .insert({
            user_id: session.user.id,
            place_id: selectedPlace.id,
            rating,
            note: note.trim() || null,
            visited_on: visitedOn,
          })
          .select()
          .single();
        if (insertError) throw insertError;
        visitId = data.id;
      }

      setSavedVisitId(visitId);

      // Does this review complete a day that reads like a trip? Best-effort
      // and deliberately after the visit itself is safely saved — a failure
      // here must never make a successful publish look like it failed.
      if (session) {
        getTripSuggestion(session.user.id, visitedOn)
          .then(setTripSuggestion)
          .catch(() => setTripSuggestion(null));
      }

      if (taggedPlaces.length > 0) {
        await supabase
          .from('visit_tagged_places')
          .insert(taggedPlaces.map((place) => ({ visit_id: visitId, place_id: place.id })));
      }

      if (taggedUsers.length > 0) {
        await supabase
          .from('visit_tagged_users')
          .insert(taggedUsers.map((user) => ({ visit_id: visitId, user_id: user.id })));
      }

      if (selectedTagSlugs.length > 0) {
        await setVisitTags(visitId, selectedTagSlugs);
      }

      // The draft path already uploaded its new photo slots above, before
      // publish_draft ran — only the fresh-review path still has photos
      // waiting to go up.
      if (!isPublishingDraft) {
        const stillPending: CroppedPhoto[] = [];
        for (const [index, asset] of pendingPhotos.entries()) {
          try {
            await uploadPhotoForVisit({
              visitId,
              uri: asset.uri,
              mimeType: 'image/jpeg',
              width: asset.width,
              height: asset.height,
              position: index,
            });
            setUploadedPhotoUris((prev) => [...prev, asset.uri]);
          } catch {
            stillPending.push(asset);
          }
        }
        setPendingPhotos(stillPending);
        if (stillPending.length > 0) {
          setError(`Visit saved, but ${stillPending.length} photo(s) failed to upload — try again below.`);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isPublishingDraft ? 'Could not publish that draft.' : 'Could not save that visit.');
    } finally {
      setIsSavingVisit(false);
    }
  }

  const totalPhotoCount = pendingPhotos.length + uploadedPhotoUris.length;

  // Whichever photo model is currently active (draft slots vs. a fresh
  // review's pending/uploaded pair) reduced to the same {url, aspectRatio}
  // shape PhotoGrid itself wants — same component, same props shape as
  // (tabs)/index.tsx's real feed card, so reordering/recropping above shows
  // up here exactly as it will once posted, not as a guess at how it'll
  // look. Existing (already-uploaded) photos have no width/height on hand
  // here, so their aspect ratio is unknown (null, PhotoGrid's own
  // documented fallback) rather than assumed square.
  const previewPhotos: { url: string; aspectRatio: number | null }[] = currentDraftId
    ? photoSlots.map((slot) =>
        slot.kind === 'existing'
          ? { url: slot.url, aspectRatio: null }
          : { url: slot.uri, aspectRatio: slot.width / slot.height }
      )
    : [
        ...pendingPhotos.map((p) => ({ url: p.uri, aspectRatio: p.width / p.height })),
        ...uploadedPhotoUris.map((url) => ({ url, aspectRatio: null })),
      ];

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <BackLink seed="review-form" />
          <ThemedText type="displaySerif">{draftId ? 'Finish draft' : 'Add a review'}</ThemedText>
        </View>

        <KeyboardAwareScroll
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        <View style={styles.box}>
          <ThemedText type="sectionLabel">Place</ThemedText>

          {selectedPlace ? (
            <Pressable onPress={() => setIsPickerOpen(true)} style={styles.placeRow}>
              <View style={styles.placeRowText}>
                <ThemedText type="smallBold">{selectedPlace.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {breadcrumb}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Change
              </ThemedText>
            </Pressable>
          ) : (
            <Button label="Search for a place" variant="secondary" onPress={() => setIsPickerOpen(true)} />
          )}

          {selectedPlace && !savedVisitId && (
            <View style={styles.section}>
              <ThemedText type="sectionLabel">Tag specific spots (optional)</ThemedText>
              {taggedPlaces.length > 0 && (
                <View style={styles.tagRow}>
                  {taggedPlaces.map((place) => (
                    <Pressable key={place.id} onPress={() => handleRemoveTag(place.id)}>
                      <ThemedView type="backgroundSelected" style={styles.tagChip}>
                        <ThemedText type="small">{place.name} ✕</ThemedText>
                      </ThemedView>
                    </Pressable>
                  ))}
                </View>
              )}
              <Button label="Search for a spot" variant="secondary" onPress={() => setIsTagPickerOpen(true)} />
            </View>
          )}
        </View>

        {selectedPlace &&
          (!savedVisitId ? (
            <View style={styles.box}>
              <View style={styles.section}>
                <View style={styles.row}>
                  <ThemedText type="sectionLabel">Rating</ThemedText>
                  {rating != null && (
                    <Pressable onPress={() => setRating(null)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Remove rating
                      </ThemedText>
                    </Pressable>
                  )}
                </View>
                <RatingSliderWithPreview value={rating} onChange={setRating} />
              </View>

              <View style={styles.section}>
                <ThemedText type="sectionLabel">Photos</ThemedText>
                {currentDraftId ? (
                  <>
                    {photoSlots.length > 0 && (
                      <View style={styles.photoRow}>
                        {photoSlots.map((slot, index) => (
                          <View key={slot.kind === 'existing' ? slot.id : slot.uri} style={styles.photoTile}>
                            <Pressable onPress={() => handleRecropDraftSlot(index)}>
                              <Image source={{ uri: slot.kind === 'existing' ? slot.url : slot.uri }} style={styles.photoThumbnail} />
                            </Pressable>
                            <Pressable
                              onPress={() => handleRemoveDraftSlot(index)}
                              hitSlop={8}
                              style={[styles.removeBadge, { backgroundColor: theme.background }]}>
                              <Ionicons name="close" size={14} color={theme.text} />
                            </Pressable>
                            <View style={styles.reorderRow}>
                              <Pressable
                                onPress={() => handleMoveDraftSlot(index, -1)}
                                disabled={index === 0}
                                hitSlop={6}
                                style={[styles.reorderBadge, { backgroundColor: theme.background }, index === 0 && styles.reorderBadgeDisabled]}>
                                <Ionicons name="chevron-back" size={12} color={theme.text} />
                              </Pressable>
                              <Pressable
                                onPress={() => handleMoveDraftSlot(index, 1)}
                                disabled={index === photoSlots.length - 1}
                                hitSlop={6}
                                style={[
                                  styles.reorderBadge,
                                  { backgroundColor: theme.background },
                                  index === photoSlots.length - 1 && styles.reorderBadgeDisabled,
                                ]}>
                                <Ionicons name="chevron-forward" size={12} color={theme.text} />
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                    {photoSlots.length < MAX_VISIT_PHOTOS && (
                      <Button
                        label={`Add photo (${photoSlots.length}/${MAX_VISIT_PHOTOS})`}
                        variant="secondary"
                        onPress={handleAddDraftPhoto}
                      />
                    )}
                    {photoSlots.length > 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        Tap a photo to recrop it, or use the arrows to reorder.
                      </ThemedText>
                    )}
                  </>
                ) : (
                  <>
                    {(pendingPhotos.length > 0 || uploadedPhotoUris.length > 0) && (
                      <View style={styles.photoRow}>
                        {pendingPhotos.map((asset, index) => (
                          <View key={asset.uri} style={styles.photoTile}>
                            <Pressable onPress={() => handleRecropPendingPhoto(index)}>
                              <Image source={{ uri: asset.uri }} style={styles.photoThumbnail} />
                            </Pressable>
                            <Pressable
                              onPress={() => handleRemovePendingPhoto(index)}
                              hitSlop={8}
                              style={[styles.removeBadge, { backgroundColor: theme.background }]}>
                              <Ionicons name="close" size={14} color={theme.text} />
                            </Pressable>
                            <View style={styles.reorderRow}>
                              <Pressable
                                onPress={() => handleMovePendingPhoto(index, -1)}
                                disabled={index === 0}
                                hitSlop={6}
                                style={[styles.reorderBadge, { backgroundColor: theme.background }, index === 0 && styles.reorderBadgeDisabled]}>
                                <Ionicons name="chevron-back" size={12} color={theme.text} />
                              </Pressable>
                              <Pressable
                                onPress={() => handleMovePendingPhoto(index, 1)}
                                disabled={index === pendingPhotos.length - 1}
                                hitSlop={6}
                                style={[
                                  styles.reorderBadge,
                                  { backgroundColor: theme.background },
                                  index === pendingPhotos.length - 1 && styles.reorderBadgeDisabled,
                                ]}>
                                <Ionicons name="chevron-forward" size={12} color={theme.text} />
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                    {totalPhotoCount < MAX_VISIT_PHOTOS && (
                      <Button
                        label={`Add photo (${totalPhotoCount}/${MAX_VISIT_PHOTOS})`}
                        variant="secondary"
                        onPress={handlePickPhoto}
                      />
                    )}
                    {pendingPhotos.length > 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        Tap a photo to recrop it, or use the arrows to reorder.
                      </ThemedText>
                    )}
                  </>
                )}
              </View>

              <View style={styles.section}>
                <ThemedText type="sectionLabel">Review</ThemedText>
                <TextField
                  placeholder="Review (optional)"
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
              </View>

              {tagVocabulary.length > 0 && (
                <View style={styles.section}>
                  <ThemedText type="sectionLabel">
                    Tags (up to {MAX_VISIT_TAGS})
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    What was this place good for? These are how other people
                    find it.
                  </ThemedText>
                  <View style={styles.tagRow}>
                    {tagVocabulary.map((tag) => {
                      const isSelected = selectedTagSlugs.includes(tag.slug);
                      // Once three are picked the rest dim rather than
                      // disappear — a picker that reflows as you use it
                      // makes the next tap land on the wrong thing.
                      const isDisabled = !isSelected && selectedTagSlugs.length >= MAX_VISIT_TAGS;
                      return (
                        <Pressable
                          key={tag.slug}
                          onPress={() => handleToggleTag(tag.slug)}
                          disabled={isDisabled}
                          style={isDisabled ? styles.tagOptionDisabled : undefined}>
                          {isSelected ? (
                            // Picked tags show as the sticker they'll
                            // actually be on the review, so the picker is a
                            // preview rather than a separate vocabulary of
                            // its own.
                            <TagSticker slug={tag.slug} label={tag.label} />
                          ) : (
                            <ThemedView type="backgroundElement" style={styles.tagChip}>
                              <ThemedText type="small" themeColor="textSecondary">
                                {tag.label}
                              </ThemedText>
                            </ThemedView>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={styles.section}>
                <ThemedText type="sectionLabel">Date visited</ThemedText>
                <DateCarousel value={visitedOn} onChange={setVisitedOn} />
              </View>

              <View style={styles.section}>
                <ThemedText type="sectionLabel">Tag people (optional)</ThemedText>
                {taggedUsers.length > 0 && (
                  <View style={styles.tagRow}>
                    {taggedUsers.map((user) => (
                      <Pressable key={user.id} onPress={() => handleRemovePerson(user.id)}>
                        <ThemedView type="backgroundSelected" style={styles.tagChip}>
                          <ThemedText type="small">
                            {user.name ?? user.handle ?? 'Someone'} ✕
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    ))}
                  </View>
                )}
                <TextField
                  placeholder="Search by name or username..."
                  value={peopleQuery}
                  onChangeText={setPeopleQuery}
                />
                {peopleSuggestions.map((user) => (
                  <Pressable key={user.id} onPress={() => handleSelectPerson(user)}>
                    <ThemedView type="backgroundSelected" style={styles.peopleSuggestionRow}>
                      <Avatar uri={peopleAvatarUrls[user.id]} name={user.name ?? user.handle} size={36} />
                      <View style={styles.peopleSuggestionInfo}>
                        <ThemedText type="small">{user.name ?? user.handle ?? 'Someone'}</ThemedText>
                        {user.handle && (
                          <ThemedText type="small" themeColor="textSecondary">
                            @{user.handle}
                          </ThemedText>
                        )}
                      </View>
                    </ThemedView>
                  </Pressable>
                ))}
              </View>

              <View style={styles.section}>
                <ThemedText type="sectionLabel">Preview</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  How this will look on the feed.
                </ThemedText>
                <ThemedView type="backgroundElement" style={styles.previewCard}>
                  <FeedCardHeaderText
                    placeName={selectedPlace.name}
                    placeId={selectedPlace.id}
                    stateCountry={previewStateCountry}
                    taggedPlaces={taggedPlaces}
                    visitedLine={[rating == null ? 'Visited' : null, note || null].filter(Boolean).join(' · ')}
                    rating={rating}
                    stampSeed={currentDraftId ?? selectedPlace.id}
                    stampCanSeep={previewPhotos.length > 0}
                  />
                  {previewPhotos.length > 0 && (
                    <PhotoGrid
                      urls={previewPhotos.map((p) => p.url)}
                      aspectRatios={previewPhotos.map((p) => p.aspectRatio)}
                    />
                  )}
                </ThemedView>
              </View>

              <Button
                label={currentDraftId ? 'Publish' : 'Save visit'}
                onPress={handleSaveVisit}
                loading={isSavingVisit}
              />
            </View>
          ) : (
            <View style={styles.box}>
              <ThemedText type="small">Visit saved.</ThemedText>

              {uploadedPhotoUris.length > 0 && (
                <View style={styles.photoRow}>
                  {uploadedPhotoUris.map((uri) => (
                    <Image key={uri} source={{ uri }} style={styles.photoThumbnail} />
                  ))}
                </View>
              )}

              {uploadedPhotoUris.length < MAX_VISIT_PHOTOS && (
                <Button
                  label={`Add photo (${uploadedPhotoUris.length}/${MAX_VISIT_PHOTOS})`}
                  variant="secondary"
                  onPress={handleAddPhotoAfterSave}
                  loading={isUploadingPhoto}
                />
              )}

              {tripSuggestion && session && (
                <TripSuggestionPrompt
                  userId={session.user.id}
                  suggestion={tripSuggestion}
                  onResolved={() => setTripSuggestion(null)}
                />
              )}

              <SaveToBoard visitId={savedVisitId} isOwnerOrTagged />

              {/* goBack() (not a fixed destination) is what makes "back
                  to your remaining drafts after a bulk upload" fall out for
                  free: a draft was reached by pushing this screen ON TOP of
                  /drafts (see drafts.tsx's own row onPress), so popping back
                  lands there again, and that screen's own useFocusEffect
                  reloads its list — now one shorter — on the way back in. A
                  fresh (non-draft) review pops back to wherever it was
                  started from instead, same as this screen's own header
                  back button already does. */}
              <Button label="Done" onPress={() => goBack()} />
            </View>
          ))}

        </KeyboardAwareScroll>

        <PhotoCropModal
          visible={cropSource != null}
          uri={cropSource?.uri ?? null}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
          allowRatioSelection
        />
        <LocationSearchModal
          visible={isPickerOpen}
          onCancel={handlePickerCancel}
          onSelect={handlePlaceSelected}
        />
        <LocationSearchModal
          visible={isTagPickerOpen}
          onCancel={() => setIsTagPickerOpen(false)}
          onSelect={handleTagPlaceSelected}
          initialCenter={
            selectedPlace?.lat != null && selectedPlace?.lng != null
              ? { lat: selectedPlace.lat, lng: selectedPlace.lng }
              : undefined
          }
        />

        <PhotoSourceModal
          visible={isPhotoSourceModalOpen}
          onCancel={handlePhotoSourceCancel}
          onPickCamera={() => handlePhotoSourceChoice('camera')}
          onPickLibrary={() => handlePhotoSourceChoice('library')}
        />
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
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.two,
  },
  scrollContent: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  suggestionRow: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.half,
  },
  // Matches prompt-question-picker.tsx's own `box` — the same bordered,
  // rounded container language used for "create prompt", so this screen
  // (review-form) reads as part of the same visual system instead of the
  // plain flat `backgroundElement` fills it used before.
  box: {
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.35)',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  // A contained mockup, not a literal edge-to-edge reproduction of the real
  // feed card — the real card's photos deliberately bleed past its own
  // rounded corners to the screen edges (see (tabs)/index.tsx's
  // photoBreakout), which only makes sense as that screen's outermost
  // element, not a section nested inside this form's own bordered box.
  // FeedCardHeaderText and PhotoGrid inside are the same components/props
  // the real card uses, so content (place name, rating, tagged spots,
  // photo crops/order) matches exactly — only this outer wrapping differs.
  previewCard: {
    position: 'relative',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  placeRowText: {
    flex: 1,
    gap: Spacing.half,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  photoThumbnail: {
    width: 64,
    height: 64,
    borderRadius: Spacing.two,
  },
  photoTile: {
    width: 64,
    height: 64,
  },
  reorderRow: {
    position: 'absolute',
    bottom: -6,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reorderBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBadgeDisabled: {
    opacity: 0.3,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  // Tag-people suggestions specifically — an avatar-led row (name over
  // @handle), unlike the plain-text suggestionRow place suggestions use.
  peopleSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  peopleSuggestionInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  // Dimmed rather than hidden once the limit is reached — see the picker.
  tagOptionDisabled: {
    opacity: 0.4,
  },
  tagChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
});
