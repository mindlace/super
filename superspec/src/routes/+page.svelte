<script lang="ts">
  import { onMount } from 'svelte';
  import TabStrip from '$lib/components/TabStrip.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import type { SpecEntry } from '$lib/types';
  import { DAY_MS } from '$lib/recency';
  import { pairAndGroup, type DisplayGroup } from '$lib/pairing';

  let specs = $state<SpecEntry[]>([]);
  let selectedPath = $state<string | null>(null);
  let content = $state('');
  let knownMtime = $state(0);
  let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  const visibleGroups = $derived(
    pairAndGroup(specs).filter((g) => g.recency >= Date.now() - DAY_MS)
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

  const SELECTED_KEY = 'sr:selectedPath';

  async function loadSpecs() {
    const res = await fetch('/api/specs');
    if (!res.ok) return;
    specs = await res.json();
  }

  async function selectSpec(path: string): Promise<boolean> {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const res = await fetch(`/api/spec?path=${encodeURIComponent(path)}`);
    if (!res.ok) return false;
    const data = await res.json();
    content = data.content;
    knownMtime = data.mtime;
    selectedPath = path;
    saveStatus = 'idle';
    localStorage.setItem(SELECTED_KEY, path);
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
      saveStatus = 'idle';
      localStorage.removeItem(SELECTED_KEY);
    }
  }

  async function save() {
    if (!selectedPath) return;
    const savedPath = selectedPath;
    saveStatus = 'saving';
    try {
      const res = await fetch(`/api/spec?path=${encodeURIComponent(savedPath)}`, {
        method: 'PUT',
        body: content
      });
      if (selectedPath !== savedPath) return;
      if (!res.ok) {
        saveStatus = 'error';
        return;
      }
      const data = await res.json();
      knownMtime = data.mtime;
      saveStatus = 'saved';
    } catch {
      if (selectedPath !== savedPath) return;
      saveStatus = 'error';
    }
  }

  function handleInput(value: string) {
    content = value;
    saveStatus = 'saving';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1000);
  }

  function showToast(message: string) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 3000);
  }

  async function pollExternalChange() {
    if (!selectedPath || saveStatus === 'saving') return;
    const polledPath = selectedPath;
    const res = await fetch(`/api/spec?path=${encodeURIComponent(polledPath)}`);
    if (!res.ok) return;
    if (selectedPath !== polledPath) return;
    const data = await res.json();
    if (data.mtime > knownMtime) {
      content = data.content;
      knownMtime = data.mtime;
      saveStatus = 'idle';
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
    }

    const events = new EventSource('/api/events');
    events.onmessage = () => loadSpecs();

    const pollId = setInterval(pollExternalChange, 3000);

    return () => {
      clearInterval(pollId);
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
        <span class="ml-2 shrink-0 text-neutral-500">
          {#if saveStatus === 'saving'}saving…{:else if saveStatus === 'saved'}saved{:else if saveStatus === 'error'}<span
              class="text-red-400">save failed</span
            >{/if}
        </span>
      </header>
      <div class="min-h-0 flex-1">
        <Editor {content} onInput={handleInput} />
      </div>
    {:else}
      <p class="p-6 text-neutral-500">
        {visibleGroups.length === 0 ? 'No specs in the last 24 hours.' : 'Select a spec.'}
      </p>
    {/if}
  </main>
</div>
<Toast message={toast} />
