const timestamp = new Date().toISOString();
const exampleUrl = (tags) =>
  `https://archiveofourown.org/works?work_search%5Bother_tag_names%5D=${encodeURIComponent(tags)}`;

const state = {
  syncing: false,
  trackedCount: 12,
  lastSyncedAt: timestamp,
  lastSyncError: null,
  currentWork: {
    workId: 1,
    chapterId: 1,
    title: "The Lighthouse Letters",
    author: "Example Author",
    progressPercent: 64,
    lastReadAt: timestamp,
  },
  savedSearches: [
    {
      id: "weekend",
      name: "A little weekend escapism",
      url: exampleUrl("Adventure,Found Family,Happy Ending"),
    },
    { id: "comfort", name: "Comfort reads", url: exampleUrl("Fluff,Friendship,Slice of Life") },
    { id: "mystery", name: "One more chapter", url: exampleUrl("Mystery,Slow Burn") },
  ],
};

export const authClient = {
  useSession: () => ({ data: { user: { name: "Example Reader" } }, isPending: false }),
};

export function usePopupState() {
  return { state, loading: false, dispatch: async () => ({ ok: true, state }) };
}
