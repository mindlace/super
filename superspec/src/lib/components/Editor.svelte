<script lang="ts">
  import { renderMarkdown } from '$lib/render';

  let {
    content,
    onInput
  }: {
    content: string;
    onInput: (value: string) => void;
  } = $props();

  let html = $derived(renderMarkdown(content));
</script>

<div class="grid h-full grid-cols-2 gap-0 overflow-hidden">
  <textarea
    class="h-full w-full resize-none bg-neutral-900 text-neutral-100 border-r border-neutral-800 caret-neutral-200 p-4 font-mono text-sm outline-none"
    value={content}
    oninput={(e) => onInput(e.currentTarget.value)}
    spellcheck="false"
  ></textarea>
  <div class="prose prose-invert prose-sm h-full max-w-none overflow-y-auto bg-neutral-900 p-4">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html html}
  </div>
</div>
