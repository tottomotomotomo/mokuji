# Mokuji - CSS Table of Contents

A VS Code extension that displays a table of contents (Mokuji) in the sidebar based on comments in CSS files.

![Mokuji Screenshot](images/screenshot.png)

## Features

- Recognizes special comment formats in CSS files and automatically generates a hierarchical table of contents
- Displays in an easy-to-read tree view in the sidebar
- Click on table of contents items to instantly jump to the corresponding code line
- Updates the table of contents in real-time when editing files
- Supports CSS, SCSS, and LESS files

## Usage

### Comment Format

Two comment formats are supported:

#### Standard CSS Format

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

#### SCSS/LESS Format

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

### Hierarchy Levels

| Level | CSS Standard | SCSS/LESS |
|-------|--------------|-----------|
| Level 1 | `/* # Text */` | `// # Text` |
| Level 2 | `/* ## Text */` | `// ## Text` |
| Level 3 | `/* ### Text */` | `// ### Text` |

### Displaying the Table of Contents

1. Open a CSS file
2. Click the "Mokuji" icon in the activity bar
3. The table of contents will be displayed in the sidebar
4. Click on a table of contents item to jump to the corresponding line

## Installation

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
