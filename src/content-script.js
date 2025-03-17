// content-script.js
// The styles are loaded via manifest.json content_scripts CSS

// Add debugging information
console.log("[YouTube AI Summarizer] Content script loaded");

// Track if initialization is complete
let isInitialized = false;
// Track if a summary request is in progress
let isSummaryInProgress = false;
// Track if we've added the related videos button
let relatedVideoButtonAdded = false;

// Define isVideoPage function outside IIFE so it's available to all message handlers
function isVideoPage() {
  const isVideo = window.location.pathname.includes("/watch");
  console.log(
    "[YouTube AI Summarizer] Is video page:",
    isVideo,
    "Path:",
    window.location.pathname
  );
  return isVideo;
}

// Function to extract summary content from different message formats
function extractSummaryContent(message) {
  // Check if summary is directly available
  if (message.summary) {
    return message.summary;
  }

  // Check for other common patterns
  if (message.data && message.data.summary) {
    return message.data.summary;
  }

  if (message.payload && message.payload.summary) {
    return message.payload.summary;
  }

  if (message.result && message.result.summary) {
    return message.result.summary;
  }

  // For messages that might have the content directly in a field
  if (typeof message.text === "string" && message.text.length > 20) {
    return message.text;
  }

  if (typeof message.content === "string" && message.content.length > 20) {
    return message.content;
  }

  // Log the full message structure for debugging
  console.error(
    "[YouTube AI Summarizer] Could not extract summary from message:",
    JSON.stringify(message).substring(0, 1000)
  );

  // Return null to indicate failure
  return null;
}

// Add message listener immediately (outside the IIFE) to ensure it's registered early
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(
    "[YouTube AI Summarizer] Content script received message:",
    message
  );

  // Respond to ping immediately to confirm content script is active
  if (message.action === "ping") {
    console.log("[YouTube AI Summarizer] Responding to ping");
    sendResponse({ status: "ready", initialized: isInitialized });
    return false; // Don't keep the channel open longer than needed
  }

  // Handle summary results outside the IIFE to ensure they're caught
  if (
    message.type === "SUMMARY_RESULT" ||
    message.action === "display_summary"
  ) {
    try {
      // For debugging different message formats - log the whole message structure
      console.log(
        "[YouTube AI Summarizer] Full message structure:",
        JSON.stringify(message).substring(0, 500)
      );

      // Extract the summary content from the message
      const summaryContent = extractSummaryContent(message);

      console.log(
        "[YouTube AI Summarizer] Extracted summary content with length:",
        summaryContent?.length || 0
      );

      // Enhanced logging for LLM response
      if (summaryContent) {
        console.log(
          "[YouTube AI Summarizer] LLM response received, first 200 chars:",
          typeof summaryContent === "string"
            ? summaryContent.substring(0, 200)
            : JSON.stringify(summaryContent).substring(0, 200)
        );
      }

      // Hide loading indicator if it exists
      hideLoadingIndicator();

      // Reset the state
      isSummaryInProgress = false;

      // Make sure we have a summary to display
      if (!summaryContent) {
        console.error(
          "[YouTube AI Summarizer] Received null or undefined summary"
        );
        displaySummaryModal("Error: No summary received. Please try again.");
        return false;
      }

      // Display the summary
      displaySummaryModal(summaryContent);
    } catch (error) {
      console.error(
        "[YouTube AI Summarizer] Error handling summary message:",
        error
      );
      hideLoadingIndicator();
      isSummaryInProgress = false;

      // Try to display error message in modal
      try {
        displaySummaryModal(
          "Error processing summary: " + (error.message || "Unknown error")
        );
      } catch (modalError) {
        console.error(
          "[YouTube AI Summarizer] Failed to display error modal:",
          modalError
        );
      }
    }
    return false; // No async response needed
  }

  // Handle summarize action
  if (message.action === "initiateSummarize") {
    console.log("[YouTube AI Summarizer] Received initiateSummarize message");
    try {
      if (isVideoPage()) {
        // Don't start if already in progress
        if (isSummaryInProgress) {
          console.log("[YouTube AI Summarizer] Summary already in progress");
          sendResponse({
            status: "success",
            message: "Summary already in progress",
          });
          return false;
        }

        // Show loading indicator
        showLoadingIndicator();

        // Set state
        isSummaryInProgress = true;

        // Don't await here - we'll respond immediately and do the work async
        handleSummarizeClick();
        sendResponse({ status: "success" });
      } else {
        sendResponse({
          status: "error",
          message: "Not on a YouTube video page",
        });
      }
    } catch (e) {
      console.error(
        "[YouTube AI Summarizer] Error processing initiateSummarize:",
        e
      );
      sendResponse({ status: "error", message: e.message || "Unknown error" });
    }
    return false; // We've already sent the response
  }

  // Default behavior - don't keep message channel open
  return false;
});

// Show loading indicator
function showLoadingIndicator() {
  console.log("[YouTube AI Summarizer] Showing loading indicator");

  // Remove any existing modal
  const existingModal = document.getElementById("ai-summary-modal-container");
  if (existingModal) {
    document.body.removeChild(existingModal);
  }

  // Create overlay
  const overlay = document.createElement("div");
  overlay.id = "ai-summary-modal-container";
  overlay.className = "ai-summary-overlay";

  // Create modal
  const modal = document.createElement("div");
  modal.className = "ai-summary-modal";

  // Header with title and close button
  const header = document.createElement("div");
  header.className = "ai-summary-header";

  const title = document.createElement("h3");
  title.textContent = "AI Summary";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.className = "ai-summary-close-btn";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
    isSummaryInProgress = false; // Reset state if user closes modal
  });
  header.appendChild(closeBtn);

  modal.appendChild(header);

  // Content area with the loading spinner
  const content = document.createElement("div");
  content.className = "ai-summary-content";

  // Add loading animation
  const loadingDiv = document.createElement("div");
  loadingDiv.className = "ai-summary-loading";
  loadingDiv.innerHTML = `
    <div class="ai-summary-spinner"></div>
    <p>Generating summary, please wait...</p>
    <p class="ai-summary-loading-info">This may take up to 30 seconds depending on the video length</p>
  `;
  content.appendChild(loadingDiv);

  modal.appendChild(content);

  // Add footer with attribution
  const footer = document.createElement("div");
  footer.className = "ai-summary-footer";
  footer.innerHTML = "<p>Powered by YouTube AI Summarizer</p>";
  modal.appendChild(footer);

  // Add to DOM
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Add event listeners to timestamp elements
  attachTimestampClickHandlers();

  // Add click handler to close on overlay click but not modal click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  // Add escape key handler
  document.addEventListener("keydown", function escapeHandler(e) {
    if (e.key === "Escape") {
      const modalContainer = document.getElementById(
        "ai-summary-modal-container"
      );
      if (modalContainer) {
        document.body.removeChild(modalContainer);
        isSummaryInProgress = false; // Reset state if user closes modal
      }
      document.removeEventListener("keydown", escapeHandler);
    }
  });
}

// Hide loading indicator
function hideLoadingIndicator() {
  console.log("[YouTube AI Summarizer] Hiding loading indicator");
  const loadingModal = document.getElementById("ai-summary-modal-container");
  if (loadingModal) {
    document.body.removeChild(loadingModal);
  }
}

// Function to safely send messages that might fail
function safeSendMessage(message) {
  try {
    // Use a promise to handle the error properly
    return new Promise((resolve, reject) => {
      chrome.runtime
        .sendMessage(message)
        .then(resolve)
        .catch((error) => {
          console.log(
            "[YouTube AI Summarizer] Send message error (expected):",
            error.message
          );
          // This is expected in some cases, so we resolve with null instead of rejecting
          resolve(null);
        });
    });
  } catch (e) {
    console.log(
      "[YouTube AI Summarizer] Send message exception (expected):",
      e.message
    );
    return Promise.resolve(null);
  }
}

// Notify that content script is ready immediately
safeSendMessage({
  type: "CONTENT_SCRIPT_READY",
}).then(() => {
  console.log("[YouTube AI Summarizer] Ready message sent (or safely failed)");
});

// Create a reference to the handle summarize click function for the outside message handler
let handleSummarizeClick;

// Function to display the summary modal (outside IIFE for immediate availability)
function displaySummaryModal(summary) {
  console.log(
    "[YouTube AI Summarizer] Displaying summary modal, content length:",
    summary?.length || (summary?.data ? JSON.stringify(summary.data).length : 0)
  );

  // Log additional details about the summary for debugging
  if (summary) {
    console.log(
      "[YouTube AI Summarizer] Summary type:",
      typeof summary,
      "Is object?",
      typeof summary === "object" && summary !== null
    );

    // Check if we have a structured JSON summary
    if (summary.type === "json_summary" && summary.data) {
      console.log(
        "[YouTube AI Summarizer] JSON summary detected, structure:",
        Object.keys(summary.data)
      );
    } else if (typeof summary === "string") {
      // Log structure info about string summary
      const hasMarkdown = summary.includes("#") || summary.includes("-");
      const paragraphCount = summary.split("\n\n").length;
      console.log(
        "[YouTube AI Summarizer] Summary details: Has markdown?",
        hasMarkdown,
        "Paragraph count:",
        paragraphCount,
        "First 100 chars:",
        summary.substring(0, 100)
      );
    } else if (summary && typeof summary === "object") {
      // Log structure of object summary
      console.log(
        "[YouTube AI Summarizer] Summary object structure:",
        JSON.stringify(summary).substring(0, 500)
      );
    }
  }

  // Remove any existing modal
  const existingModal = document.getElementById("ai-summary-modal-container");
  if (existingModal) {
    document.body.removeChild(existingModal);
  }

  // Create overlay
  const overlay = document.createElement("div");
  overlay.id = "ai-summary-modal-container";
  overlay.className = "ai-summary-overlay";

  // Create modal
  const modal = document.createElement("div");
  modal.className = "ai-summary-modal";
  modal.style.fontSize = "16px"; // Base font size for better readability

  // Header with title and close button
  const header = document.createElement("div");
  header.className = "ai-summary-header";

  const title = document.createElement("h3");
  title.textContent = "AI Summary";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.className = "ai-summary-close-btn";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });
  header.appendChild(closeBtn);

  modal.appendChild(header);

  // Content area with the summary
  const content = document.createElement("div");
  content.className = "ai-summary-content";
  // Add some extra styling for better readability
  content.style.lineHeight = "1.6";
  content.style.fontSize = "16px";
  content.style.padding = "5px 20px 15px 20px"; // Add more padding

  // Process the summary based on its type
  try {
    // Check if we have a structured JSON summary
    if (summary.type === "json_summary" && summary.data) {
      // Render the JSON summary with our enhanced formatter
      renderJsonSummary(summary.data, content);
    } else if (summary.type === "text_summary" && summary.text) {
      // Handle the text summary format
      renderTextSummary(summary.text, content);
    } else if (typeof summary === "string") {
      // Check for error message
      if (summary.startsWith("Error:")) {
        const errorDiv = document.createElement("div");
        errorDiv.className = "ai-summary-error";
        errorDiv.innerText = summary;
        content.appendChild(errorDiv);
      }
      // Handle markdown formatting
      else if (summary.includes("#") || summary.includes("-")) {
        // Enhanced markdown parser with timestamp handling
        const formattedContent = processSummaryWithTimestamps(summary);
        content.innerHTML = formattedContent;
      } else {
        // Check if this looks like a bullet list with • characters
        if (summary.includes("•")) {
          // This is likely a bullet list - use special formatting
          content.innerHTML = formatBulletedSummary(summary);
        } else {
          // Simple string summary with enhanced formatting
          const paragraphs = summary.split("\n\n");
          paragraphs.forEach((paragraph) => {
            if (paragraph.trim()) {
              // Check for timestamps in the paragraph
              const p = document.createElement("div");
              p.style.marginBottom = "16px";

              // Process potential timestamps
              const processedPara = processTimestampsInText(paragraph);
              p.innerHTML = processedPara;

              content.appendChild(p);
            }
          });
        }
      }
    } else if (summary && typeof summary === "object") {
      // Additional logging for debugging object structure
      console.log(
        "[YouTube AI Summarizer] Summary object structure:",
        JSON.stringify(summary).substring(0, 500)
      );

      // Handle structured summary objects
      if (summary.html) {
        // Add timestamp processing to HTML content if possible
        content.innerHTML = enhanceHtmlWithTimestampsStyling(summary.html);
      } else if (summary.text || summary.summary) {
        // Use summary field if available (for backward compatibility)
        const summaryText = summary.text || summary.summary;

        // Create formatted sections with enhanced styling
        const mainSummary = document.createElement("div");
        mainSummary.className = "ai-summary-section";
        mainSummary.style.fontSize = "16px";
        mainSummary.style.lineHeight = "1.6";
        mainSummary.style.marginBottom = "20px";

        // Process potential timestamps in main summary
        mainSummary.innerHTML = processTimestampsInText(summaryText);
        content.appendChild(mainSummary);

        // Add any additional sections
        if (summary.keyPoints && Array.isArray(summary.keyPoints)) {
          const keyPointsSection = document.createElement("div");
          keyPointsSection.className = "ai-summary-key-points";
          keyPointsSection.style.backgroundColor = "#f8f8f8";
          keyPointsSection.style.padding = "16px";
          keyPointsSection.style.borderRadius = "8px";
          keyPointsSection.style.marginTop = "20px";

          const keyPointsTitle = document.createElement("h4");
          keyPointsTitle.textContent = "Key Points";
          keyPointsTitle.style.marginTop = "0";
          keyPointsTitle.style.marginBottom = "15px";
          keyPointsTitle.style.color = "#cc0000";
          keyPointsTitle.style.fontSize = "18px";
          keyPointsSection.appendChild(keyPointsTitle);

          const keyPointsList = document.createElement("ul");
          keyPointsList.style.paddingLeft = "24px";
          keyPointsList.style.marginBottom = "0";

          summary.keyPoints.forEach((point) => {
            const li = document.createElement("li");
            li.style.marginBottom = "10px";
            li.style.position = "relative";

            // Process potential timestamps in key points
            li.innerHTML = processTimestampsInText(point);
            keyPointsList.appendChild(li);
          });
          keyPointsSection.appendChild(keyPointsList);
          content.appendChild(keyPointsSection);
        }
      } else {
        // Fallback for unknown object structure - try to extract any text content
        let extractedText = "";

        // Look for any property that might contain the summary text
        for (const key in summary) {
          if (typeof summary[key] === "string" && summary[key].length > 50) {
            extractedText = summary[key];
            break;
          }
        }

        if (extractedText) {
          const p = document.createElement("div");
          p.style.marginBottom = "16px";
          p.style.lineHeight = "1.6";

          // Process potential timestamps in extracted text
          p.innerHTML = processTimestampsInText(extractedText);
          content.appendChild(p);
        } else {
          // Last resort - stringify the object
          const p = document.createElement("p");
          p.innerText = "Summary: " + JSON.stringify(summary, null, 2);
          content.appendChild(p);
        }
      }
    } else {
      // Handle unexpected summary type
      const errorDiv = document.createElement("div");
      errorDiv.className = "ai-summary-error";
      errorDiv.innerText = "Error: Received unexpected summary format.";
      content.appendChild(errorDiv);
    }
  } catch (error) {
    console.error("[YouTube AI Summarizer] Error processing summary:", error);
    const errorDiv = document.createElement("div");
    errorDiv.className = "ai-summary-error";
    errorDiv.innerText = "Error displaying summary: " + error.message;
    content.appendChild(errorDiv);
  }

  modal.appendChild(content);

  // Add footer with attribution
  const footer = document.createElement("div");
  footer.className = "ai-summary-footer";
  footer.innerHTML = "<p>Powered by YouTube AI Summarizer</p>";
  modal.appendChild(footer);

  // Add to DOM
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Add event listeners to timestamp elements
  attachTimestampClickHandlers();

  // Add click handler to close on overlay click but not modal click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  // Add escape key handler
  document.addEventListener("keydown", function escapeHandler(e) {
    if (e.key === "Escape") {
      const modalContainer = document.getElementById(
        "ai-summary-modal-container"
      );
      if (modalContainer) {
        document.body.removeChild(modalContainer);
      }
      document.removeEventListener("keydown", escapeHandler);
    }
  });
}

// Enhanced function to process markdown summaries with timestamps
function processSummaryWithTimestamps(markdown) {
  // Check for overview section and enhance it
  let enhancedMarkdown = markdown;

  // First, find if there's an "Overview:" or similar section and enhance it
  const overviewMatch = markdown.match(
    /^\s*(Overview|Summary|Introduction):\s*([\s\S]+?)(?=\n\s*(?:[A-Z][a-z]+:|\n\s*$))/i
  );

  if (overviewMatch) {
    const overviewTitle = overviewMatch[1];
    const overviewContent = overviewMatch[2].trim();

    // Create enhanced overview HTML
    const enhancedOverview = `
      <div style="background-color: #f8f8f8; padding: 16px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #cc0000;">
        <h3 style="color: #cc0000; margin-top: 0; margin-bottom: 10px; font-size: 18px;">${overviewTitle}</h3>
        <p style="margin: 0; line-height: 1.6; font-size: 16px;">${processTimestampsInText(
          overviewContent
        )}</p>
      </div>
    `;

    // Replace the original overview with enhanced version
    enhancedMarkdown = enhancedMarkdown.replace(
      overviewMatch[0],
      enhancedOverview
    );
  }

  // Handle headers with specific formatting
  enhancedMarkdown = enhancedMarkdown.replace(
    /^(#+)\s*(.*?)$/gm,
    (match, hashes, text) => {
      const level = hashes.length;
      const fontSize = 22 - level * 2; // h1: 20px, h2: 18px, h3: 16px
      const color =
        level === 1 ? "#cc0000" : level === 2 ? "#333333" : "#555555";
      const marginTop = level === 1 ? "25px" : "20px";
      const marginBottom = "12px";
      const paddingBottom = level <= 2 ? "8px" : "0";
      const borderBottom = level <= 2 ? "1px solid #e0e0e0" : "none";

      return `<h${level} style="font-size: ${fontSize}px; color: ${color}; margin-top: ${marginTop}; margin-bottom: ${marginBottom}; padding-bottom: ${paddingBottom}; border-bottom: ${borderBottom}; font-weight: 600;">${processTimestampsInText(
        text
      )}</h${level}>`;
    }
  );

  // Process bullet points for better styling
  enhancedMarkdown = enhancedMarkdown.replace(
    /^(\s*[-*])\s*(.*?)$/gm,
    (match, bullet, text) => {
      return `<div style="display: flex; margin-bottom: 10px; padding-left: 8px;">
      <div style="color: #cc0000; margin-right: 8px;">•</div>
      <div style="flex: 1; line-height: 1.5;">${processTimestampsInText(
        text
      )}</div>
    </div>`;
    }
  );

  // Handle paragraphs
  let paragraphs = enhancedMarkdown.split("\n\n");
  paragraphs = paragraphs.map((para) => {
    if (
      para.trim() &&
      !para.includes("<h") &&
      !para.includes("<div") &&
      !para.includes("style=")
    ) {
      return `<p style="margin-top: 10px; margin-bottom: 15px; line-height: 1.6;">${processTimestampsInText(
        para
      )}</p>`;
    }
    return para;
  });

  return paragraphs.join("\n");
}

// Function to detect and enhance timestamps in text
function processTimestampsInText(text) {
  // Match patterns like '0:05', '1:30', '01:30', '1:30:45', etc.
  const timestampPattern = /\b(\d{1,2}:(?:\d{1,2}:)?\d{1,2})\b/g;

  // Replace timestamps with clickable links
  return text.replace(timestampPattern, (match, timestamp) => {
    // Parse the timestamp into seconds
    let seconds = 0;
    const parts = timestamp.split(":").map(Number);

    if (parts.length === 2) {
      // MM:SS format
      seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // HH:MM:SS format
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    // Create a clickable link for the timestamp
    return `<a href="#" class="timestamp-link" data-time="${seconds}" style="color: #cc0000; text-decoration: underline; font-weight: 600;">${match}</a>`;
  });
}

// Function to enhance HTML content with timestamp styling
function enhanceHtmlWithTimestampsStyling(html) {
  if (!html) return "";

  // Regular expression to match YouTube time formats: 1:23, 01:23, 1:23:45, etc.
  const timeRegex = /\b(\d+:)?(\d+):(\d+)\b/g;

  // Replace timestamps with styled clickable spans while preserving HTML structure
  return html.replace(timeRegex, function (match) {
    return `<span class="ai-timestamp" style="color:#cc0000; font-weight:600; cursor:pointer; text-decoration:underline;" data-time="${match}">${match}</span>`;
  });
}

// New function to format bulleted summaries with improved styling
function formatBulletedSummary(text) {
  let formatted = "";
  let inList = false;

  // Split by lines
  const lines = text.split("\n");

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();

    // Check if this is a section header (contains at least one character followed by a colon at the beginning)
    if (/^([A-Za-z][^:]+):/.test(trimmedLine)) {
      // Close previous list if we were in one
      if (inList) {
        formatted += "</ul>";
        inList = false;
      }

      // Extract the header text
      const headerMatch = trimmedLine.match(/^([A-Za-z][^:]+):(.*)/);
      if (headerMatch) {
        const headerTitle = headerMatch[1].trim();
        const restOfLine = headerMatch[2].trim();

        formatted += `<h3 style="color: #cc0000; font-size: 18px; font-weight: 600; margin-top: 20px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e0e0e0;">${processTimestampsInText(
          headerTitle
        )}</h3>`;

        // If there's content after the colon, add it as a paragraph
        if (restOfLine) {
          formatted += `<p style="margin-top: 6px; margin-bottom: 12px;">${processTimestampsInText(
            restOfLine
          )}</p>`;
        }
      }
    }
    // Check if this is a bullet point (starts with • or -)
    else if (/^[•\-*]\s/.test(trimmedLine)) {
      // Start a new list if we weren't in one
      if (!inList) {
        formatted +=
          '<ul style="padding-left: 20px; margin-top: 10px; margin-bottom: 15px;">';
        inList = true;
      }

      // Extract the bullet point content
      const bulletContent = trimmedLine.replace(/^[•\-*]\s/, "").trim();

      // Add the bullet point
      formatted += `<li style="margin-bottom: 8px; line-height: 1.5;">${processTimestampsInText(
        bulletContent
      )}</li>`;
    }
    // Check if it's a blank line
    else if (trimmedLine === "") {
      // Close the list if we were in one
      if (inList) {
        formatted += "</ul>";
        inList = false;
      }

      // Add a small gap
      formatted += '<div style="height: 8px;"></div>';
    }
    // Regular paragraph text
    else {
      // Close the list if we were in one
      if (inList) {
        formatted += "</ul>";
        inList = false;
      }

      // Add as a paragraph
      formatted += `<p style="margin-top: 6px; margin-bottom: 12px; line-height: 1.5;">${processTimestampsInText(
        trimmedLine
      )}</p>`;
    }
  });

  // Close any open list
  if (inList) {
    formatted += "</ul>";
  }

  return formatted;
}

// Main extension code - the IIFE
(function () {
  // Configuration options
  const config = {
    buttonText: "Summarize with AI",
    buttonLoadingText: "Summarizing...",
    observerConfig: { childList: true, subtree: true },
    modalTitle: "AI Summary",
  };

  // Keep track of our button and other state
  let summarizeButton = null;
  let isProcessing = false;

  // Update the findTranscriptButton function to better identify the correct "more actions" button
  async function findTranscriptButton() {
    console.log("[YouTube AI Summarizer] Looking for transcript button");

    // First try to find the transcript button directly by text content
    const allButtons = Array.from(document.querySelectorAll("button"));
    console.log(
      "[YouTube AI Summarizer] Found",
      allButtons.length,
      "buttons on the page"
    );

    // Try to find direct transcript button first
    const transcriptButtons = allButtons.filter((button) => {
      const text = button.textContent?.toLowerCase() || "";
      const ariaLabel = button.getAttribute("aria-label")?.toLowerCase() || "";
      return text.includes("transcript") || ariaLabel.includes("transcript");
    });

    if (transcriptButtons.length > 0) {
      console.log(
        "[YouTube AI Summarizer] Found transcript button directly:",
        transcriptButtons[0].textContent ||
          transcriptButtons[0].getAttribute("aria-label") ||
          "unnamed button"
      );
      return transcriptButtons[0];
    }

    // If no direct transcript button, look for the dropdown menu (three dots) and open it
    console.log(
      "[YouTube AI Summarizer] No direct transcript button, looking for three dots menu"
    );

    // Improved three dots menu detection
    const menuButtons = allButtons.filter((button) => {
      const ariaLabel = (button.getAttribute("aria-label") || "").toLowerCase();
      return (
        ariaLabel.includes("more") ||
        ariaLabel.includes("action") ||
        (button.textContent || "").includes("...") ||
        button.innerHTML.includes("ellipsis") ||
        button.closest('[aria-label*="more"]') !== null
      );
    });

    console.log(
      "[YouTube AI Summarizer] Found",
      menuButtons.length,
      "potential menu buttons"
    );

    // Try to use the first menu button we find
    if (menuButtons.length > 0) {
      const threeDotsButton = menuButtons[0];
      console.log(
        "[YouTube AI Summarizer] Clicking three dots menu button:",
        threeDotsButton.getAttribute("aria-label") ||
          threeDotsButton.textContent ||
          "unnamed button"
      );

      // Click to open the menu
      threeDotsButton.click();

      // Wait for menu to appear (increased delay for reliability)
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Look for transcript option in the dropdown menu with various selectors
      const menuItems = document.querySelectorAll(
        "ytd-menu-service-item-renderer, " +
          "tp-yt-paper-item, " +
          ".ytp-menuitem, " +
          ".ytd-menu-popup-renderer tp-yt-paper-item, " +
          ".yt-spec-menu-item, " +
          "ytd-menu-navigation-item-renderer, " +
          "div[role='menuitem']"
      );

      console.log(
        "[YouTube AI Summarizer] Found",
        menuItems.length,
        "menu items"
      );

      // Log all menu items for debugging
      menuItems.forEach((item, i) => {
        console.log(
          `[YouTube AI Summarizer] Menu item ${i}:`,
          item.textContent?.trim() || "unnamed item"
        );
      });

      // Find and click the transcript option
      for (const item of menuItems) {
        const itemText = item.textContent?.toLowerCase() || "";
        if (itemText.includes("transcript")) {
          console.log(
            "[YouTube AI Summarizer] Found transcript option in dropdown:",
            itemText
          );

          // This is our transcript button
          return item;
        }
      }

      // If we couldn't find transcript option, close the menu
      console.log(
        "[YouTube AI Summarizer] No transcript option found in dropdown, closing menu"
      );
      threeDotsButton.click();
    }

    console.log("[YouTube AI Summarizer] Could not find transcript button");
    return null;
  }

  // A function to create and insert the "Summarize with AI" button
  function insertSummarizeButton() {
    // If button already exists or we're not on a video page, don't add it again
    if (summarizeButton || !isVideoPage()) {
      console.log(
        "[YouTube AI Summarizer] Button already exists or not on video page"
      );
      return;
    }

    const transcriptButton = findTranscriptButton();
    if (!transcriptButton) {
      console.log(
        "[YouTube AI Summarizer] Transcript button not found, cannot insert summarize button"
      );
      return;
    }

    console.log("[YouTube AI Summarizer] Creating Summarize button");
    // Create our button
    summarizeButton = document.createElement("button");
    summarizeButton.id = "summarize-with-ai-btn";
    summarizeButton.className = "youtube-ai-summarizer-button";
    summarizeButton.textContent = config.buttonText;

    // Add event listener
    summarizeButton.addEventListener("click", handleSummarizeClick);

    // Insert after the transcript button
    if (transcriptButton.parentNode) {
      // Create a container if needed and add it near the transcript button
      const container = document.createElement("div");
      container.className = "youtube-ai-summarizer-container";
      container.appendChild(summarizeButton);

      // Try to insert after transcript button
      transcriptButton.parentNode.insertBefore(
        container,
        transcriptButton.nextSibling
      );
      console.log(
        "[YouTube AI Summarizer] Summarize button inserted successfully"
      );
    } else {
      console.log(
        "[YouTube AI Summarizer] Could not insert button - transcript button has no parent"
      );
    }
  }

  // Function to insert a "Summarize Video" button above related videos section
  function insertRelatedVideosSummarizeButton() {
    // Don't add if already exists or not on a video page
    if (relatedVideoButtonAdded || !isVideoPage()) {
      return;
    }

    console.log(
      "[YouTube AI Summarizer] Looking for related videos section to add button"
    );

    // Look for the related videos section (different possible selectors for robustness)
    const relatedSection =
      document.querySelector("#related") ||
      document.querySelector("ytd-watch-next-secondary-results-renderer") ||
      document.querySelector("#secondary");

    if (!relatedSection) {
      console.log("[YouTube AI Summarizer] Related videos section not found");
      return;
    }

    console.log(
      "[YouTube AI Summarizer] Found related videos section, adding summarize button"
    );

    // Create a container for our button
    const container = document.createElement("div");
    container.className = "youtube-ai-summarizer-related-container";
    container.style.padding = "12px";
    container.style.marginBottom = "12px";
    container.style.textAlign = "center";
    // Make sure the container is full width
    container.style.width = "100%";

    // Create the button
    const button = document.createElement("button");
    button.id = "summarize-related-btn";
    button.className = "youtube-ai-summarizer-button";
    button.textContent = "Summarize Video";
    // Make button full width
    button.style.width = "100%";
    button.style.padding = "10px 16px";
    button.style.backgroundColor = "#cc0000";
    button.style.color = "white";
    button.style.border = "none";
    button.style.borderRadius = "2px";
    button.style.fontWeight = "500";
    button.style.cursor = "pointer";

    // Add hover effect
    button.addEventListener("mouseover", () => {
      button.style.backgroundColor = "#aa0000";
    });
    button.addEventListener("mouseout", () => {
      button.style.backgroundColor = "#cc0000";
    });

    // Add click handler
    button.addEventListener("click", handleSummarizeClick);

    // Add button to container
    container.appendChild(button);

    // Insert at the beginning of related section
    relatedSection.insertBefore(container, relatedSection.firstChild);
    relatedVideoButtonAdded = true;

    console.log(
      "[YouTube AI Summarizer] Successfully added summarize button above related videos"
    );
  }

  // Enhance getTranscriptText to better find and extract transcript segments
  async function getTranscriptText() {
    try {
      console.log("[YouTube AI Summarizer] Extracting transcript text");
      // Initialize transcriptText to empty string at the beginning to avoid "not defined" errors
      let transcriptText = "";

      // First, try to get transcript from any ytd-transcript-segment-renderer elements
      // Using more explicit class names and attributes
      const transcriptSegments = document.querySelectorAll(
        "ytd-transcript-segment-renderer, " +
          "[class*='transcript-segment'], " +
          ".ytd-transcript-segment-list-renderer"
      );

      if (transcriptSegments && transcriptSegments.length > 0) {
        console.log(
          "[YouTube AI Summarizer] Found transcript segments:",
          transcriptSegments.length
        );

        let hasContent = false;

        transcriptSegments.forEach((segment, i) => {
          // Get text directly from the element
          const segmentText = segment.textContent?.trim();

          if (segmentText && segmentText.length > 0) {
            hasContent = true;

            // Look for timestamp specifically
            const timestampEl = segment.querySelector(
              ".segment-timestamp, " +
                "[class*='timestamp'], " +
                "span[class*='time'], " +
                "div[class*='time']"
            );

            const textEl = segment.querySelector(
              ".segment-text, " +
                "yt-formatted-string.segment-text, " +
                "[class*='text-content'], " +
                "span:not([class*='time']):not([class*='timestamp'])"
            );

            let timestamp = timestampEl ? timestampEl.textContent?.trim() : "";
            let text = textEl ? textEl.textContent?.trim() : segmentText;

            // If we found a timestamp but no text element, the text might be the remaining content
            if (timestamp && !textEl) {
              // Remove timestamp from full text
              text = segmentText.replace(timestamp, "").trim();
            }

            if (i < 5) {
              console.log(
                `[YouTube AI Summarizer] Segment ${i}: timestamp="${timestamp}", text="${text?.substring(
                  0,
                  30
                )}..."`
              );
            }

            if (text) {
              transcriptText += `${timestamp ? timestamp + ": " : ""}${text}\n`;
            }
          }
        });

        if (hasContent && transcriptText.length > 50) {
          console.log(
            "[YouTube AI Summarizer] Successfully extracted transcript from segments. First 100 chars:",
            transcriptText.substring(0, 100)
          );

          // Clean up the transcript to remove duplicates
          transcriptText = cleanupTranscript(transcriptText);
          return transcriptText;
        }
      } else {
        console.log(
          "[YouTube AI Summarizer] No transcript segments found with primary selector"
        );
      }

      // Look specifically for the DOM structure the user mentioned
      console.log(
        "[YouTube AI Summarizer] Trying to find specific segment structure"
      );

      const formattedStringSegments = document.querySelectorAll(
        "yt-formatted-string.segment-text"
      );
      if (formattedStringSegments && formattedStringSegments.length > 0) {
        console.log(
          "[YouTube AI Summarizer] Found formatted string segments:",
          formattedStringSegments.length
        );

        formattedStringSegments.forEach((segment, i) => {
          // Find the closest parent that might contain the timestamp
          const parentSegment =
            segment.closest("ytd-transcript-segment-renderer") ||
            segment.closest(".segment") ||
            segment.closest("[class*='transcript-segment']");

          let timestamp = "";
          if (parentSegment) {
            const timestampEl =
              parentSegment.querySelector(".segment-timestamp") ||
              parentSegment.querySelector("[class*='timestamp']");
            timestamp = timestampEl ? timestampEl.textContent?.trim() : "";
          }

          const text = segment.textContent?.trim();

          if (i < 5) {
            console.log(
              `[YouTube AI Summarizer] Formatted string segment ${i}: timestamp="${timestamp}", text="${text?.substring(
                0,
                30
              )}..."`
            );
          }

          if (text) {
            transcriptText += `${timestamp ? timestamp + ": " : ""}${text}\n`;
          }
        });

        if (transcriptText.length > 50) {
          console.log(
            "[YouTube AI Summarizer] Extracted transcript using formatted-string selector. First 100 chars:",
            transcriptText.substring(0, 100)
          );

          // Clean up the transcript to remove duplicates
          transcriptText = cleanupTranscript(transcriptText);
          return transcriptText;
        }
      }

      // Try to find transcript panel directly
      const transcriptPanel = document.querySelector(
        "ytd-transcript-search-panel-renderer, " +
          "ytd-transcript-renderer, " +
          "[target-id='engagement-panel-searchable-transcript'], " +
          "[target-id='engagement-panel-transcript']"
      );

      if (transcriptPanel) {
        console.log(
          "[YouTube AI Summarizer] Found transcript panel, dumping HTML for debugging:"
        );
        console.log(transcriptPanel.outerHTML.substring(0, 500) + "...");

        // Direct approach - get all text nodes in the panel that might be transcript segments
        const segmentContainers = transcriptPanel.querySelectorAll(
          "div[role='button'], .segment"
        );
        console.log(
          "[YouTube AI Summarizer] Found segment containers:",
          segmentContainers.length
        );

        if (segmentContainers.length > 0) {
          segmentContainers.forEach((container, i) => {
            const text = container.textContent?.trim();
            if (text && text.length > 0) {
              transcriptText += text + "\n";
              if (i < 3) {
                console.log(
                  `[YouTube AI Summarizer] Segment container ${i} text:`,
                  text
                );
              }
            }
          });

          if (transcriptText.length > 100) {
            console.log(
              "[YouTube AI Summarizer] Extracted transcript from segment containers. Length:",
              transcriptText.length
            );

            // Clean up the transcript to remove duplicates
            transcriptText = cleanupTranscript(transcriptText);
            return transcriptText;
          }
        }

        // Last resort - get all text from the panel
        const panelText = transcriptPanel.textContent?.trim();
        if (panelText && panelText.length > 200) {
          // Filter out header text like "Transcript"
          const cleanedText = panelText
            .replace(/^\s*Transcript\s*/i, "")
            .replace(/Show\s*more\s*$/i, "")
            .trim();

          console.log(
            "[YouTube AI Summarizer] Extracted raw text from transcript panel. Length:",
            cleanedText.length
          );

          // Clean up the transcript to remove duplicates
          const finalText = cleanupTranscript(cleanedText);
          return finalText;
        }
      }

      // Fallback method: try to parse segments directly from any available elements
      console.log("[YouTube AI Summarizer] Trying native transcript approach");
      const transcriptElement = document.querySelector(
        "#transcript, [data-panel-identifier='transcript'], ytd-transcript-body-renderer, [target-id*='transcript']"
      );

      if (transcriptElement) {
        console.log(
          "[YouTube AI Summarizer] Found transcript panel:",
          transcriptElement.tagName
        );

        // Try to get all possible transcript segments
        const allPossibleSegments = transcriptElement.querySelectorAll("*");
        console.log(
          "[YouTube AI Summarizer] Found",
          allPossibleSegments.length,
          "potential elements in transcript panel"
        );

        // Try to identify patterns in the content
        let segmentTimestamps = [];
        let segmentTexts = [];

        allPossibleSegments.forEach((el) => {
          const text = el.textContent?.trim();
          if (text && text.length > 0) {
            // Check if this looks like a timestamp (e.g., "0:00", "1:23", etc.)
            if (/^(\d+:)?\d+:\d+$/.test(text)) {
              segmentTimestamps.push({ el, text });
            }
            // Check if this looks like transcript text (more than a few words and not just a timestamp)
            else if (text.split(" ").length > 3 && !/^\d+:\d+$/.test(text)) {
              segmentTexts.push({ el, text });
            }
          }
        });

        console.log(
          "[YouTube AI Summarizer] Found",
          segmentTimestamps.length,
          "potential timestamps and",
          segmentTexts.length,
          "potential text segments"
        );

        // Now try to build transcript by pairing timestamps with text
        if (segmentTimestamps.length > 0 && segmentTexts.length > 0) {
          // If counts match, assume they're in order
          if (segmentTimestamps.length === segmentTexts.length) {
            for (let i = 0; i < segmentTimestamps.length; i++) {
              transcriptText += `${segmentTimestamps[i].text}: ${segmentTexts[i].text}\n`;
            }
          } else {
            // Otherwise just use the text segments
            segmentTexts.forEach((item) => {
              transcriptText += item.text + "\n";
            });
          }

          if (transcriptText.length > 100) {
            console.log(
              "[YouTube AI Summarizer] Built transcript from elements. Length:",
              transcriptText.length
            );

            // Clean up the transcript to remove duplicates
            transcriptText = cleanupTranscript(transcriptText);
            return transcriptText;
          }
        }
      }

      if (transcriptText.length > 0) {
        // Clean up the transcript to remove duplicates
        transcriptText = cleanupTranscript(transcriptText);
        return transcriptText;
      }

      console.error(
        "[YouTube AI Summarizer] All transcript extraction methods failed"
      );
      throw new Error("Could not extract transcript using any method");
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error extracting transcript:", e);
      throw e;
    }
  }

  // Function to clean up transcript and remove duplicated content
  function cleanupTranscript(rawTranscript) {
    console.log(
      "[YouTube AI Summarizer] Cleaning up transcript to remove duplicates"
    );

    if (!rawTranscript) return "";

    // Split into lines
    const lines = rawTranscript.split("\n");
    console.log(
      "[YouTube AI Summarizer] Original transcript has",
      lines.length,
      "lines"
    );

    // Create a map to track unique entries by their content
    const uniqueLines = new Map();
    const processed = [];

    // Process each line to extract timestamp and content and detect duplicates
    for (const line of lines) {
      if (!line.trim()) continue;

      // Parse timestamp and content
      const timestampMatch = line.match(/^(\d+:\d+:?\d*):?\s*(.*)/);

      if (timestampMatch) {
        const timestamp = timestampMatch[1];
        const content = timestampMatch[2].trim();

        // Skip empty content
        if (!content) continue;

        // Use content as key to detect duplicates
        const key = content.toLowerCase();

        // Only add if we haven't seen this content before, or if it has a timestamp and previous doesn't
        if (!uniqueLines.has(key)) {
          uniqueLines.set(key, { timestamp, content });
          processed.push(`${timestamp}: ${content}`);
        }
      } else if (line.trim()) {
        // This is a line without timestamp format
        // Only add non-empty lines without timestamps if they don't match a previous content
        const key = line.trim().toLowerCase();

        if (!uniqueLines.has(key)) {
          uniqueLines.set(key, { timestamp: "", content: line.trim() });
          processed.push(line.trim());
        }
      }
    }

    // Join the deduplicated lines
    const cleanedTranscript = processed.join("\n");

    console.log(
      "[YouTube AI Summarizer] Cleaned transcript has",
      processed.length,
      "lines"
    );

    // Log the first and last parts of the cleaned transcript
    if (cleanedTranscript.length > 0) {
      console.log(
        "[YouTube AI Summarizer] Cleaned transcript beginning (first 200 chars):",
        cleanedTranscript.substring(0, 200)
      );

      if (cleanedTranscript.length > 400) {
        console.log(
          "[YouTube AI Summarizer] Cleaned transcript end (last 200 chars):",
          cleanedTranscript.substring(cleanedTranscript.length - 200)
        );
      }

      // Log the full cleaned transcript for debugging
      console.log(
        "[YouTube AI Summarizer] Full cleaned transcript for LLM:",
        cleanedTranscript
      );
    }

    return cleanedTranscript;
  }

  // Function to ensure transcript is visible before extracting
  async function ensureTranscriptVisible() {
    console.log("[YouTube AI Summarizer] Ensuring transcript is visible");

    // First check if transcript is already open
    const transcriptPanel =
      document.querySelector("ytd-transcript-renderer") ||
      document.querySelector('[role="dialog"]:has(ytd-transcript-renderer)') ||
      document.querySelector(
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
      ) ||
      document.querySelector(
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-transcript"]'
      );

    if (transcriptPanel) {
      console.log("[YouTube AI Summarizer] Transcript panel already open");
      return;
    }

    // Find the transcript button
    const transcriptButton = await findTranscriptButton();
    if (!transcriptButton) {
      console.error("[YouTube AI Summarizer] Transcript button not found");
      throw new Error("Transcript button not found");
    }

    // Click the transcript button to open it
    console.log(
      "[YouTube AI Summarizer] Clicking transcript button to open panel"
    );
    transcriptButton.click();

    // Wait for transcript to appear with improved waiting mechanism
    await new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 20; // Increased for better reliability
      const checkInterval = setInterval(() => {
        const panel =
          document.querySelector("ytd-transcript-renderer") ||
          document.querySelector(
            '[role="dialog"]:has(ytd-transcript-renderer)'
          ) ||
          document.querySelector(
            'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]'
          ) ||
          document.querySelector(
            'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-transcript"]'
          );

        if (panel) {
          console.log("[YouTube AI Summarizer] Transcript panel appeared");
          clearInterval(checkInterval);
          // Add a longer delay to ensure content is fully loaded
          setTimeout(resolve, 1500); // Increased to 1.5 seconds for better content loading
        } else if (attempts++ > maxAttempts) {
          // Increased timeout
          clearInterval(checkInterval);
          console.error(
            "[YouTube AI Summarizer] Transcript failed to open after multiple attempts"
          );
          reject(new Error("Transcript failed to open"));
        }
      }, 500);
    });
  }

  // Function to extract video metadata
  function getVideoMetadata() {
    const title =
      document
        .querySelector("h1.ytd-video-primary-info-renderer")
        ?.textContent?.trim() ||
      document.querySelector("h1.title")?.textContent?.trim() ||
      document.title;

    const channel =
      document.querySelector("#owner-name a")?.textContent?.trim() ||
      document.querySelector(".ytd-channel-name")?.textContent?.trim() ||
      "Unknown channel";

    return {
      title: title,
      url: window.location.href,
      channel: channel,
    };
  }

  // Assign handleSummarizeClick to the outer scope reference so it can be used by the message handler
  handleSummarizeClick = async function () {
    if (isProcessing) return;

    try {
      isProcessing = true;
      console.log("[YouTube AI Summarizer] Starting summarization process");

      // Update button states if applicable
      if (summarizeButton) {
        summarizeButton.textContent = config.buttonLoadingText;
        summarizeButton.disabled = true;
      }

      // Show loading indicator first so user gets immediate feedback
      showLoadingIndicator();

      // First, ensure transcript is visible - this is the key part that needs to be more reliable
      try {
        console.log(
          "[YouTube AI Summarizer] Attempting to open transcript panel"
        );

        // Find the transcript button
        const transcriptButton = await findTranscriptButton();
        if (!transcriptButton) {
          throw new Error("Could not find transcript button");
        }

        console.log(
          "[YouTube AI Summarizer] Found transcript button, clicking it"
        );
        // Click the transcript button to show transcript
        transcriptButton.click();

        // Wait a moment for the transcript to appear
        console.log(
          "[YouTube AI Summarizer] Waiting for transcript panel to appear"
        );
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Ensure transcript is fully loaded
        await ensureTranscriptVisible();
        console.log(
          "[YouTube AI Summarizer] Transcript panel opened successfully"
        );
      } catch (transcriptError) {
        console.error(
          "[YouTube AI Summarizer] Transcript visibility error:",
          transcriptError
        );
        // Don't give up yet - we'll try other methods to extract transcript
      }

      // Additional delay to ensure transcript is fully loaded
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get transcript text
      let transcriptText;
      try {
        console.log("[YouTube AI Summarizer] Starting transcript extraction");
        transcriptText = await getTranscriptText();

        if (!transcriptText || transcriptText.length < 50) {
          console.error(
            "[YouTube AI Summarizer] Extracted transcript too short or empty:",
            transcriptText
          );
          throw new Error("Extracted transcript is too short or empty");
        }

        console.log(
          "[YouTube AI Summarizer] Transcript extraction successful, length:",
          transcriptText.length
        );

        // No need to log the beginning here since we already do comprehensive logging in cleanupTranscript
      } catch (extractError) {
        console.error(
          "[YouTube AI Summarizer] Transcript extraction error:",
          extractError
        );
        hideLoadingIndicator();
        displaySummaryModal(
          `Error: Could not extract the transcript from this video. Please ensure the video has captions/transcript available and try again. 
          
          Troubleshooting tips:
          1. Make sure the video has closed captions enabled (CC button)
          2. Try manually opening the transcript (three dots menu → Show transcript)
          3. Try refreshing the page`
        );
        isSummaryInProgress = false;

        // Reset button states
        if (summarizeButton) {
          summarizeButton.textContent = config.buttonText;
          summarizeButton.disabled = false;
        }

        return;
      }

      // Get video metadata for context
      const videoMetadata = getVideoMetadata();
      console.log("[YouTube AI Summarizer] Video metadata:", videoMetadata);

      // Send to background script for processing
      console.log(
        "[YouTube AI Summarizer] Sending transcript to background script for summarization, transcript length:",
        transcriptText?.length || 0
      );

      console.log("[YouTube AI Summarizer] Initiating LLM request");
      await safeSendMessage({
        type: "SUMMARIZE",
        payload: {
          text: transcriptText,
          metadata: videoMetadata,
        },
      });
      console.log(
        "[YouTube AI Summarizer] LLM request sent successfully, waiting for response"
      );
    } catch (error) {
      console.error("[YouTube AI Summarizer] Error summarizing:", error);
      hideLoadingIndicator();
      displaySummaryModal(
        `Error: ${
          error.message || "Could not summarize the transcript"
        }. Please try again.`
      );
      isSummaryInProgress = false;

      // Reset button states
      if (summarizeButton) {
        summarizeButton.textContent = config.buttonText;
        summarizeButton.disabled = false;
      }
    } finally {
      // Reset button state (we'll update again when the summary comes back)
      setTimeout(() => {
        isProcessing = false;
        if (summarizeButton) {
          summarizeButton.textContent = config.buttonText;
          summarizeButton.disabled = false;
        }
      }, 1000);
    }
  };

  // Monitor for DOM changes that might indicate the transcript button has appeared
  function setupObserver() {
    console.log("[YouTube AI Summarizer] Setting up observer");
    const observer = new MutationObserver((mutations) => {
      if (isVideoPage()) {
        // Check for transcript button if our summarize button doesn't exist
        if (!summarizeButton) {
          console.log(
            "[YouTube AI Summarizer] DOM changed, checking for transcript button"
          );
          insertSummarizeButton();
        }

        // Check for related videos section to add our summarize button
        if (!relatedVideoButtonAdded) {
          console.log(
            "[YouTube AI Summarizer] DOM changed, checking for related videos section"
          );
          insertRelatedVideosSummarizeButton();
        }
      }
    });

    // Start observing the document with the configured parameters
    observer.observe(document.body, config.observerConfig);
    console.log("[YouTube AI Summarizer] Observer started");
  }

  // Setup on initial load and URL changes
  function initialize() {
    console.log("[YouTube AI Summarizer] Initializing extension");
    if (isVideoPage()) {
      console.log(
        "[YouTube AI Summarizer] On video page, attempting to insert buttons"
      );
      // Insert the transcript button (old functionality)
      insertSummarizeButton();

      // Also insert our new button above related videos
      insertRelatedVideosSummarizeButton();
    }

    // Setup observer for future DOM changes
    setupObserver();

    // Listen for navigation events (SPA behavior)
    window.addEventListener("yt-navigate-finish", () => {
      // Reset state
      console.log("[YouTube AI Summarizer] Navigation detected, resetting");
      summarizeButton = null;
      relatedVideoButtonAdded = false;

      // Check if we should add button on the new page
      if (isVideoPage()) {
        console.log(
          "[YouTube AI Summarizer] Navigated to video page, inserting buttons"
        );
        insertSummarizeButton();
        insertRelatedVideosSummarizeButton();
      }
    });

    isInitialized = true;
  }

  // Start the extension after a short delay to ensure page is loaded
  setTimeout(() => {
    console.log("[YouTube AI Summarizer] Starting initialization");
    try {
      initialize();
    } catch (e) {
      console.error("[YouTube AI Summarizer] Initialization error:", e);
    }
  }, 1000);
})();

// Function to attach click handlers to timestamp elements
function attachTimestampClickHandlers() {
  // Find all timestamp elements
  const timestampElements = document.querySelectorAll(".ai-timestamp");

  timestampElements.forEach((element) => {
    element.addEventListener("click", (e) => {
      e.preventDefault();
      const timeString = e.target.getAttribute("data-time");

      if (timeString) {
        // Parse the timestamp string and convert to seconds
        const seconds = convertTimestampToSeconds(timeString);
        if (seconds !== null) {
          // Jump to the timestamp in the video
          jumpToVideoTime(seconds);
        }
      }
    });
  });
}

// Function to convert timestamp string (e.g., "1:30" or "1:30:45") to seconds
function convertTimestampToSeconds(timestamp) {
  if (!timestamp) return null;

  const parts = timestamp.split(":").map((part) => parseInt(part));

  if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

// Function to jump to a specific time in the YouTube video
function jumpToVideoTime(seconds) {
  try {
    // Check if YouTube player API is available
    const videoElement = document.querySelector("video");

    if (videoElement) {
      console.log(
        `[YouTube AI Summarizer] Jumping to timestamp: ${seconds} seconds`
      );
      videoElement.currentTime = seconds;

      // Try to also use the YouTube API if it's available
      if (
        window.yt &&
        window.yt.player &&
        window.yt.player.getPlayerByElement
      ) {
        const player = window.yt.player.getPlayerByElement(videoElement);
        if (player && typeof player.seekTo === "function") {
          player.seekTo(seconds);
        }
      }
    } else {
      console.error("[YouTube AI Summarizer] Video element not found");
    }
  } catch (error) {
    console.error("[YouTube AI Summarizer] Error jumping to timestamp:", error);
  }
}

// New function to render text summary format
function renderTextSummary(text, container) {
  // Check if this looks like a bullet list with • characters
  if (text.includes("•")) {
    // This is likely a bullet list - use special formatting
    container.innerHTML = formatBulletedSummary(text);
  } else if (text.includes("#") || text.includes("-")) {
    // Enhanced markdown parser with timestamp handling
    const formattedContent = processSummaryWithTimestamps(text);
    container.innerHTML = formattedContent;
  } else {
    // Simple string summary with enhanced formatting
    const paragraphs = text.split("\n\n");
    paragraphs.forEach((paragraph) => {
      if (paragraph.trim()) {
        // Check for timestamps in the paragraph
        const p = document.createElement("div");
        p.style.marginBottom = "16px";

        // Process potential timestamps
        const processedPara = processTimestampsInText(paragraph);
        p.innerHTML = processedPara;

        container.appendChild(p);
      }
    });
  }
}

// New function to render JSON structured summary with enhanced styling
function renderJsonSummary(data, container) {
  container.style.padding = "16px 24px";

  // Overview section
  if (data.overview) {
    const overview = document.createElement("div");
    overview.className = "summary-overview";
    overview.style.fontSize = "17px";
    overview.style.lineHeight = "1.6";
    overview.style.marginBottom = "24px";
    overview.style.padding = "16px";
    overview.style.backgroundColor = "#f8f8f8";
    overview.style.borderRadius = "8px";
    overview.style.borderLeft = "4px solid #cc0000";

    // Process any timestamps in the overview
    overview.innerHTML = processTimestampsInText(data.overview);
    container.appendChild(overview);
  }

  // Chapters/sections
  if (data.chapters && data.chapters.length > 0) {
    data.chapters.forEach((chapter, index) => {
      const chapterSection = document.createElement("div");
      chapterSection.className = "summary-chapter";
      chapterSection.style.marginBottom = "24px";

      // Chapter header with timestamp if available
      const header = document.createElement("h3");
      header.style.fontSize = "20px";
      header.style.color = "#cc0000";
      header.style.fontWeight = "600";
      header.style.marginBottom = "12px";
      header.style.paddingBottom = "8px";
      header.style.borderBottom = "1px solid #e0e0e0";

      // Add timestamp to chapter title if available
      let titleText = chapter.title;
      if (chapter.timestamp) {
        titleText += ` (${chapter.timestamp})`;
      }

      // Process any timestamps in the title itself
      header.innerHTML = processTimestampsInText(titleText);
      chapterSection.appendChild(header);

      // Chapter points
      if (chapter.points && chapter.points.length > 0) {
        const pointsList = document.createElement("ul");
        pointsList.style.listStyleType = "disc";
        pointsList.style.paddingLeft = "24px";
        pointsList.style.marginTop = "12px";

        chapter.points.forEach((point) => {
          const pointItem = document.createElement("li");
          pointItem.style.marginBottom = "10px";
          pointItem.style.paddingLeft = "4px";

          // Build point text with timestamp if available
          let pointText = point.text;
          if (point.timestamp) {
            pointText += ` (${point.timestamp})`;
          }

          // Process any timestamps in the point text
          pointItem.innerHTML = processTimestampsInText(pointText);
          pointsList.appendChild(pointItem);
        });

        chapterSection.appendChild(pointsList);
      }

      container.appendChild(chapterSection);
    });
  }

  // Key takeaways
  if (data.keyTakeaways && data.keyTakeaways.length > 0) {
    const takeawaysSection = document.createElement("div");
    takeawaysSection.className = "summary-takeaways";
    takeawaysSection.style.marginTop = "32px";
    takeawaysSection.style.padding = "16px";
    takeawaysSection.style.backgroundColor = "#f0f7ff";
    takeawaysSection.style.borderRadius = "8px";

    const takeawaysHeader = document.createElement("h3");
    takeawaysHeader.textContent = "Key Takeaways";
    takeawaysHeader.style.fontSize = "18px";
    takeawaysHeader.style.color = "#0066cc";
    takeawaysHeader.style.marginTop = "0";
    takeawaysHeader.style.marginBottom = "12px";
    takeawaysSection.appendChild(takeawaysHeader);

    const takeawaysList = document.createElement("ul");
    takeawaysList.style.paddingLeft = "24px";
    takeawaysList.style.marginBottom = "0";

    data.keyTakeaways.forEach((takeaway) => {
      const takeawayItem = document.createElement("li");
      takeawayItem.style.marginBottom = "10px";

      // Build takeaway text with timestamp if available
      let takeawayText = takeaway.text;
      if (takeaway.timestamp) {
        takeawayText += ` (${takeaway.timestamp})`;
      }

      // Process any timestamps in the takeaway text
      takeawayItem.innerHTML = processTimestampsInText(takeawayText);
      takeawaysList.appendChild(takeawayItem);
    });

    takeawaysSection.appendChild(takeawaysList);
    container.appendChild(takeawaysSection);
  }
}
