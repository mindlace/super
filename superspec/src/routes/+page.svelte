<script lang="ts">
  import { onMount } from 'svelte';
  import TabStrip from '$lib/components/TabStrip.svelte';
  import DocPane from '$lib/components/DocPane.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import type { SpecEntry } from '$lib/types';
  import { DAY_MS } from '$lib/recency';
  import { pairAndGroup, type DisplayGroup } from '$lib/pairing';
  import { findSelectedGroup, groupToPromote } from '$lib/openTabs';
  import { retryDelay } from '$lib/backoff';

  let specs = $state<SpecEntry[]>([]);
  let selectedPath = $state<string | null>(null);
  let lastSelectedGroup = $state<DisplayGroup | null>(null);
  let specsLoaded = $state(false);
  let content = $state('');
  let knownMtime = $state(0);

  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  const visibleGroups = $derived(
    pairAndGroup(specs).filter((g) => g.updated >= Date.now() - DAY_MS)
  );

  let openedGroups = $state<DisplayGroup[]>([]);

  const OPENED_KEY = 'sr:openedPaths';

  const visiblePaths = $derived(new Set(visibleGroups.map((g) => g.parent.path)));
  // Drop opened groups already shown by discovery (dedupe); keep the rest.
  const openedRendered = $derived(
    openedGroups.filter((g) => !visiblePaths.has(g.parent.path))
  );
  const tabGroups = $derived([...visibleGroups, ...openedRendered]);
  const openedPaths = $derived(new Set(openedRendered.map((g) => g.parent.path)));

  $effect(() => {
    if (!specsLoaded || !selectedPath) return;
    const live = findSelectedGroup(tabGroups, selectedPath);
    if (live) {
      lastSelectedGroup = live; // capture while visible (idempotent: same ref)
      return;
    }
    const promote = groupToPromote(selectedPath, tabGroups, lastSelectedGroup, openedGroups);
    if (promote) {
      openedGroups = [...openedGroups, promote];
      persistOpened();
    }
  });

  const SELECTED_KEY = 'sr:selectedPath';

  let specsAttempt = 0;
  let specsRetryTimer: ReturnType<typeof setTimeout> | null = null;

  async function fetchSpecs(): Promise<boolean> {
    try {
      const res = await fetch('/api/specs');
      if (!res.ok) return false;
      specs = await res.json();
      specsLoaded = true;
      return true;
    } catch {
      return false; // dev server down / restarting
    }
  }

  // Never give up: until this succeeds once, specsLoaded stays false, which
  // disables the tab-retention effect below — so a single transient failure
  // (dev server restarting at mount) would otherwise leave the strip empty
  // for the life of the page while the open doc keeps rendering.
  async function loadSpecs() {
    if (specsRetryTimer) {
      clearTimeout(specsRetryTimer);
      specsRetryTimer = null;
    }
    if (await fetchSpecs()) {
      specsAttempt = 0;
      return;
    }
    specsRetryTimer = setTimeout(loadSpecs, retryDelay(++specsAttempt));
  }

  async function adoptPath(oldPath: string, newPath: string) {
    const res = await fetch(`/api/resolve?q=${encodeURIComponent(newPath)}`);
    const group: DisplayGroup | null = res.ok ? await res.json() : null;
    // On a transient resolve failure the tab keeps its old path; it self-heals
    // on the next click (selectSpec re-runs adoptPath).
    if (!group) return;
    openedGroups = openedGroups.map((g) => (g.parent.path === oldPath ? group : g));
    if (lastSelectedGroup?.parent.path === oldPath) lastSelectedGroup = group;
    persistOpened();
  }

  async function selectSpec(path: string): Promise<boolean> {
    const res = await fetch(`/api/spec?path=${encodeURIComponent(path)}`);
    if (!res.ok) return false;
    const data = await res.json();
    content = data.content;
    knownMtime = data.mtime;
    const effective: string = data.path ?? path;
    selectedPath = effective;
    // Worktree gone → server served the main copy; rewrite the opened tab so the
    // selection, caption, and persistence all target the real file.
    if (effective !== path) await adoptPath(path, effective);
    localStorage.setItem(SELECTED_KEY, effective);
    return true;
  }

  function persistOpened() {
    localStorage.setItem(OPENED_KEY, JSON.stringify(openedGroups.map((g) => g.parent.path)));
  }

  async function pickDoc(query: string): Promise<boolean> {
    const res = await fetch(`/api/resolve?q=${encodeURIComponent(query)}`);
    if (!res.ok) return false;
    const group: DisplayGroup = await res.json();
    const path = group.parent.path;
    const known = tabGroups.some((g) => g.parent.path === path);
    if (!known) {
      openedGroups = [...openedGroups, group];
      persistOpened();
    }
    return selectSpec(path);
  }

  function closeOpened(path: string) {
    const removed = openedGroups.find((g) => g.parent.path === path);
    openedGroups = openedGroups.filter((g) => g.parent.path !== path);
    persistOpened();
    const hitChild = removed?.children.some((c) => c.path === selectedPath);
    if (selectedPath === path || hitChild) {
      selectedPath = null;
      content = '';
      lastSelectedGroup = null;
      localStorage.removeItem(SELECTED_KEY);
    }
  }

  function showToast(message: string) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3000);
  }

  async function pollExternalChange() {
    if (!selectedPath) return;
    const polledPath = selectedPath;
    const res = await fetch(`/api/spec?path=${encodeURIComponent(polledPath)}`);
    if (!res.ok) return;
    if (selectedPath !== polledPath) return;
    const data = await res.json();
    if (data.mtime > knownMtime) {
      content = data.content;
      knownMtime = data.mtime;
      showToast('Reloaded — file changed on disk');
    }
  }

  onMount(() => {
    loadSpecs();

    const savedOpened: string[] = JSON.parse(localStorage.getItem(OPENED_KEY) ?? '[]');
    Promise.all(
      savedOpened.map((p) =>
        fetch(`/api/resolve?q=${encodeURIComponent(p)}`)
          .then((r) => (r.ok ? (r.json() as Promise<DisplayGroup>) : null))
          .catch(() => null)
      )
    ).then((groups) => {
      openedGroups = groups.filter((g): g is DisplayGroup => g !== null);
      persistOpened();
    });

    const fromQuery = new URLSearchParams(window.location.search).get('path');
    const toOpen = fromQuery ?? localStorage.getItem(SELECTED_KEY);
    if (toOpen) {
      selectSpec(toOpen).then((ok) => {
        if (!ok && !fromQuery) localStorage.removeItem(SELECTED_KEY);
      });
      // Seed the retention cache so an out-of-window deep-link still gets a tab.
      fetch(`/api/resolve?q=${encodeURIComponent(toOpen)}`)
        .then((r) => (r.ok ? (r.json() as Promise<DisplayGroup>) : null))
        .then((g) => {
          if (g) lastSelectedGroup = g;
        })
        .catch(() => {});
    }

    const events = new EventSource('/api/events');
    events.onmessage = () => loadSpecs();
    // Re-sync on every (re)connect, not just on a change event. EventSource
    // reconnects itself after a dropped stream (dev server restart, sleep), but
    // onmessage won't fire until the *next* file change — so without this the
    // list stays frozen at whatever it was when the stream died, indefinitely.
    // The open doc keeps healing via pollExternalChange, which is what makes the
    // stale state look like "a doc is open but has no tab".
    events.onopen = () => loadSpecs();

    const pollId = setInterval(pollExternalChange, 3000);

    return () => {
      clearInterval(pollId);
      if (specsRetryTimer) clearTimeout(specsRetryTimer);
      events.close();
    };
  });
</script>

<div class="flex h-screen flex-col bg-neutral-900 text-neutral-200">
  <TabStrip
    groups={tabGroups}
    {selectedPath}
    onSelect={selectSpec}
    onPick={pickDoc}
    onClose={closeOpened}
    {openedPaths}
  />
  <main class="flex min-h-0 flex-1 flex-col overflow-hidden">
    {#if selectedPath}
      <header class="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs">
        <span class="truncate text-neutral-500" title={selectedPath}>{selectedPath}</span>
      </header>
      <div class="min-h-0 flex-1">
        <DocPane path={selectedPath} {content} />
      </div>
    {:else}
      <p class="p-6 text-neutral-500">
        {visibleGroups.length === 0 ? 'No specs in the last 24 hours.' : 'Select a spec.'}
      </p>
    {/if}
  </main>
</div>
<Toast message={toast} />
