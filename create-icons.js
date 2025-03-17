// Simple Node.js script to create placeholder icon files
// Run with: node create-icons.js

const fs = require("fs");
const path = require("path");

// Create the images directory if it doesn't exist
const imagesDir = path.join(__dirname, "images");
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Function to create a simple colored square as a PNG
function createColoredSquare(size, color, outputPath) {
  // Create a 1x1 pixel buffer with the specified color
  const buffer = Buffer.alloc(size * size * 4); // 4 bytes per pixel (RGBA)

  // Fill the buffer with the color
  for (let i = 0; i < size * size; i++) {
    const offset = i * 4;
    // Red component
    buffer[offset] = (color >> 16) & 0xff;
    // Green component
    buffer[offset + 1] = (color >> 8) & 0xff;
    // Blue component
    buffer[offset + 2] = color & 0xff;
    // Alpha component (fully opaque)
    buffer[offset + 3] = 0xff;
  }

  // Write a simple text file indicating it's a placeholder
  // In a real implementation, you'd write actual PNG data
  const content = `This is a placeholder for a ${size}x${size} icon with color #${color
    .toString(16)
    .padStart(6, "0")}.
For a real extension, replace this with an actual PNG icon.`;

  fs.writeFileSync(outputPath, content);

  console.log(`Created placeholder icon: ${outputPath}`);
}

// Create placeholder icons
const iconSizes = [16, 48, 128];
const youtubeRed = 0xcc0000; // YouTube red color

iconSizes.forEach((size) => {
  const iconPath = path.join(imagesDir, `icon${size}.png`);
  createColoredSquare(size, youtubeRed, iconPath);
});

console.log("Placeholder icons created successfully!");
console.log("Remember to replace these with real icons before publishing.");
