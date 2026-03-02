# Change Log

All notable changes to the "Mokuji" extension will be documented in this file.

## [0.1.0] - 2026-02-07

### Added

- JavaScript/TypeScript file support (#10)
  - Line comment format: `// # Section`
  - JSDoc comment format: `/** # Section */`
- Custom heading markers setting `mokuji.headingMarkers` (#11)
  - Define custom markers per language (e.g., `["@", "$", "&"]`)
  - Replaces default `#` pattern when configured for a language
- Preserve TOC when WebView is displayed (#13)
  - TOC remains visible during Settings, Markdown preview, etc.
  - File name shown at top of TOC to indicate current file

### Changed

- Updated README to emphasize Mokuji as comment-based extension to standard Outline (#14)
- Added JavaScript/TypeScript and headingMarkers documentation to README

### Removed

- `excludeLanguages` setting (deemed unnecessary)
- `customPatterns` setting (replaced by simpler `headingMarkers`)

## [0.0.2] - 2026-01-18

### Added

- HTML file support with comment format (`<!-- # text -->`)
- Markdown file support with native heading format (`# text`)
- Support for up to 6 hierarchy levels
- English README as main documentation
- Japanese README (README.ja.md)

### Changed

- Updated description to reflect multi-language support
- Added `html` and `markdown` to activation events
- Added `html`, `markdown`, `heading` to keywords

## [0.0.1] - 2026-01-17

### Added

- Initial release of Mokuji extension
- Table of contents generation from CSS/SCSS/LESS comments
- Support for both standard CSS comment format (`/* # text */`)
- Support for SCSS/LESS comment format (`// # text`)
- Three-level hierarchy support (`#`, `##`, `###`)
- Sidebar tree view for navigation
- Click-to-jump functionality to code locations
- Real-time updates when editing files
- Automatic activation for CSS, SCSS, and LESS files

### Features

- Parse comments in CSS files to create a hierarchical table of contents
- Display table of contents in VS Code sidebar
- Navigate to specific code sections by clicking on table of contents items
- Automatically refresh table of contents when switching files or editing
