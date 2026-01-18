# Mokuji - Table of Contents Generator

A VS Code extension that displays a table of contents (Mokuji) in the sidebar based on comments and headings in your files.

[日本語版 README](README.ja.md)

![Mokuji Screenshot](images/screenshot.png)

## Features

- Recognizes special comment formats and headings, automatically generates a hierarchical table of contents
- Displays in an easy-to-read tree view in the sidebar
- Click on table of contents items to instantly jump to the corresponding code line
- Updates the table of contents in real-time when editing files

## Supported Languages

| Language | Format | Example |
|----------|--------|---------|
| CSS | Block comment | `/* # Section */` |
| SCSS/LESS | Line comment | `// # Section` |
| HTML | HTML comment | `<!-- # Section -->` |
| Markdown | Native heading | `# Section` |

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

### Hierarchy Levels

Use `#` symbols to indicate hierarchy depth (up to 6 levels):

- `#` = Level 1
- `##` = Level 2
- `###` = Level 3
- And so on...

### Displaying the Table of Contents

1. Open a supported file (CSS, SCSS, LESS, HTML, or Markdown)
2. Click the "Mokuji" icon in the activity bar
3. The table of contents will be displayed in the sidebar
4. Click on a table of contents item to jump to the corresponding line

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
