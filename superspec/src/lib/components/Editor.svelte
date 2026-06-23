<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState } from '@codemirror/state';
  import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
  import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
  import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { markdown } from '@codemirror/lang-markdown';
  import { tags } from '@lezer/highlight';
  import { renderMarkdown } from '$lib/render';

  let {
    content,
    onInput
  }: {
    content: string;
    onInput: (value: string) => void;
  } = $props();

  let html = $derived(renderMarkdown(content));

  let editorEl: HTMLDivElement;
  let preview: HTMLDivElement;
  let view: EditorView | undefined;
  let syncing = false;
  let applyingExternal = false;

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

  const darkTheme = EditorView.theme(
    {
      '&': { height: '100%', backgroundColor: '#171717', color: '#f5f5f5' },
      '.cm-scroller': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '13px',
        overflow: 'auto'
      },
      '.cm-content': { caretColor: '#e5e5e5' },
      '&.cm-focused': { outline: 'none' },
      '.cm-cursor': { borderLeftColor: '#e5e5e5' },
      '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: '#264f78'
      }
    },
    { dark: true }
  );

  const mdHighlight = HighlightStyle.define([
    { tag: tags.heading, color: '#93c5fd', fontWeight: 'bold' },
    { tag: tags.strong, color: '#fde68a', fontWeight: 'bold' },
    { tag: tags.emphasis, color: '#fcd34d', fontStyle: 'italic' },
    { tag: tags.link, color: '#7dd3fc', textDecoration: 'underline' },
    { tag: tags.url, color: '#7dd3fc' },
    { tag: tags.monospace, color: '#fca5a5' },
    { tag: tags.list, color: '#a3a3a3' },
    { tag: tags.quote, color: '#a3a3a3', fontStyle: 'italic' }
  ]);

  onMount(() => {
    view = new EditorView({
      parent: editorEl,
      state: EditorState.create({
        doc: content,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          syntaxHighlighting(mdHighlight),
          highlightActiveLine(),
          darkTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !applyingExternal) onInput(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            scroll: () => {
              if (view) sync(view.scrollDOM, preview);
            }
          })
        ]
      })
    });
    return () => view?.destroy();
  });

  // External content changes (spec selection, external-change reload): replace the doc
  // without re-triggering onInput (guarded by applyingExternal).
  $effect(() => {
    const incoming = content;
    if (!view) return;
    const current = view.state.doc.toString();
    if (incoming === current) return;
    applyingExternal = true;
    view.dispatch({ changes: { from: 0, to: current.length, insert: incoming } });
    applyingExternal = false;
  });
</script>

<div class="flex h-full overflow-hidden">
  <div
    bind:this={preview}
    class="prose prose-invert prose-sm min-w-0 flex-1 overflow-y-auto bg-neutral-900 p-4"
    onscroll={() => {
      if (view) sync(preview, view.scrollDOM);
    }}
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html html}
  </div>
  <div
    bind:this={editorEl}
    class="min-w-[22rem] max-w-[48rem] flex-1 overflow-hidden border-l border-neutral-800"
  ></div>
</div>
