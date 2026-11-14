<script lang="ts">
  import { tick, untrack } from 'svelte';
  import Editor from './Editor.svelte';
  import { renderMarkdown, renderSpecHtml } from '$lib/render';
  import { specKind, type SpecKind } from '$lib/specfile';
  import { scrollRatio, scrollTopFor } from '$lib/scrollratio';
  import { renderViewFor, type RenderOutcome } from '$lib/renderview';
  import {
    addListItemAfter,
    locateEditables,
    removeEmptyListItem,
    spliceRange,
    type Editable
  } from '$lib/inplace';
  import {
    blocksInput,
    canArm,
    caretAtEnd,
    caretToEnd,
    collectRenderedEditables,
    editedInner,
    editingAligned,
    isEmptyItem,
    pastedText,
    toggleInline
  } from '$lib/inplaceDom';

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
  // the way it was rendered; `source` is the text it was rendered from.
  interface Rendered {
    kind: SpecKind;
    source: string;
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
  // Bumped to force a re-render of unchanged content (see setView).
  let renderNonce = $state(0);
  // Each landed render gets a fresh id, so its html always replaces the DOM,
  // even when the string matches a DOM the reader has since edited in place.
  let renderId = $state(0);

  // `domSource` is the source text the rendered DOM shows (or will show when the
  // rendered view mounts), for every file kind and whether or not it is editable:
  // a render's source when it lands, then each text an in-place edit emits. The
  // render effect skips content it already matches. Editing is armed only while
  // it equals the current `content` of the current path and no render is pending,
  // so a splice is never applied to a DOM a pending render is about to replace.
  // Plain variables: nothing on screen depends on them.
  let domSource: { path: string; text: string } | null = null;
  let renderPending = false;
  let editables: HTMLElement[] = [];
  // The path whose in-place editing is off (removed markup or a misaligned DOM).
  let editingOffFor = $state<string | null>(null);
  // After a list item is added or removed: the editable (by index) that gets the
  // caret once the re-render lands and editing re-arms.
  let pendingCaret: { path: string; index: number } | null = null;

  let renderedEl = $state<HTMLDivElement>();
  // Relative scroll position carried between the two panes and across reloads.
  let ratio = $state(0);

  // A newly selected file starts at the top in either view.
  $effect(() => {
    void path;
    ratio = 0;
  });

  async function renderDoc(src: string, specPath: string, k: SpecKind): Promise<Rendered> {
    if (k === 'html') return { kind: k, source: src, ...(await renderSpecHtml(src, specPath)) };
    return { kind: k, source: src, html: await renderMarkdown(src), removed: [], problems: [] };
  }

  // Re-render whenever content changes. Rendering is async (Shiki); a version
  // guard drops stale results so an older render can't overwrite a newer one.
  // For the same file the previous html stays up until the new one resolves, so
  // an external reload never flashes blank; a newly selected file shows nothing
  // until its own render lands, never the previous file's.
  //
  // Content an in-place edit just emitted is already on screen: re-rendering it
  // would drop the caret, so it is skipped (and any older render still in flight
  // is dropped with it).
  $effect(() => {
    const src = content;
    const specPath = path;
    const k = kind;
    void renderNonce;
    const version = ++renderVersion;
    if (domSource && domSource.path === specPath && domSource.text === src) {
      renderPending = false;
      return;
    }
    // Nothing typed now could be kept: this render replaces the DOM. Disarm at
    // once so keystrokes are refused rather than shown and then lost.
    renderPending = true;
    untrack(disarm);
    renderDoc(src, specPath, k)
      .then(async (out) => {
        if (version !== renderVersion) return;
        // Same file: hold the reader's relative position through the reload.
        // Another file: start at the top.
        const sameFile = last?.path === specPath;
        const keep = sameFile && renderedEl ? scrollRatio(renderedEl) : 0;
        renderPending = false;
        domSource = { path: specPath, text: out.source };
        last = { path: specPath, result: out };
        renderId++;
        await tick();
        if (renderedEl) renderedEl.scrollTop = scrollTopFor(keep, renderedEl);
      })
      .catch((err) => {
        console.error('render failed', err);
        if (version !== renderVersion) return;
        renderPending = false;
        domSource = null;
        last = { path: specPath, error: err instanceof Error ? err.message : String(err) };
      });
  });

  // (Re)arm in-place editing after every DOM change that bears on it: a landed
  // render, a view switch, a read-only or file change. Runs after the DOM updates.
  $effect(() => {
    void renderId;
    void view;
    void readOnly;
    void path;
    void shown;
    void renderedEl;
    untrack(armEditing);
  });

  function disarm() {
    for (const el of renderedEl?.querySelectorAll('[contenteditable]') ?? []) {
      el.removeAttribute('contenteditable');
    }
    editables = [];
  }

  // Make the rendered DOM editable where it is safe to: an `.html` file off main,
  // shown in the rendered view, whose DOM shows the current content and whose
  // editables line up one-to-one with the source's.
  function armEditing() {
    disarm();
    const root = renderedEl;
    const r = shown.status === 'ready' ? shown.result : null;
    if (!root || !r) return;
    const armable = canArm({
      view,
      kind: r.kind,
      readOnly,
      renderPending,
      domCurrent: domSource?.path === path && domSource.text === content
    });
    if (!armable) return;
    const source = locateEditables(content);
    const found = collectRenderedEditables(root);
    const caret = pendingCaret;
    pendingCaret = null;
    if (r.removed.length || !editingAligned(found, source)) {
      editingOffFor = path;
      return;
    }
    if (editingOffFor === path) editingOffFor = null;
    editables = found;
    found.forEach((el, i) => {
      if (!source[i].range) return;
      el.setAttribute('contenteditable', 'true');
      const box = el.localName === 'li' ? el.querySelector(':scope > input') : null;
      if (box) box.setAttribute('contenteditable', 'false');
    });
    for (const el of root.querySelectorAll('[data-sr-added]')) {
      el.setAttribute('contenteditable', 'false');
    }
    const target = caret?.path === path ? found[caret.index] : undefined;
    if (target?.isContentEditable) caretToEnd(target);
  }

  function editableAt(target: EventTarget | null): number {
    if (!(target instanceof Node)) return -1;
    return editables.findIndex((el) => el.contains(target));
  }

  // The current source's editables, when editable `i` may be edited now: the DOM
  // shows the current content and lines up with the source. Null otherwise; a
  // misaligned DOM also stops editing and re-renders from the content, which
  // re-arms editing only if the two line up again.
  function editSource(i: number): Editable[] | null {
    if (i < 0 || readOnly || kind !== 'html' || renderPending) return null;
    // Belt and braces: arming already guarantees the DOM shows the current content.
    if (!domSource || domSource.path !== path || domSource.text !== content) return null;
    // Re-locate against the current source every time, so earlier splices never
    // leave stale offsets.
    const source = locateEditables(content);
    if (!source[i]?.range || !editingAligned(editables, source)) {
      disarm();
      domSource = null;
      editingOffFor = path;
      renderNonce++;
      return null;
    }
    return source;
  }

  // Splice editable `i`'s edited text into the source.
  function commitEdit(i: number) {
    const source = editSource(i);
    if (!source) return;
    const next = spliceRange(content, source[i].range!, editedInner(editables[i]));
    if (next === content) return;
    domSource = { path, text: next };
    onInput(next);
  }

  function onEditInput(e: Event) {
    commitEdit(editableAt(e.target));
  }

  // A list item added or removed: the DOM no longer matches, so emit the new
  // source and re-render it (`domSource` cleared so the render is not skipped),
  // then put the caret at the end of editable `caretIndex` once it lands.
  function structuralEdit(next: string, caretIndex: number): boolean {
    if (next === content) return false;
    disarm();
    domSource = null;
    pendingCaret = { path, index: caretIndex };
    onInput(next);
    renderNonce++;
    return true;
  }

  // Enter at the end of a list item adds an empty item after it.
  function addItemAt(i: number) {
    const el = editables[i];
    const sel = window.getSelection();
    if (el?.localName !== 'li' || !sel?.isCollapsed || !sel.focusNode) return;
    if (!caretAtEnd(el, sel.focusNode, sel.focusOffset)) return;
    const source = editSource(i);
    if (source) structuralEdit(addListItemAfter(content, source[i]), i + 1);
  }

  // Backspace in an empty list item removes it, when the item before it is an
  // editable that can take the caret. True when the item was removed.
  function removeItemAt(i: number): boolean {
    const el = editables[i];
    if (el?.localName !== 'li' || !isEmptyItem(el)) return false;
    const prev = el.previousElementSibling;
    if (!prev || editables[i - 1] !== prev) return false;
    const source = editSource(i);
    return !!source && structuralEdit(removeEmptyListItem(content, source[i]), i - 1);
  }

  // Bold and italic wrap or unwrap the selection, then go through the normal
  // splice path; cleanInline keeps the result to strong and em.
  function toggleFormat(i: number, tag: 'strong' | 'em') {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    toggleInline(editables[i], range, tag);
    sel.removeAllRanges();
    sel.addRange(range);
    commitEdit(i);
  }

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  function onEditKeydown(e: KeyboardEvent) {
    const i = editableAt(e.target);
    if (i < 0) return;
    // Cmd on macOS (where Ctrl-B/Ctrl-I move the caret), Ctrl elsewhere.
    const mod = (isMac ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey;
    const key = e.key.toLowerCase();
    if (mod && (key === 'b' || key === 'i')) {
      e.preventDefault();
      toggleFormat(i, key === 'b' ? 'strong' : 'em');
    } else if (mod && key === 'u') {
      // No underline in a spec.
      e.preventDefault();
    } else if (e.key === 'Enter' && !e.isComposing) {
      // Enter that commits an IME composition is not a new line. Any other Enter
      // is refused, except plain Enter at the end of a list item.
      e.preventDefault();
      if (!e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) addItemAt(i);
    } else if (e.key === 'Backspace' && !e.altKey && !e.metaKey && !e.ctrlKey) {
      if (removeItemAt(i)) e.preventDefault();
    }
  }

  // New lines, dropped content and the browser's own formatting, however they
  // arrive (Enter, Shift+Enter, the edit menu, drag and drop), never reach an
  // editable element. A new paragraph at the end of a list item adds an item.
  function onEditBeforeInput(e: InputEvent) {
    const i = editableAt(e.target);
    if (i < 0 || !blocksInput(e.inputType)) return;
    e.preventDefault();
    if (e.inputType === 'insertParagraph') addItemAt(i);
  }

  function onEditDrop(e: DragEvent) {
    if (editableAt(e.target) >= 0) e.preventDefault();
  }

  function onEditPaste(e: ClipboardEvent) {
    if (editableAt(e.target) < 0) return;
    e.preventDefault();
    const text = pastedText(e.clipboardData?.getData('text/plain') ?? '');
    // Plain text on one line; execCommand keeps the browser's undo stack.
    if (text) document.execCommand('insertText', false, text);
  }

  async function setView(next: View) {
    if (next === view) return;
    if (view === 'rendered' && renderedEl) ratio = scrollRatio(renderedEl);
    if (view === 'rendered') {
      // The rendered DOM is about to go; when the view comes back it is rebuilt
      // from the last render. If in-place edits left that render behind the
      // content, re-render now so the view comes back current.
      editables = [];
      domSource = rendered ? { path, text: rendered.source } : null;
      if (rendered && rendered.source !== content) renderNonce++;
    }
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

  const editingOff = $derived(editingOffFor === path && rendered?.kind === 'html');
  const noticeCount = $derived(
    rendered ? rendered.removed.length + rendered.problems.length + (editingOff ? 1 : 0) : 0
  );
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
            {rendered.problems.length === 1 ? 'problem' : 'problems'}{/if}{#if editingOff}{#if rendered.removed.length || rendered.problems.length},
          {/if}editing off{/if}
        </summary>
        <ul class="mt-1 list-disc pl-5 text-neutral-300">
          {#each rendered.removed as item, i (i)}
            <li>Removed: <code>{item}</code></li>
          {/each}
          {#each rendered.problems as item, i (i)}
            <li>{item}</li>
          {/each}
          {#if editingOff}
            <li>In-place editing is off for this file: use the Source view to edit it.</li>
          {/if}
        </ul>
      </details>
    {/if}
  </div>
  <div class="min-h-0 flex-1">
    {#if view === 'rendered'}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={renderedEl}
        class="spec-doc h-full overflow-y-auto"
        oninput={onEditInput}
        onbeforeinput={onEditBeforeInput}
        onkeydown={onEditKeydown}
        onpaste={onEditPaste}
        ondrop={onEditDrop}
      >
        {#key renderId}
          {#if shown.status === 'error'}
            <article><p role="alert">Could not render this file: {shown.message}</p></article>
          {:else if rendered?.kind === 'html'}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html rendered.html}
          {:else if rendered}
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            <article>{@html rendered.html}</article>
          {/if}
        {/key}
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
