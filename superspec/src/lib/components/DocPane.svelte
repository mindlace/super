<script lang="ts">
  import { tick } from 'svelte';
  import Editor from './Editor.svelte';
  import { renderMarkdown, renderSpecHtml } from '$lib/render';
  import { specKind, type SpecKind } from '$lib/specfile';
  import { scrollRatio, scrollTopFor } from '$lib/scrollratio';
  import { renderViewFor, type RenderOutcome } from '$lib/renderview';

  let {
    path,
    content,
    readOnly,
    onInput
  }: {
    path: string;
    content: string;
    readOnly: boolean;
    onInput: (value: string) => void;
  } = $props();

  type View = 'rendered' | 'source';
  const VIEW_KEY = 'sr:view';

  function loadView(): View {
    try {
      return sessionStorage.getItem(VIEW_KEY) === 'source' ? 'source' : 'rendered';
    } catch {
      return 'rendered';
    }
  }

  let view = $state<View>(loadView());
  const kind: SpecKind = $derived(specKind(path) ?? 'markdown');

  // A finished render. The kind travels with the html so it is always wrapped
  // the way it was rendered.
  interface Rendered {
    kind: SpecKind;
    html: string;
    removed: string[];
    problems: string[];
  }
  // The last render that landed or failed, tagged with its file. Only an outcome
  // for the selected path is ever shown (see renderViewFor).
  let last = $state<RenderOutcome<Rendered> | null>(null);
  const shown = $derived(renderViewFor(last, path));
  const rendered = $derived(shown.status === 'ready' ? shown.result : null);
  let renderVersion = 0;

  let renderedEl = $state<HTMLDivElement>();
  // Relative scroll position carried between the two panes and across reloads.
  let ratio = $state(0);

  // A newly selected file starts at the top in either view.
  $effect(() => {
    void path;
    ratio = 0;
  });

  async function renderDoc(src: string, specPath: string, k: SpecKind): Promise<Rendered> {
    if (k === 'html') return { kind: k, ...(await renderSpecHtml(src, specPath)) };
    return { kind: k, html: await renderMarkdown(src), removed: [], problems: [] };
  }

  // Re-render whenever content changes. Rendering is async (Shiki); a version
  // guard drops stale results so an older render can't overwrite a newer one.
  // For the same file the previous html stays up until the new one resolves, so
  // an external reload never flashes blank; a newly selected file shows nothing
  // until its own render lands, never the previous file's.
  $effect(() => {
    const src = content;
    const specPath = path;
    const k = kind;
    const version = ++renderVersion;
    renderDoc(src, specPath, k)
      .then(async (out) => {
        if (version !== renderVersion) return;
        // Same file: hold the reader's relative position through the reload.
        // Another file: start at the top.
        const sameFile = last?.path === specPath;
        const keep = sameFile && renderedEl ? scrollRatio(renderedEl) : 0;
        last = { path: specPath, result: out };
        await tick();
        if (renderedEl) renderedEl.scrollTop = scrollTopFor(keep, renderedEl);
      })
      .catch((err) => {
        console.error('render failed', err);
        if (version !== renderVersion) return;
        last = { path: specPath, error: err instanceof Error ? err.message : String(err) };
      });
  });

  async function setView(next: View) {
    if (next === view) return;
    if (view === 'rendered' && renderedEl) ratio = scrollRatio(renderedEl);
    view = next;
    try {
      sessionStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage unavailable: the choice just won't outlive this page.
    }
    if (next === 'rendered') {
      await tick();
      if (renderedEl) renderedEl.scrollTop = scrollTopFor(ratio, renderedEl);
    }
  }

  const noticeCount = $derived(rendered ? rendered.removed.length + rendered.problems.length : 0);
</script>

<div class="flex h-full flex-col">
  <div
    class="flex shrink-0 items-start gap-3 border-b border-neutral-800 px-4 py-1.5 text-xs"
  >
    <div class="flex shrink-0 overflow-hidden rounded border border-neutral-700" role="group">
      {#each [['rendered', 'Rendered'], ['source', 'Source']] as [value, label] (value)}
        <button
          type="button"
          class="px-2 py-0.5 {view === value
            ? 'bg-neutral-700 text-neutral-100'
            : 'text-neutral-400 hover:text-neutral-200'}"
          aria-pressed={view === value}
          onclick={() => setView(value as View)}>{label}</button
        >
      {/each}
    </div>
    {#if rendered?.kind === 'html' && noticeCount > 0}
      <details class="min-w-0 text-amber-300">
        <summary class="cursor-pointer select-none">
          {#if rendered.removed.length}{rendered.removed.length} removed{/if}{#if rendered.removed.length && rendered.problems.length},
          {/if}{#if rendered.problems.length}{rendered.problems.length}
            {rendered.problems.length === 1 ? 'problem' : 'problems'}{/if}
        </summary>
        <ul class="mt-1 list-disc pl-5 text-neutral-300">
          {#each rendered.removed as item, i (i)}
            <li>Removed: <code>{item}</code></li>
          {/each}
          {#each rendered.problems as item, i (i)}
            <li>{item}</li>
          {/each}
        </ul>
      </details>
    {/if}
  </div>
  <div class="min-h-0 flex-1">
    {#if view === 'rendered'}
      <div bind:this={renderedEl} class="spec-doc h-full overflow-y-auto">
        {#if shown.status === 'error'}
          <article><p role="alert">Could not render this file: {shown.message}</p></article>
        {:else if rendered?.kind === 'html'}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html rendered.html}
        {:else if rendered}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <article>{@html rendered.html}</article>
        {/if}
      </div>
    {:else}
      <Editor
        {content}
        {onInput}
        {readOnly}
        {kind}
        initialScrollRatio={ratio}
        onScrollRatio={(r) => (ratio = r)}
      />
    {/if}
  </div>
</div>
