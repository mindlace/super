<script lang="ts">
  import { onMount } from 'svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Editor from '$lib/components/Editor.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import type { ProjectGroup } from '$lib/types';

  let groups = $state<ProjectGroup[]>([]);
  let selectedPath = $state<string | null>(null);
  let content = $state('');
  let knownMtime = $state(0);
  let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  async function loadGroups() {
    const res = await fetch('/api/specs');
    groups = await res.json();
  }

  async function selectSpec(path: string) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const res = await fetch(`/api/spec?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    content = data.content;
    knownMtime = data.mtime;
    selectedPath = path;
    saveStatus = 'idle';
  }

  async function save() {
    if (!selectedPath) return;
    saveStatus = 'saving';
    const res = await fetch(`/api/spec?path=${encodeURIComponent(selectedPath)}`, {
      method: 'PUT',
      body: content
    });
    const data = await res.json();
    knownMtime = data.mtime;
    saveStatus = 'saved';
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
    const res = await fetch(`/api/spec?path=${encodeURIComponent(selectedPath)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.mtime > knownMtime) {
      content = data.content;
      knownMtime = data.mtime;
      saveStatus = 'idle';
      showToast('Reloaded — file changed on disk');
    }
  }

  onMount(() => {
    loadGroups();
    const params = new URLSearchParams(window.location.search);
    const path = params.get('path');
    if (path) selectSpec(path);
    const id = setInterval(pollExternalChange, 3000);
    return () => clearInterval(id);
  });
</script>

<div class="grid h-screen grid-cols-[20rem_1fr] bg-neutral-900 text-neutral-200">
  <Sidebar {groups} {selectedPath} onSelect={selectSpec} />
  <main class="flex flex-col overflow-hidden">
    {#if selectedPath}
      <header class="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs">
        <span class="truncate text-neutral-500" title={selectedPath}>{selectedPath}</span>
        <span class="ml-2 shrink-0 text-neutral-500">
          {#if saveStatus === 'saving'}saving…{:else if saveStatus === 'saved'}saved{/if}
        </span>
      </header>
      <div class="min-h-0 flex-1">
        <Editor {content} onInput={handleInput} />
      </div>
    {:else}
      <p class="p-6 text-neutral-500">Select a spec.</p>
    {/if}
  </main>
</div>
<Toast message={toast} />
