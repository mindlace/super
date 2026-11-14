<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState, Compartment } from '@codemirror/state';
  import { EditorView, keymap, highlightActiveLine } from '@codemirror/view';
  import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
  import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { markdown } from '@codemirror/lang-markdown';
  import { languages } from '@codemirror/language-data';
  import { tags } from '@lezer/highlight';
  import { html } from '@codemirror/lang-html';
  import { diffRange } from '$lib/diffRange';
  import { scrollRatio, scrollTopFor } from '$lib/scrollratio';
  import type { SpecKind } from '$lib/specfile';

  let {
    content,
    onInput,
    readOnly = false,
    kind,
    initialScrollRatio,
    onScrollRatio
  }: {
    content: string;
    onInput: (value: string) => void;
    readOnly?: boolean;
    kind: SpecKind;
    initialScrollRatio?: number;
    onScrollRatio?: (r: number) => void;
  } = $props();

  const editable = new Compartment();
  const language = new Compartment();

  function languageFor(k: SpecKind) {
    return k === 'html' ? html() : markdown({ codeLanguages: languages });
  }

  let editorEl: HTMLDivElement;
  let view: EditorView | undefined;
  let applyingExternal = false;

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
    { tag: tags.quote, color: '#80cbc4', fontStyle: 'italic' },
    // HTML source
    { tag: tags.tagName, color: '#f07178' },
    { tag: tags.attributeName, color: '#ffcb6b' },
    { tag: tags.attributeValue, color: '#c3e88d' },
    { tag: tags.angleBracket, color: '#89ddff' }
  ]);

  onMount(() => {
    view = new EditorView({
      parent: editorEl,
      state: EditorState.create({
        doc: content,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          language.of(languageFor(kind)),
          EditorView.lineWrapping,
          syntaxHighlighting(mdHighlight),
          highlightActiveLine(),
          darkTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !applyingExternal) onInput(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            scroll: () => {
              if (view) onScrollRatio?.(scrollRatio(view.scrollDOM));
            }
          }),
          editable.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)])
        ]
      })
    });
    // Wait for CodeMirror to lay the doc out before restoring the position.
    const ratio = initialScrollRatio;
    if (ratio) {
      requestAnimationFrame(() => {
        if (view) view.scrollDOM.scrollTop = scrollTopFor(ratio, view.scrollDOM);
      });
    }
    return () => view?.destroy();
  });

  // External content changes (spec selection, external-change reload): apply the
  // smallest diff rather than replacing the whole doc, so CodeMirror maps scroll
  // and selection through the change instead of resetting to the top. Guarded by
  // applyingExternal so it doesn't re-trigger onInput.
  $effect(() => {
    const incoming = content;
    if (!view) return;
    const current = view.state.doc.toString();
    if (incoming === current) return;
    applyingExternal = true;
    view.dispatch({ changes: diffRange(current, incoming) });
    applyingExternal = false;
  });

  // Switch markdown/html highlighting when a file of the other kind is selected.
  $effect(() => {
    const k = kind;
    if (!view) return;
    view.dispatch({ effects: language.reconfigure(languageFor(k)) });
  });

  // Switch between an editable worktree file and a read-only main file without
  // remounting the editor.
  $effect(() => {
    const ro = readOnly;
    if (!view) return;
    view.dispatch({
      effects: editable.reconfigure([EditorState.readOnly.of(ro), EditorView.editable.of(!ro)])
    });
  });
</script>

<div bind:this={editorEl} class="h-full overflow-hidden"></div>
