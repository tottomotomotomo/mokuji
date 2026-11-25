// VS Code API に依存しない純粋な共通型定義

export type PatternName = 'slash' | 'block' | 'html' | 'md' | 'jsdoc' | 'hashComment' | 'jsxBlock';

// .vscode/mokuji.json のワークスペース設定の型
export interface WorkspacePattern {
    regex: string;      // 正規表現文字列
    levelGroup: number; // レベルを表すキャプチャグループ番号（1-indexed）
    labelGroup: number; // ラベルを表すキャプチャグループ番号（1-indexed）
}

export interface WorkspaceConfig {
    parsers: Record<string, { patterns: WorkspacePattern[] }>;
}

export interface TocNode {
    label: string;
    level: number;
    line: number; // 0-indexed
    children: TocNode[];
}

export interface ParseOptions {
    languageId: string;
    headingMarkers?: Record<string, string[]>;
    workspaceConfig?: WorkspaceConfig | null;
}

// --- v0.3.0: 見出し Lint & QuickFix 用型定義 ---

export type LintIssueCode = 'missing-space' | 'skipped-level' | 'duplicate-heading';

export type LintSeverity = 'warning' | 'information';

export interface LintIssue {
    code: LintIssueCode;
    severity: LintSeverity;
    message: string;
    line: number;        // 0-indexed
    startColumn: number; // 0-indexed
    endColumn: number;   // 0-indexed
    replacement?: string; // QuickFix 適用時の置換後行テキスト全体
}

// --- v0.3.0: AI / ルールベース見出し提案 & ルール文生成用型定義 ---

export type AiMode = 'auto' | 'off';

export interface SectionSuggestion {
    line: number;  // 0-indexed: この行の直前に見出しコメント行を挿入する
    level: number; // 1..6
    label: string;
}

export interface OutlineSymbolInput {
    name: string;
    kindName: string; // e.g. 'Class', 'Function', 'Method', 'Interface'
    line: number;     // 0-indexed start line
    children?: OutlineSymbolInput[];
}

export type AiInstructionTarget = 'agents-md' | 'copilot-instructions' | 'claude-md';
