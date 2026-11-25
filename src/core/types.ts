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
