<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState } from '@codemirror/state';
  import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
  import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
  import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { markdown } from '@codemirror/lang-markdown';
  import { languages } from '@codemirror/language-data';
  import { tags } from '@lezer/highlight';
  import { renderMarkdown } from '$lib/render';

  let {
    content,
    onInput
  }: {
    content: string;
    onInput: (value: string) => void;
  } = $props();

  let html = $state('');
  let renderVersion = 0;

  // Re-render the preview whenever content changes. renderMarkdown is async
  // (Shiki); a version guard drops stale results so fast typing can't let an
  // older render overwrite a newer one. We keep the previous html until the new
  // one resolves, so the pane never flashes blank between updates.
  $effect(() => {
    const src = content;
    const version = ++renderVersion;
    renderMarkdown(src)
      .then((out) => {
        if (version === renderVersion) html = out;
      })
      .catch((err) => console.error('preview render failed', err));
  });

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
      '&': { height: '100%', backgroundColor: '#171717', color: '#d4d4d4' },
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
    // Markdown structure
    { tag: tags.heading, color: '#93c5fd', fontWeight: 'bold' },
    { tag: tags.strong, color: '#fde68a', fontWeight: 'bold' },
    { tag: tags.emphasis, color: '#fcd34d', fontStyle: 'italic' },
    { tag: tags.link, color: '#7dd3fc', textDecoration: 'underline' },
    { tag: tags.url, color: '#7dd3fc' },
    { tag: tags.monospace, color: '#fca5a5' },
    // Code tokens inside fenced blocks
    { tag: tags.keyword, color: '#c792ea' },
    { tag: tags.controlKeyword, color: '#c792ea' },
    { tag: tags.moduleKeyword, color: '#c792ea' },
    { tag: tags.string, color: '#c3e88d' },
    { tag: tags.special(tags.string), color: '#c3e88d' },
    { tag: tags.regexp, color: '#c3e88d' },
    { tag: tags.comment, color: '#7d8590', fontStyle: 'italic' },
    { tag: tags.number, color: '#f78c6c' },
    { tag: [tags.bool, tags.null, tags.atom], color: '#ff9cac' },
    { tag: [tags.typeName, tags.className], color: '#ffcb6b' },
    { tag: tags.propertyName, color: '#82aaff' },
    { tag: tags.function(tags.variableName), color: '#82aaff' },
    { tag: tags.variableName, color: '#eeffff' },
    { tag: [tags.operator, tags.punctuation], color: '#89ddff' },
    // List markers track body text (de-emphasized, not comment-gray);
    // quotes get a distinct non-gray accent so neither reads as a comment.
    { tag: tags.list, color: '#d4d4d4' },
    { tag: tags.quote, color: '#80cbc4', fontStyle: 'italic' }
  ]);

  onMount(() => {
    view = new EditorView({
      parent: editorEl,
      state: EditorState.create({
        doc: content,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ codeLanguages: languages }),
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
    class="prose prose-invert prose-base min-w-0 max-w-none flex-1 overflow-y-auto bg-neutral-900 p-4"
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
