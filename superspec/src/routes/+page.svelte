<script lang="ts">
  import { onMount } from 'svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import type { ProjectGroup } from '$lib/types';

  let groups = $state<ProjectGroup[]>([]);
  let selectedPath = $state<string | null>(null);

  async function loadGroups() {
    const res = await fetch('/api/specs');
    groups = await res.json();
  }

  function selectSpec(path: string) {
    selectedPath = path;
  }

  onMount(loadGroups);
</script>

<div class="grid h-screen grid-cols-[20rem_1fr] bg-neutral-900 text-neutral-200">
  <Sidebar {groups} {selectedPath} onSelect={selectSpec} />
  <main class="overflow-hidden p-6">
    {#if selectedPath}
      <p class="text-neutral-200">{selectedPath}</p>
    {:else}
      <p class="text-neutral-500">Select a spec.</p>
    {/if}
  </main>
</div>
