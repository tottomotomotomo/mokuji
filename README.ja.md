# Mokuji - 目次ジェネレーター

VS Codeの標準アウトライン機能を拡張し、コメントベースの目次をサイドバーに表示する拡張機能です。

VS Code標準のアウトラインがコード構造（関数、クラス等）を表示するのに対し、Mokujiはコメントや見出しで定義したカスタムセクションを表示します。ファイルのナビゲーション構造を自由にコントロールできます。

[English README](README.md)

![Mokujiのスクリーンショット](images/screenshot.png)

## 機能

- 特別なコメント形式や見出しを認識し、階層的な目次を自動生成
- サイドバーに見やすいツリービューで表示
- 目次項目をクリックして、該当のコード行へ即座にジャンプ
- ファイル編集時にリアルタイムで目次を更新
- 任意の言語に対応するカスタム見出しマーカー

## 対応言語

| 言語 | 形式 | 例 |
|------|------|-----|
| CSS | ブロックコメント | `/* # Section */` |
| SCSS/LESS | 行コメント | `// # Section` |
| HTML | HTMLコメント | `<!-- # Section -->` |
| Markdown | ネイティブ見出し | `# Section` |
| JavaScript/TypeScript | 行コメント | `// # Section` |
| JavaScript/TypeScript | JSDocコメント | `/** # Section */` |

## 使用方法

### CSS / SCSS / LESS

```css
/* # メインセクション */
.main {
  color: blue;
}

/* ## サブセクション */
.sub {
  color: red;
}
```

```scss
// # メインセクション
.main {
  color: blue;
}

// ## サブセクション
.sub {
  color: red;
}
```

### HTML

```html
<!-- # ヘッダーセクション -->
<header>
  <!-- ## ナビゲーション -->
  <nav>...</nav>
</header>

<!-- # メインコンテンツ -->
<main>...</main>
```

### Markdown

```markdown
# メインタイトル

## セクション1

### サブセクション1.1

## セクション2
```

### JavaScript / TypeScript

```javascript
// # メインセクション
function main() {
  // ...
}

// ## サブセクション
function sub() {
  // ...
}

/** # JSDocスタイルセクション */
class MyClass {
  // ...
}
```

### 階層レベル

`#` 記号で階層の深さを指定します（最大6レベル）：

- `#` = レベル1
- `##` = レベル2
- `###` = レベル3
- 以降同様...

### 目次の表示

1. 対応ファイル（CSS、SCSS、LESS、HTML、Markdown、JavaScript、TypeScript）を開く
2. アクティビティバーの「Mokuji」アイコンをクリック
3. サイドバーに目次が表示されます
4. 目次項目をクリックすると、該当行へジャンプします

## 設定

### カスタム見出しマーカー

`settings.json`の`mokuji.headingMarkers`で、任意の言語にカスタム見出しマーカーを定義できます：

```json
"mokuji.headingMarkers": {
  "python": ["@", "$", "&"],
  "ruby": ["MARK:", "MARK::", "MARK:::"]
}
```

配列の各要素が見出しレベル（1〜6）に対応します。例えば、上記のPython設定では：

```python
# @ メインセクション      <- レベル1
# $ サブセクション        <- レベル2
# & 詳細                  <- レベル3
```

言語に`headingMarkers`が設定されている場合、その言語のデフォルトの`#`パターンは無効になります。

## インストール

### VS Code Marketplaceから

VS Codeの拡張機能ビューで「Mokuji」を検索してインストール。

### 開発版の実行

1. このリポジトリをクローン
2. `npm install` で依存関係をインストール
3. `npm run compile` でコンパイル
4. F5キーを押してExtension Development Hostを起動

## 開発

```bash
# 依存関係のインストール
npm install

# TypeScriptのコンパイル
npm run compile

# ウォッチモード（自動コンパイル）
npm run watch
```

## ライセンス

MIT
