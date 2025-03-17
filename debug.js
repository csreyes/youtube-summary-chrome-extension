// Simple Node.js script to test the extension build
// This can be run with: node debug.js
// It helps identify if the extension is properly built and if files are in the right places

const fs = require("fs");
const path = require("path");

// Check if dist directory exists
const distDir = path.join(__dirname, "dist");
if (!fs.existsSync(distDir)) {
  console.error('❌ Dist directory does not exist. Run "npm run build" first.');
  process.exit(1);
}

// List of expected files
const expectedFiles = [
  "manifest.json",
  "content-script.js",
  "background.js",
  "popup.js",
  "popup.html",
  "options.js",
  "options.html",
  "styles.css",
  "images/icon16.png",
  "images/icon48.png",
  "images/icon128.png",
];

// Check each file
let allFilesExist = true;
console.log("Checking build files in dist directory:");

expectedFiles.forEach((file) => {
  const filePath = path.join(distDir, file);
  const exists = fs.existsSync(filePath);

  if (exists) {
    const stats = fs.statSync(filePath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    console.log(`✅ ${file} (${fileSizeKB} KB)`);
  } else {
    console.error(`❌ ${file} missing`);
    allFilesExist = false;
  }
});

// Check content of content-script.js for message listener
const contentScriptPath = path.join(distDir, "content-script.js");
if (fs.existsSync(contentScriptPath)) {
  const contentScript = fs.readFileSync(contentScriptPath, "utf8");

  // Check if message listeners are present
  const hasMessageListener = contentScript.includes(
    "chrome.runtime.onMessage.addListener"
  );
  if (hasMessageListener) {
    console.log("✅ Message listener found in content-script.js");
  } else {
    console.error("❌ No message listener found in content-script.js");
  }

  // Check for ping response
  const hasPingResponse = contentScript.includes('action === "ping"');
  if (hasPingResponse) {
    console.log("✅ Ping response found in content-script.js");
  } else {
    console.error("❌ No ping response found in content-script.js");
  }

  // Check for IIFE pattern that could cause initialization issues
  const hasIIFE = contentScript.includes("(function");
  if (hasIIFE) {
    console.log(
      "⚠️ IIFE pattern found in content-script.js - ensure listeners are outside IIFE"
    );
  }
}

// Summary
if (allFilesExist) {
  console.log("\n✅ All expected files exist in the build directory.");
  console.log("\nTo test the extension:");
  console.log("1. Go to chrome://extensions/");
  console.log("2. Enable Developer mode (top right)");
  console.log('3. Click "Load unpacked" and select the dist directory');
  console.log("4. Open a YouTube video and try the extension");
  console.log("\nTo debug:");
  console.log('1. Right-click the extension icon and select "Inspect popup"');
  console.log(
    "2. Open Chrome DevTools on a YouTube page to check content script logs"
  );
  console.log(
    '3. View the background script logs in the extension page\'s "Inspect views: Service Worker"'
  );
} else {
  console.error(
    '\n❌ Some files are missing. Rebuild the extension with "npm run build".'
  );
}

// Provide quick test URL
console.log(
  "\nQuick test: Open this URL in Chrome after loading the extension:"
);
console.log(
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ (video with transcript)"
);
