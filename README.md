# Mokuji - Table of Contents Generator

A VS Code extension that extends the standard Outline feature by providing comment-based table of contents in the sidebar.

While VS Code's built-in Outline shows code structure (functions, classes, etc.), Mokuji displays custom sections defined by comments and headings, giving you full control over your file's navigation structure.

[日本語版 README](README.ja.md)

![Mokuji Screenshot](images/screenshot.png)

## Features

- Recognizes special comment formats and headings, automatically generates a hierarchical table of contents
- Displays in an easy-to-read tree view in the sidebar
- Click on table of contents items to instantly jump to the corresponding code line
- Updates the table of contents in real-time when editing files
- Customizable heading markers for any language

## Supported Languages

| Language | Format | Example |
|----------|--------|---------|
| CSS | Block comment | `/* # Section */` |
| SCSS/LESS | Line comment | `// # Section` |
| HTML | HTML comment | `<!-- # Section -->` |
| Markdown | Native heading | `# Section` |
| JavaScript/TypeScript | Line comment | `// # Section` |
| JavaScript/TypeScript | JSDoc comment | `/** # Section */` |

## Usage

### CSS / SCSS / LESS

```css
/* # Main Section */
.main {
  color: blue;
}

/* ## Sub Section */
.sub {
  color: red;
}
```

```scss
// # Main Section
.main {
  color: blue;
}

// ## Sub Section
.sub {
  color: red;
}
```

### HTML

```html
<!-- # Header Section -->
<header>
  <!-- ## Navigation -->
  <nav>...</nav>
</header>

<!-- # Main Content -->
<main>...</main>
```

### Markdown

```markdown
# Main Title

## Section 1

### Subsection 1.1

## Section 2
```

### JavaScript / TypeScript

```javascript
// # Main Section
function main() {
  // ...
}

// ## Sub Section
function sub() {
  // ...
}

/** # JSDoc Style Section */
class MyClass {
  // ...
}
```

### Hierarchy Levels

Use `#` symbols to indicate hierarchy depth (up to 6 levels):

- `#` = Level 1
- `##` = Level 2
- `###` = Level 3
- And so on...

### Displaying the Table of Contents

1. Open a supported file (CSS, SCSS, LESS, HTML, Markdown, JavaScript, or TypeScript)
2. Click the "Mokuji" icon in the activity bar
3. The table of contents will be displayed in the sidebar
4. Click on a table of contents item to jump to the corresponding line

## Configuration

### Custom Heading Markers

You can define custom heading markers for any language using `mokuji.headingMarkers` in your `settings.json`:

```json
"mokuji.headingMarkers": {
  "python": ["@", "$", "&"],
  "ruby": ["MARK:", "MARK::", "MARK:::"]
}
```

Each array element corresponds to a heading level (1-6). For example, with the Python configuration above:

```python
# @ Main Section        <- Level 1
# $ Sub Section         <- Level 2
# & Details             <- Level 3
```

When `headingMarkers` is configured for a language, it replaces the default `#` pattern for that language.

## Installation

### From VS Code Marketplace

Search for "Mokuji" in the VS Code Extensions view and install.

### Running the Development Version

1. Clone this repository
2. Install dependencies with `npm install`
3. Compile with `npm run compile`
4. Press F5 to launch the Extension Development Host

## Development

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode (auto-compile)
npm run watch
```

## License

MIT
