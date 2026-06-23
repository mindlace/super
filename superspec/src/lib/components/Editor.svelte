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

  let textarea: HTMLTextAreaElement;
  let preview: HTMLDivElement;
  let syncing = false;

  function pct(el: HTMLElement): number {
    const max = el.scrollHeight - el.clientHeight;
    return max <= 0 ? 0 : el.scrollTop / max;
  }

  function applyPct(el: HTMLElement, p: number) {
    const max = el.scrollHeight - el.clientHeight;
    el.scrollTop = p * max;
  }

  function sync(from: HTMLElement, to: HTMLElement) {
    if (syncing) return;
    syncing = true;
    applyPct(to, pct(from));
    requestAnimationFrame(() => (syncing = false));
  }
</script>

<div class="grid h-full grid-cols-2 gap-0 overflow-hidden">
  <textarea
    bind:this={textarea}
    class="bg-neutral-900 text-neutral-100 border-r border-neutral-800 caret-neutral-200 h-full w-full resize-none p-4 font-mono text-sm outline-none"
    value={content}
    oninput={(e) => onInput(e.currentTarget.value)}
    onscroll={() => sync(textarea, preview)}
    spellcheck="false"
  ></textarea>
  <div
    bind:this={preview}
    class="prose prose-invert prose-sm h-full max-w-none overflow-y-auto bg-neutral-900 p-4"
    onscroll={() => sync(preview, textarea)}
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html html}
  </div>
</div>
