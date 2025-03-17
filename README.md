# YouTube AI Summarizer Chrome Extension

A Chrome extension that adds a "Summarize with AI" button to YouTube video pages, allowing you to get an AI-generated summary of the video's transcript.

## Features

- **Automatic Transcript Detection**: Automatically detects when a YouTube video has a transcript available
- **One-Click Summarization**: Simply click the "Summarize with AI" button to generate a summary
- **Customizable AI Models**: Configure the extension to use different LLM models (OpenAI GPT-3.5, GPT-4, or others)
- **Custom Prompts**: Customize the prompt template used for generating summaries
- **Responsive UI**: Clean, modern interface that works seamlessly with YouTube's design
- **Dark Mode Support**: Automatically adapts to light or dark theme

## Development

### Prerequisites

- Node.js (v14 or newer)
- npm or yarn

### Installation

1. Clone this repository

```bash
git clone https://github.com/yourusername/youtube-summary-chrome-extension.git
cd youtube-summary-chrome-extension
```

2. Install dependencies

```bash
npm install
```

3. Build the extension

```bash
npm run build
```

This will create a `dist` directory with the built extension.

### Development Mode

For development with hot reloading:

```bash
npm run dev
```

### Packaging

To create a zip file for distribution:

```bash
npm run package
```

## Installation in Chrome

### Loading the Unpacked Extension

1. Build the extension using `npm run build`
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the `dist` directory from this project
5. The extension is now installed!

## Setup

1. After installation, click on the extension icon in the toolbar
2. Click "Options" to open the configuration page
3. Enter your OpenAI API key (or another compatible LLM service)
4. Customize other settings as desired
5. Click "Save Options"

## How to Use

1. Navigate to any YouTube video that has a transcript available
2. Look for the "Summarize with AI" button near the transcript button
3. Click the button to generate a summary
4. The AI-generated summary will appear in a modal overlay
5. You can close the modal by clicking the "X" button, pressing ESC, or clicking outside the modal

## Privacy & Data Usage

- This extension only sends transcript data to the configured AI API service
- Your API key is stored locally in your browser and is only sent to the corresponding API service
- No other tracking or data collection is performed

## Requirements

- A modern web browser that supports Chrome extensions (Chrome, Edge, Brave, etc.)
- An API key for OpenAI or another compatible LLM service

## Technical Details

This extension is built using:

- JavaScript (ES6+)
- Chrome Extension Manifest V3
- Webpack for bundling
- Babel for JavaScript transpilation

## Troubleshooting

**The "Summarize with AI" button doesn't appear**

- Make sure you're on a YouTube video page that has a transcript available
- Try refreshing the page
- Check if the extension is enabled in your browser

**Error when generating summary**

- Verify your API key is correct in the extension options
- Check your API usage limits/quota
- Ensure you have a stable internet connection

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
