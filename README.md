# YouTube Summary Chrome Extension

A Chrome extension that uses AI to generate concise summaries of YouTube videos using their transcripts. Get the key points of any video without watching the entire content.

## Features

- Automatically summarizes YouTube videos
- Uses AI to extract key information from video transcripts
- Timestamp support for easy navigation to specific parts of the video
- Interactive chat functionality to ask questions about the video content
- Clean, non-intrusive UI that integrates with YouTube's interface

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the directory of this repository
5. The extension will now be active when you browse YouTube videos

## Usage

1. Navigate to any YouTube video
2. Look for the "Summarize" button near the video controls
3. Click the button to generate a summary
4. View the AI-generated summary and navigate through key points

## Development Setup

### Prerequisites

- Node.js (v14 or newer)
- npm
- Chrome browser

### Installation

1. Clone this repository:

   ```
   git clone <your-repository-url>
   cd youtube-summary-chrome-extension
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Build the extension:

   ```
   npm run build
   ```

   Or for development with auto-rebuild:

   ```
   npm run watch
   ```

### Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top-right corner
3. Click "Load unpacked" and select the `dist` directory from this project
4. The extension should now appear in your extensions list

### Development Workflow

1. Run `npm run watch` to start the development server with auto-rebuild
2. Make changes to your code
3. When changes are saved, webpack will automatically rebuild the extension
4. Go to `chrome://extensions/` and click the refresh icon on the extension card
5. Test your changes by opening a YouTube video page

### Available Scripts

- `npm run build`: Build the extension for production
- `npm run dev`: Build with watch mode (without cleaning)
- `npm run watch`: Clean and build with watch mode
- `npm run clean`: Remove the dist directory
- `npm run package`: Build and create a zip file for distribution
- `npm run debug`: Run diagnostics on the built extension

## Project Structure

- `src/`: Source code
  - `background.js`: Background script for the extension
  - `content-script.js`: Content script injected into YouTube pages
  - `popup.js`: Script for the extension popup
  - `options.js`: Script for the options page
  - `styles.css`: Styles for the extension
- `dist/`: Build output (generated)
- `images/`: Extension icons
- `webpack.config.js`: Webpack configuration
- `manifest.json`: Extension manifest file

## License

MIT
