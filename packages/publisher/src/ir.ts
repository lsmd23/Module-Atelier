export type Severity = "info" | "warning" | "error" | "fatal";

export interface SourceLocation {
  documentId: string;
  startOffset: number;
  endOffset: number;
  line: number;
  column: number;
}

export interface Diagnostic {
  code:
    | "INVALID_DIRECTIVE"
    | "UNSUPPORTED_NODE"
    | "MISSING_ENTITY"
    | "MISSING_ASSET"
    | "UNSAFE_ASSET"
    | "TABLE_TOO_WIDE"
    | "FONT_MISSING"
    | "PAGINATION_TIMEOUT"
    | "RENDER_TIMEOUT";
  severity: Severity;
  message: string;
  documentId?: string;
  sourceLocation?: SourceLocation;
  nodeType?: ModuleNode["nodeType"];
  details?: Record<string, unknown>;
}

export interface BaseNode {
  id: string;
  nodeType: ModuleNode["nodeType"];
  sourceLocation?: SourceLocation;
  metadata?: Record<string, unknown>;
}

export interface DocumentNode extends BaseNode {
  nodeType: "document";
  documentId: string;
  title: string;
  subtitle?: string;
  children: ModuleNode[];
}

export interface SectionNode extends BaseNode {
  nodeType: "section";
  level: number;
  number?: string;
  title: string;
  subtitle?: string;
  children: ModuleNode[];
}

export interface HeadingNode extends BaseNode {
  nodeType: "heading";
  level: number;
  number?: string;
  title: string;
  subtitle?: string;
}

export interface ParagraphNode extends BaseNode {
  nodeType: "paragraph";
  text: string;
}

export interface ListNode extends BaseNode {
  nodeType: "list";
  ordered: boolean;
  items: string[];
}

export interface QuoteNode extends BaseNode {
  nodeType: "quote";
  text: string;
}

export type BoxKind = "readaloud" | "rule" | "development" | "treasure" | "experience";

export interface CalloutNode extends BaseNode {
  nodeType: "callout";
  kind: BoxKind;
  title: string;
  children: ModuleNode[];
}

export interface StatBlockNode extends BaseNode {
  nodeType: "statblock";
  name: string;
  subtitle: string;
  armorClass: string;
  hitPoints: string;
  speed: string;
  abilities: Array<{ name: string; score: string; modifier: string }>;
  traits: Array<{ name: string; text: string }>;
  actions: Array<{ name: string; text: string }>;
}

export interface TableNode extends BaseNode {
  nodeType: "table";
  headers: string[];
  rows: string[][];
}

export interface ImageNode extends BaseNode {
  nodeType: "image";
  assetId: string;
  alt: string;
  layout: "block" | "full" | "column";
  caption?: string;
  src: string;
}

export interface EntityReferenceNode extends BaseNode {
  nodeType: "entityReference";
  reference: string;
  entityId?: string;
  displayName?: string;
}

export interface ColumnsNode extends BaseNode {
  nodeType: "columns";
  count: number;
  children: ModuleNode[];
}

export interface PageBreakNode extends BaseNode {
  nodeType: "pageBreak";
}

export interface HorizontalRuleNode extends BaseNode {
  nodeType: "horizontalRule";
}

export type ModuleNode =
  | DocumentNode
  | SectionNode
  | HeadingNode
  | ParagraphNode
  | ListNode
  | QuoteNode
  | CalloutNode
  | StatBlockNode
  | TableNode
  | ImageNode
  | EntityReferenceNode
  | ColumnsNode
  | PageBreakNode
  | HorizontalRuleNode;

export interface ProjectMetadata {
  title: string;
  subtitle?: string;
  author?: string;
  language: "zh-CN" | "en";
  theme: "classic-fantasy@1";
}

export interface ModuleDocumentInput {
  id: string;
  title: string;
  content: string;
}

export interface PublishAsset {
  id: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
  width: number;
  height: number;
  safeLocation: string;
  caption?: string;
}

export interface PublishSnapshot {
  schemaVersion: "publish-snapshot@0.1";
  project: ProjectMetadata;
  documents: ModuleDocumentInput[];
  entities?: Array<{ id: string; type: string; name: string; structuredData: Record<string, unknown> }>;
  assets?: PublishAsset[];
}

export interface ModuleIR {
  schemaVersion: "module-ir@0.1";
  project: ProjectMetadata;
  documents: DocumentNode[];
  diagnostics: Diagnostic[];
}
