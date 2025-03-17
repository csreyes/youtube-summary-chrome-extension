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
  if (message.type === "SUMMARY_RESULT") {
    console.log(
      "[YouTube AI Summarizer] Received summary result with length:",
      message.summary?.length || 0
    );

    // Enhanced logging for LLM response
    console.log(
      "[YouTube AI Summarizer] LLM response received, first 200 chars:",
      message.summary?.substring(0, 200) || "No summary"
    );

    // Hide loading indicator if it exists
    hideLoadingIndicator();

    // Reset the state
    isSummaryInProgress = false;

    // Make sure we have a summary to display
    if (!message.summary) {
      console.error(
        "[YouTube AI Summarizer] Received null or undefined summary"
      );
      displaySummaryModal("Error: No summary received. Please try again.");
      return false;
    }

    // Display the summary
    displaySummaryModal(message.summary);
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
    summary?.length || 0
  );

  // Log additional details about the summary for debugging
  if (summary) {
    console.log(
      "[YouTube AI Summarizer] Summary type:",
      typeof summary,
      "Is object?",
      typeof summary === "object" && summary !== null
    );

    if (typeof summary === "string") {
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
        "[YouTube AI Summarizer] Summary object keys:",
        Object.keys(summary),
        "Has HTML?",
        !!summary.html,
        "Has key points?",
        Array.isArray(summary.keyPoints) && summary.keyPoints.length > 0
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

  if (typeof summary === "string") {
    // Check for error message
    if (summary.startsWith("Error:")) {
      const errorDiv = document.createElement("div");
      errorDiv.className = "ai-summary-error";
      errorDiv.innerText = summary;
      content.appendChild(errorDiv);
    }
    // Handle markdown formatting
    else if (summary.includes("#") || summary.includes("-")) {
      // Simple markdown parser
      let formattedContent = summary
        // Headers
        .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
        .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
        .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
        // Lists
        .replace(/^-\s+(.+)$/gm, "<li>$1</li>")
        // Paragraphs
        .split("\n\n")
        .map((para) => {
          if (!para.startsWith("<h") && !para.startsWith("<li")) {
            return `<p>${para}</p>`;
          }
          return para;
        })
        .join("");

      // Wrap lists
      formattedContent = formattedContent
        .replace(/<li>(.+?)<\/li>/g, function (match) {
          return "<ul>" + match + "</ul>";
        })
        .replace(/<\/ul><ul>/g, "");

      content.innerHTML = formattedContent;
    } else {
      // Simple string summary
      const paragraphs = summary.split("\n\n");
      paragraphs.forEach((paragraph) => {
        if (paragraph.trim()) {
          const p = document.createElement("p");
          p.innerText = paragraph;
          content.appendChild(p);
        }
      });
    }
  } else if (summary && typeof summary === "object") {
    // Handle structured summary objects
    if (summary.html) {
      content.innerHTML = summary.html;
    } else if (summary.text) {
      // Create formatted sections
      const mainSummary = document.createElement("div");
      mainSummary.className = "ai-summary-section";
      mainSummary.innerText = summary.text;
      content.appendChild(mainSummary);

      // Add any additional sections
      if (summary.keyPoints && Array.isArray(summary.keyPoints)) {
        const keyPointsSection = document.createElement("div");
        keyPointsSection.className = "ai-summary-key-points";

        const keyPointsTitle = document.createElement("h4");
        keyPointsTitle.textContent = "Key Points";
        keyPointsSection.appendChild(keyPointsTitle);

        const keyPointsList = document.createElement("ul");
        summary.keyPoints.forEach((point) => {
          const li = document.createElement("li");
          li.textContent = point;
          keyPointsList.appendChild(li);
        });
        keyPointsSection.appendChild(keyPointsList);
        content.appendChild(keyPointsSection);
      }
    }
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

            console.log(
              `[YouTube AI Summarizer] Segment ${i}: timestamp="${timestamp}", text="${text?.substring(
                0,
                30
              )}..."`
            );

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

          // Enhanced logging - log the full transcript for debugging
          console.log(
            "[YouTube AI Summarizer] Full transcript (before sending to LLM):",
            transcriptText
          );

          return transcriptText.trim();
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
          console.log(
            `[YouTube AI Summarizer] Formatted string segment ${i}: timestamp="${timestamp}", text="${text?.substring(
              0,
              30
            )}..."`
          );

          if (text) {
            transcriptText += `${timestamp ? timestamp + ": " : ""}${text}\n`;
          }
        });

        if (transcriptText.length > 50) {
          console.log(
            "[YouTube AI Summarizer] Extracted transcript using formatted-string selector. First 100 chars:",
            transcriptText.substring(0, 100)
          );
          return transcriptText.trim();
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
            return transcriptText.trim();
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
          return cleanedText;
        }
      }

      // Additional logging for all other transcript extraction methods
      if (transcriptText && transcriptText.length > 100) {
        console.log(
          "[YouTube AI Summarizer] Full transcript (before sending to LLM):",
          transcriptText
        );
      }

      if (transcriptText.length > 0) {
        return transcriptText.trim();
      }

      console.error(
        "[YouTube AI Summarizer] Failed to extract transcript text"
      );
      throw new Error("Could not extract transcript");
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error extracting transcript:", e);
      throw e;
    }
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

        // Log the first 500 characters of transcript for debugging
        console.log(
          "[YouTube AI Summarizer] Transcript beginning (first 500 chars):",
          transcriptText.substring(0, 500)
        );
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
