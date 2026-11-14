<script lang="ts">
  let { message }: { message: string | null } = $props();
</script>

{#if message}
  <div
    class="pointer-events-none fixed bottom-4 right-4 rounded bg-neutral-700 px-3 py-2 text-sm text-white shadow-lg ring-1 ring-neutral-600"
    role="status"
  >
    {message}
  </div>
{/if}
