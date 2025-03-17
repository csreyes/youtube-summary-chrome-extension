/**
 * Extension Auto-Reload Helper Script
 *
 * This script is meant to help developers understand how to enable live reloading for Chrome extensions.
 *
 * Steps for enabling live reload of your Chrome extension:
 *
 * 1. Run the "npm run watch" script which will:
 *    - Clean the dist directory
 *    - Build your extension files
 *    - Watch for changes and rebuild automatically
 *
 * 2. In Chrome:
 *    - Go to chrome://extensions/
 *    - Enable Developer Mode (top right toggle)
 *    - Load your extension using "Load unpacked" and select the "dist" folder
 *
 * 3. When files change:
 *    - webpack will automatically rebuild the files in the dist folder
 *    - You'll need to manually click the refresh icon for your extension in chrome://extensions/
 *    - If you have the extension popup or options page open, refresh those pages
 *    - For content script changes, refresh any open YouTube pages
 *
 * Advanced: Chrome Extensions Hot Reload
 * --------------------------------------
 * To achieve true hot reload, you would need:
 *
 * 1. A browser extension that refreshes extensions, such as:
 *    - "Extensions Reloader" from Chrome Web Store
 *    - "Chrome Extensions Reloader" from Chrome Web Store
 *
 * 2. Or implement a more complex setup using:
 *    - A browser extension API to reload the extension programmatically
 *    - A websocket server to communicate between your build process and the extension
 *
 * For simplicity, the manual reload approach is recommended for most development scenarios.
 */

console.log("Extension development helper loaded!");
console.log(
  "Run 'npm run watch' to start development with auto-rebuild on file changes."
);
console.log(
  "Remember to click the refresh icon in chrome://extensions/ after each build."
);
