import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Compartment, EditorState, RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  keymap,
  type DecorationSet,
  type ViewUpdate
} from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface MarkdownEditorHandle {
  getContent(): string;
  isComposing(): boolean;
  insertSnippet(snippet: string): void;
  getSelectionText(): string | null;
  replaceSelection(text: string): void;
}

interface MarkdownEditorProps {
  documentId: string;
  initialContent: string;
  /** [[引用]] 解析用的实体名集合 */
  entityNames: ReadonlySet<string>;
  onDocChanged(content: string): void;
  onOpenEntityByName(name: string): void;
}

/*
 * 中文 IME 安全设计：
 * 1. compositionstart/end 置位 composingRef；composition 期间 autosave/草稿调度全部挂起；
 * 2. 编辑器内容在本组件挂载期间是唯一事实来源——React 永不把外部内容
 *    dispatch 进 EditorView（切文档 = 整棵重建，见 useEffect 依赖）；
 * 3. 实体名集合变化经 Compartment/StateEffect 重配置 decoration，不触碰文档与选区。
 */

const REF_RE = /\[\[([^\]]+)\]\]/g;
const setEntityNamesEffect = StateEffect.define<ReadonlySet<string>>();

// StateField.update 无法直接读 props，用模块级变量在 dispatch 前同步。
// 编辑器是单实例（工作台一次只开一个文档），无并发问题。
let currentNames: ReadonlySet<string> = new Set();

function buildReferenceDecorations(text: string, names: ReadonlySet<string>): DecorationSet {
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  // ::: 指令块围栏行弱化显示（黄铜色小字），让作者一眼区分「语法」与「正文」
  let offset = 0;
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith(":::")) {
      ranges.push({ from: offset, to: offset, deco: Decoration.line({ class: "cm-directive-line" }) });
    }
    offset += line.length + 1;
  }
  for (const m of text.matchAll(REF_RE)) {
    const name = m[1];
    if (!name) continue;
    const known = names.has(name);
    const deco = Decoration.mark({
      class: known ? "cm-entity-ref" : "cm-entity-ref-missing",
      attributes: { title: known ? `实体：${name}` : `未找到实体「${name}」—— 可在右侧面板创建` }
    });
    ranges.push({ from: m.index, to: m.index + m[0].length, deco });
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return RangeSet.of(
    ranges.map((r) => r.deco.range(r.from, r.to)),
    true
  );
}

function referenceField(onOpen: (name: string) => void) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildReferenceDecorations(state.doc.toString(), currentNames);
    },
    update(deco, tr) {
      let names = currentNames;
      for (const e of tr.effects) {
        if (e.is(setEntityNamesEffect)) names = e.value;
      }
      if (tr.docChanged || tr.effects.some((e) => e.is(setEntityNamesEffect))) {
        return buildReferenceDecorations(tr.state.doc.toString(), names);
      }
      return deco.map(tr.changes);
    },
    provide: (f) => [
      EditorView.decorations.from(f),
      EditorView.domEventHandlers({
        mousedown(event, view) {
          const pos = view.posAtDOM(event.target as Node);
          if (pos == null) return;
          const text = view.state.doc.toString();
          for (const m of text.matchAll(REF_RE)) {
            const from = m.index;
            const to = from + m[0].length;
            if (pos >= from && pos <= to && m[1]) {
              event.preventDefault();
              onOpen(m[1]);
              return;
            }
          }
        }
      })
    ]
  });
}

const editorTheme = EditorView.theme({
  "&": { height: "100%" },
  ".cm-scroller": { overflow: "auto" }
});

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ documentId, initialContent, entityNames, onDocChanged, onOpenEntityByName }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const composingRef = useRef(false);
    // 回调用 ref，避免每次渲染都重建扩展
    const onDocChangedRef = useRef(onDocChanged);
    onDocChangedRef.current = onDocChanged;
    const onOpenRef = useRef(onOpenEntityByName);
    onOpenRef.current = onOpenEntityByName;

    useImperativeHandle(
      ref,
      () => ({
        getContent: () => viewRef.current?.state.doc.toString() ?? "",
        isComposing: () => composingRef.current,
        insertSnippet: (snippet) => {
          const view = viewRef.current;
          if (!view) return;
          const { from, to } = view.state.selection.main;
          view.dispatch({
            changes: { from, to, insert: snippet },
            selection: { anchor: from + snippet.length },
            scrollIntoView: true
          });
          view.focus();
        },
        getSelectionText: () => {
          const view = viewRef.current;
          if (!view) return null;
          const { from, to } = view.state.selection.main;
          if (from === to) return null;
          return view.state.sliceDoc(from, to);
        },
        replaceSelection: (text) => {
          const view = viewRef.current;
          if (!view) return;
          const { from, to } = view.state.selection.main;
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from, head: from + text.length }
          });
          view.focus();
        }
        // 空依赖：句柄只随挂载创建一次。每次渲染重建句柄会让 React 反复
        // 调用 ref 回调（对象身份变化），与父组件 setState 形成无限循环。
      }),
      []
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      currentNames = entityNames;

      const refField = referenceField((name) => onOpenRef.current(name));

      const state = EditorState.create({
        doc: initialContent,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ base: markdownLanguage }),
          editorTheme,
          refField,
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (update.docChanged) {
              onDocChangedRef.current(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            compositionstart: () => {
              composingRef.current = true;
            },
            compositionend: () => {
              composingRef.current = false;
              // composition 结束后手动补发一次内容（期间调度被挂起）
              const view = viewRef.current;
              if (view) onDocChangedRef.current(view.state.doc.toString());
            },
            blur: () => {
              composingRef.current = false;
            }
          })
        ] as Extension[]
      });

      const view = new EditorView({ state, parent: container });
      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // 切文档时整棵重建（IME 安全策略第 2 条）。initialContent 由会话层保证新鲜。
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documentId]);

    // 实体名集合变化：只重配置 decoration，不碰文档
    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      currentNames = entityNames;
      view.dispatch({ effects: setEntityNamesEffect.of(entityNames) });
    }, [entityNames]);

    return <div ref={containerRef} className="h-full" data-testid="markdown-editor" />;
  }
);
