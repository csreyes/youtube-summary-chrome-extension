// This script generates placeholder icons when built
// It will create basic SVG icons that will be converted to PNG during build

// Function to create a canvas element with a given size
function createCanvas(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

// Generate a simple icon with the YouTube colors and a summary symbol
function generateIcon(size) {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#FF0000"; // YouTube red
  ctx.fillRect(0, 0, size, size);

  // Summary symbol (three horizontal lines)
  ctx.fillStyle = "#FFFFFF";
  const lineHeight = Math.max(2, Math.floor(size / 12));
  const lineWidth = Math.floor(size * 0.6);
  const startX = Math.floor((size - lineWidth) / 2);
  const startY = Math.floor(size / 3);
  const gap = Math.floor(size / 8);

  // Draw three lines representing text/summary
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(startX, startY + i * gap, lineWidth, lineHeight);
  }

  return canvas.toDataURL("image/png");
}

// Export icons in different sizes
export const icon16 = generateIcon(16);
export const icon48 = generateIcon(48);
export const icon128 = generateIcon(128);
