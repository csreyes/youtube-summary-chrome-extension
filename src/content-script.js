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

// Function to extract video metadata - moved outside IIFE for global access
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

// Function to extract summary content from different message formats
function extractSummaryContent(message) {
  console.log(
    "[YouTube AI Summarizer] Extracting summary content from message:",
    {
      messageType: typeof message,
      messageKeys: message ? Object.keys(message) : "null/undefined",
      hasType: message && message.type ? message.type : "no type",
      hasSummary:
        message && typeof message.summary !== "undefined" ? "yes" : "no",
      hasData: message && typeof message.data !== "undefined" ? "yes" : "no",
      hasPayload:
        message && typeof message.payload !== "undefined" ? "yes" : "no",
      hasResult:
        message && typeof message.result !== "undefined" ? "yes" : "no",
      hasText: message && typeof message.text !== "undefined" ? "yes" : "no",
      hasContent:
        message && typeof message.content !== "undefined" ? "yes" : "no",
    }
  );

  // Safety check for null or undefined message
  if (!message) {
    console.error(
      "[YouTube AI Summarizer] Received null or undefined message in extractSummaryContent"
    );
    return "Error: No summary data received. Please try again.";
  }

  try {
    // Handle streaming message formats
    if (message.type === "STREAM_CHUNK" || message.type === "SUMMARY_CHUNK") {
      console.log(`[YouTube AI Summarizer] Processing ${message.type} message`);
      // For streaming chunks, just return the text content
      if (typeof message.text === "string") {
        return message.text;
      } else if (message.text === undefined) {
        console.warn(
          `[YouTube AI Summarizer] ${message.type} message has undefined text field`
        );
        return ""; // Return empty string for appending (not an error)
      }
    }

    // Special case for completed stream
    if (message.type === "STREAM_COMPLETE" && message.text) {
      console.log(
        "[YouTube AI Summarizer] Using text from STREAM_COMPLETE message"
      );
      return message.text;
    }

    // Check if summary is directly available
    if (message.summary) {
      console.log(
        "[YouTube AI Summarizer] Found summary directly in message.summary"
      );
      return message.summary;
    }

    // Check for other common patterns
    if (message.data && message.data.summary) {
      console.log(
        "[YouTube AI Summarizer] Found summary in message.data.summary"
      );
      return message.data.summary;
    }

    if (message.payload && message.payload.summary) {
      console.log(
        "[YouTube AI Summarizer] Found summary in message.payload.summary"
      );
      return message.payload.summary;
    }

    if (message.result && message.result.summary) {
      console.log(
        "[YouTube AI Summarizer] Found summary in message.result.summary"
      );
      return message.result.summary;
    }

    // For messages that might have the content directly in a field
    if (typeof message.text === "string" && message.text.length > 0) {
      console.log("[YouTube AI Summarizer] Using message.text as summary");
      return message.text;
    }

    if (typeof message.content === "string" && message.content.length > 0) {
      console.log("[YouTube AI Summarizer] Using message.content as summary");
      return message.content;
    }

    // Special case for SUMMARY_RESULT messages
    if (message.type === "SUMMARY_RESULT" && message.summary) {
      console.log(
        "[YouTube AI Summarizer] Found summary in SUMMARY_RESULT message"
      );
      return message.summary;
    }

    // Log the full message structure for debugging
    console.error(
      "[YouTube AI Summarizer] Could not extract summary from message:",
      JSON.stringify(message).substring(0, 1000)
    );

    // Return a friendly error message instead of null
    return "Error: Could not extract summary from response. Please try again.";
  } catch (error) {
    console.error(
      "[YouTube AI Summarizer] Error in extractSummaryContent:",
      error
    );
    return "Error: Exception while processing summary. Please try again.";
  }
}

// Function to extract content from streaming message chunks
function extractStreamContent(message) {
  if (!message) {
    console.error(
      "[YouTube AI Summarizer] Null or undefined message in extractStreamContent"
    );
    return null;
  }

  try {
    // First check message.text which is the most common pattern for stream chunks
    if (typeof message.text === "string") {
      return message.text;
    }

    // If the message is incomplete or doesnt have text property, try to extract from other properties
    if (message.content) {
      return typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
    }

    // More fallbacks for other possible structures
    if (message.data && message.data.text) {
      return message.data.text;
    }

    if (message.chunk) {
      return typeof message.chunk === "string"
        ? message.chunk
        : JSON.stringify(message.chunk);
    }

    // If we got here, log the message structure and return null
    console.error(
      "[YouTube AI Summarizer] Could not extract content from stream chunk:",
      JSON.stringify(message).substring(0, 200)
    );
    return null;
  } catch (error) {
    console.error(
      "[YouTube AI Summarizer] Error in extractStreamContent:",
      error
    );
    return null;
  }
}

// Add message listener immediately (outside the IIFE) to ensure it's registered early
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(
    "[YouTube AI Summarizer] Message received:",
    message?.action || "unknown action",
    message?.type || "unknown type"
  );

  try {
    if (message && message.action === "display_summary") {
      // Check if this is a new summary request (not streaming chunks)
      if (message.type === "SUMMARY" || message.type === "SUMMARY_RESPONSE") {
        // Reset conversation history for new summaries
        window.conversationHistory = null;
        console.log(
          "[YouTube AI Summarizer] Reset conversation history for new summary"
        );
      }

      // Check if this is a streaming response for summary or chat
      if (
        message.type === "SUMMARY_LOADING" ||
        message.type === "SUMMARY_CHUNK" ||
        message.type === "STREAM_CHUNK" ||
        message.type === "STREAM_COMPLETE"
      ) {
        console.log(
          `[YouTube AI Summarizer] Received ${message.type} for response ${message.responseId}`
        );

        // Handle summary loading start
        if (message.type === "SUMMARY_LOADING") {
          // Show a placeholder while loading
          if (!document.getElementById("ai-summary-streaming-container")) {
            const summaryHTML = `
              <div id="ai-summary-streaming-container" class="ai-summary-streaming">
                <div class="ai-summary-content markdown-content">
                  <h2>Generating Summary...</h2>
                  <div id="${message.responseId}" class="streaming-content"></div>
                </div>
              </div>
            `;
            displaySummaryModal(summaryHTML, true);
          }
          return false;
        }

        // Handle summary chunk
        if (message.type === "SUMMARY_CHUNK") {
          // Update the streaming content
          const summaryElement = document.getElementById(message.responseId);
          if (summaryElement) {
            try {
              // Store the accumulated content
              let fullContent = "";

              if (
                message.isAppend &&
                summaryElement.getAttribute("data-content")
              ) {
                fullContent =
                  summaryElement.getAttribute("data-content") + message.text;
              } else {
                fullContent = message.text || "";
              }

              // Validate content before storing
              if (typeof fullContent !== "string") {
                console.error(
                  "[YouTube AI Summarizer] fullContent is not a string:",
                  typeof fullContent
                );
                fullContent = String(fullContent || "");
              }

              // Store the raw content as a data attribute for future appends
              summaryElement.setAttribute("data-content", fullContent);

              // Render the content as Markdown
              if (fullContent.trim()) {
                summaryElement.innerHTML = renderMarkdown(fullContent);
              } else {
                summaryElement.innerHTML = "<p>Receiving content...</p>";
              }
            } catch (error) {
              console.error(
                "[YouTube AI Summarizer] Error handling chunk:",
                error
              );
              summaryElement.innerHTML = `<p>Error processing chunk: ${error.message}</p>`;
            }

            // Scroll to ensure visible
            const contentWrapper = document.querySelector(
              ".ai-summary-content"
            );
            if (contentWrapper) {
              contentWrapper.scrollTop = contentWrapper.scrollHeight;
            }

            // Re-attach timestamp handlers
            attachTimestampClickHandlers();
          } else {
            console.error(
              "[YouTube AI Summarizer] summaryElement not found for ID:",
              message.responseId
            );
          }
          return false;
        }

        // Handle chat stream chunk (added new handler here)
        if (message.type === "STREAM_CHUNK") {
          console.log(
            "[YouTube AI Summarizer] Processing chat STREAM_CHUNK for",
            message.responseId
          );
          const content = extractStreamContent(message);

          if (content !== null) {
            // Use the updateStreamingMessage function to update the chat message
            updateStreamingMessage(
              message.responseId,
              content,
              message.isAppend || false
            );
          } else {
            console.error(
              "[YouTube AI Summarizer] Could not extract content from STREAM_CHUNK:",
              JSON.stringify(message).substring(0, 200)
            );
          }
          return false;
        }

        // Handle stream complete
        if (message.type === "STREAM_COMPLETE") {
          console.log(
            "[YouTube AI Summarizer] Chat stream complete for",
            message.responseId
          );
          // No need to do anything special here as the full message is already displayed
          return false;
        }
      }

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

      // Make sure we have a valid summary to display
      if (!summaryContent) {
        console.error(
          "[YouTube AI Summarizer] Received null or undefined summary"
        );
        displaySummaryModal("Error: No summary received. Please try again.");
        return false;
      }

      // Handle error messages coming from extractSummaryContent
      if (
        typeof summaryContent === "string" &&
        summaryContent.startsWith("Error:")
      ) {
        console.error(
          "[YouTube AI Summarizer] Error in summary content:",
          summaryContent
        );
        displaySummaryModal(summaryContent);
        return false;
      }

      // Display the summary
      displaySummaryModal(summaryContent);
    }
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
  content.className = "ai-summary-content markdown-content";
  content.id = "ai-summary-content";
  // Add some extra styling for better readability
  content.style.lineHeight = "1.6";
  content.style.fontSize = "16px";
  content.style.padding = "20px 24px"; // Increased padding
  content.style.color = "#333";

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
  const loadingIndicator = document.querySelector(".ai-summary-loading");
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
}

// Helper function to show errors in the modal
function showError(errorMessage) {
  console.error("[YouTube AI Summarizer] Error:", errorMessage);
  hideLoadingIndicator();
  displaySummaryModal(`
    <div class="ai-summary-error">
      <p>${errorMessage}</p>
      <p>Please try again or check the extension options.</p>
    </div>
  `);
  isSummaryInProgress = false;
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
function displaySummaryModal(summary, isStreaming = false) {
  console.log(
    "[YouTube AI Summarizer] Displaying summary modal, content type:",
    typeof summary,
    "isStreaming:",
    isStreaming,
    "content length:",
    typeof summary === "string"
      ? summary.length
      : summary?.data
      ? JSON.stringify(summary.data).length
      : "unknown"
  );

  // Validate summary input
  if (!summary && !isStreaming) {
    console.error("[YouTube AI Summarizer] Null or undefined summary provided");
    summary = "Error: No summary content received. Please try again.";
  }

  try {
    // Log additional details about the summary for debugging
    if (summary && !isStreaming) {
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
        const hasMarkdown =
          summary.includes("#") ||
          summary.includes("-") ||
          summary.includes("*") ||
          summary.includes(">");
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
        try {
          console.log(
            "[YouTube AI Summarizer] Summary object structure:",
            JSON.stringify(summary).substring(0, 500)
          );
        } catch (e) {
          console.error(
            "[YouTube AI Summarizer] Error stringifying summary object:",
            e
          );
        }
      }
    }

    // Store the conversation history
    // Initialize conversation history if it doesn't exist yet
    if (
      !window.conversationHistory &&
      !isStreaming &&
      typeof summary === "string"
    ) {
      // Create a fresh conversation history with the summary as the first message
      window.conversationHistory = [
        {
          role: "assistant",
          content: summary,
          id: "initial-summary-" + Date.now(),
        },
      ];

      console.log(
        "[YouTube AI Summarizer] Initialized conversation history with summary"
      );
    }

    // Remove any existing modal
    const existingModal = document.getElementById("ai-summary-modal-container");
    if (existingModal) {
      try {
        document.body.removeChild(existingModal);
      } catch (e) {
        console.error(
          "[YouTube AI Summarizer] Error removing existing modal:",
          e
        );
      }
    }

    // Create overlay
    const overlay = document.createElement("div");
    overlay.id = "ai-summary-modal-container";
    overlay.className = "ai-summary-overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "9999";

    // Create modal
    const modal = document.createElement("div");
    modal.className = "ai-summary-modal";
    modal.style.backgroundColor = "white";
    modal.style.borderRadius = "8px";
    modal.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.3)";
    modal.style.width = "80%";
    modal.style.maxWidth = "800px"; // Increased max width for longer content
    modal.style.maxHeight = "85vh"; // Increased max height
    modal.style.display = "flex";
    modal.style.flexDirection = "column";
    modal.style.fontSize = "16px"; // Base font size for better readability
    modal.style.overflowY = "hidden"; // Hide overflow on the modal itself

    // Header with title and close button
    const header = document.createElement("div");
    header.className = "ai-summary-header";
    header.style.padding = "16px 20px";
    header.style.borderBottom = "1px solid #e0e0e0";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.backgroundColor = "#f0f7ff"; // Light blue header

    const title = document.createElement("h3");
    title.textContent = "AI Summary & Chat";
    title.style.margin = "0";
    title.style.color = "#0066cc";
    title.style.fontSize = "20px";
    header.appendChild(title);

    const closeBtn = document.createElement("button");
    closeBtn.className = "ai-summary-close-btn";
    closeBtn.textContent = "×";
    closeBtn.style.background = "none";
    closeBtn.style.border = "none";
    closeBtn.style.fontSize = "24px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.color = "#0066cc";
    closeBtn.style.padding = "0 5px";
    closeBtn.addEventListener("click", () => {
      document.body.removeChild(overlay);
    });
    header.appendChild(closeBtn);

    modal.appendChild(header);

    // Content area with scrolling for longer content
    const contentWrapper = document.createElement("div");
    contentWrapper.style.flexGrow = "1";
    contentWrapper.style.overflowY = "auto"; // Allow scrolling for content
    contentWrapper.style.maxHeight = "calc(85vh - 180px)"; // Account for header, footer, and chat input

    const content = document.createElement("div");
    content.className = "ai-summary-content markdown-content";
    content.id = "ai-summary-content";
    // Add some extra styling for better readability
    content.style.lineHeight = "1.6";
    content.style.fontSize = "16px";
    content.style.padding = "20px 24px"; // Increased padding
    content.style.color = "#333";

    // If we're in streaming mode, just insert the HTML directly
    if (isStreaming) {
      if (typeof summary !== "string") {
        console.error(
          "[YouTube AI Summarizer] Expected string HTML for streaming mode but got:",
          typeof summary
        );
        summary = String(summary || "");
      }
      content.innerHTML = summary;
    } else {
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
            errorDiv.style.color = "#d32f2f";
            errorDiv.style.padding = "15px";
            errorDiv.style.backgroundColor = "#ffebee";
            errorDiv.style.borderRadius = "4px";
            errorDiv.innerText = summary;
            content.appendChild(errorDiv);
          }
          // Handle markdown formatting - ADD TYPE CHECK HERE
          else if (
            typeof summary === "string" &&
            (summary.includes("#") ||
              summary.includes("-") ||
              summary.includes("*") ||
              summary.includes(">"))
          ) {
            // This looks like Markdown - use our new Markdown renderer
            content.innerHTML = renderMarkdown(summary);
          } else if (typeof summary === "string" && summary.includes("•")) {
            // This is likely a bullet list - use special formatting
            content.innerHTML = formatBulletedSummary(summary);
          } else {
            // Simple string summary with enhanced formatting
            try {
              const paragraphs =
                typeof summary === "string" ? summary.split("\n\n") : [];
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
            } catch (error) {
              console.error(
                "[YouTube AI Summarizer] Error formatting paragraphs:",
                error
              );
              content.innerHTML = `<p>Error formatting content: ${error.message}</p>`;
              if (typeof summary === "string") {
                const rawPara = document.createElement("p");
                rawPara.style.whiteSpace = "pre-wrap";
                rawPara.textContent = summary;
                content.appendChild(rawPara);
              }
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
              keyPointsSection.style.backgroundColor = "#f0f7ff";
              keyPointsSection.style.padding = "16px";
              keyPointsSection.style.borderRadius = "8px";
              keyPointsSection.style.marginTop = "20px";

              const keyPointsTitle = document.createElement("h4");
              keyPointsTitle.textContent = "Key Points";
              keyPointsTitle.style.marginTop = "0";
              keyPointsTitle.style.marginBottom = "15px";
              keyPointsTitle.style.color = "#0066cc";
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
              if (
                typeof summary[key] === "string" &&
                summary[key].length > 50
              ) {
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
          errorDiv.style.color = "#d32f2f";
          errorDiv.style.padding = "15px";
          errorDiv.style.backgroundColor = "#ffebee";
          errorDiv.style.borderRadius = "4px";
          errorDiv.innerText = "Error: Received unexpected summary format.";
          content.appendChild(errorDiv);
        }
      } catch (error) {
        console.error(
          "[YouTube AI Summarizer] Error processing summary:",
          error
        );
        const errorDiv = document.createElement("div");
        errorDiv.className = "ai-summary-error";
        errorDiv.style.color = "#d32f2f";
        errorDiv.style.padding = "15px";
        errorDiv.style.backgroundColor = "#ffebee";
        errorDiv.style.borderRadius = "4px";
        errorDiv.innerText = "Error displaying summary: " + error.message;
        content.appendChild(errorDiv);
      }
    }

    // Add a separator for chat messages
    const chatSeparator = document.createElement("div");
    chatSeparator.style.marginTop = "20px";
    chatSeparator.style.marginBottom = "10px";
    chatSeparator.style.borderBottom = "1px solid #e0e0e0";
    chatSeparator.style.padding = "10px 0";
    chatSeparator.innerHTML =
      "<p style='text-align: center; color: #666; margin: 0;'>Ask questions about the video</p>";
    content.appendChild(chatSeparator);

    // Add chat message container
    const chatContainer = document.createElement("div");
    chatContainer.id = "chat-messages-container";
    chatContainer.style.marginTop = "15px";
    content.appendChild(chatContainer);

    contentWrapper.appendChild(content);
    modal.appendChild(contentWrapper);

    // Add chat input section
    const chatInputSection = document.createElement("div");
    chatInputSection.className = "ai-summary-chat-input";
    chatInputSection.style.borderTop = "1px solid #e0e0e0";
    chatInputSection.style.padding = "15px 20px";
    chatInputSection.style.display = "flex";
    chatInputSection.style.alignItems = "center";
    chatInputSection.style.backgroundColor = "#f8f8f8";
    chatInputSection.style.borderBottomLeftRadius = "8px";
    chatInputSection.style.borderBottomRightRadius = "8px";

    const chatInput = document.createElement("textarea");
    chatInput.id = "ai-chat-input";
    chatInput.placeholder = "Ask a question about the video...";
    chatInput.style.flexGrow = "1";
    chatInput.style.border = "1px solid #ddd";
    chatInput.style.borderRadius = "4px";
    chatInput.style.padding = "10px";
    chatInput.style.fontSize = "14px";
    chatInput.style.resize = "none";
    chatInput.style.minHeight = "40px";
    chatInput.style.maxHeight = "80px";
    chatInput.style.fontFamily = "inherit";
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const chatButton = document.getElementById("ai-chat-button");
        if (chatButton && !chatButton.disabled) {
          chatButton.click();
        }
      }
    });

    // Auto-resize textarea as user types
    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height =
        (chatInput.scrollHeight > 80 ? 80 : chatInput.scrollHeight) + "px";
    });

    const chatButton = document.createElement("button");
    chatButton.id = "ai-chat-button";
    chatButton.textContent = "Send";
    chatButton.style.marginLeft = "10px";
    chatButton.style.backgroundColor = "#0066cc";
    chatButton.style.color = "white";
    chatButton.style.border = "none";
    chatButton.style.borderRadius = "4px";
    chatButton.style.padding = "10px 20px";
    chatButton.style.fontSize = "14px";
    chatButton.style.fontWeight = "500";
    chatButton.style.cursor = "pointer";
    chatButton.style.minWidth = "80px";
    chatButton.addEventListener("click", handleChatSubmit);

    chatInputSection.appendChild(chatInput);
    chatInputSection.appendChild(chatButton);

    modal.appendChild(chatInputSection);

    // Add footer with attribution
    const footer = document.createElement("div");
    footer.className = "ai-summary-footer";
    footer.innerHTML =
      "<p>Powered by YouTube AI Summarizer with OpenRouter</p>";
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
  } catch (error) {
    console.error(
      "[YouTube AI Summarizer] Error displaying summary modal:",
      error
    );
    hideLoadingIndicator();
    isSummaryInProgress = false;
    // Reset button state
    if (summarizeButton) {
      summarizeButton.textContent = config.buttonText;
      summarizeButton.disabled = false;
    }
  }
}

// Function to handle chat submission
async function handleChatSubmit() {
  const chatInput = document.getElementById("ai-chat-input");
  const chatButton = document.getElementById("ai-chat-button");
  const chatContainer = document.getElementById("chat-messages-container");

  if (!chatInput || !chatContainer) return;

  const userMessage = chatInput.value.trim();
  if (!userMessage) return;

  // Disable input and button
  chatInput.disabled = true;
  chatButton.disabled = true;
  chatButton.textContent = "Sending...";

  // Display user message
  addChatMessage(userMessage, "user");

  // Add to conversation history
  if (!window.conversationHistory) {
    window.conversationHistory = [];
  }

  // Fix: Create a fresh copy of the conversation history for each request
  // This prevents the same history object from being reused across requests
  const currentHistory = JSON.parse(JSON.stringify(window.conversationHistory));
  currentHistory.push({ role: "user", content: userMessage });
  window.conversationHistory = currentHistory;

  // Create streaming response container
  const responseId = "response-" + Date.now();
  addChatMessage("", "assistant", responseId);

  try {
    // Get video metadata for context
    const videoMetadata = getVideoMetadata();

    console.log("[YouTube AI Summarizer] Sending chat message with payload:", {
      message: userMessage,
      historyLength: window.conversationHistory.length,
      metadata: videoMetadata,
      responseId: responseId,
    });

    // Send request to background script for streaming response
    const response = await chrome.runtime
      .sendMessage({
        type: "CHAT_MESSAGE",
        payload: {
          message: userMessage,
          history: window.conversationHistory,
          metadata: videoMetadata,
          responseId: responseId,
          // Include video ID in the payload to help background script access the cached transcript
          videoId: new URLSearchParams(window.location.search).get("v") || "",
        },
      })
      .catch((error) => {
        console.error(
          "[YouTube AI Summarizer] Chrome sendMessage error:",
          error
        );
        throw new Error(
          "Browser message sending failed: " +
            (error.message || "Unknown error")
        );
      });

    console.log(
      "[YouTube AI Summarizer] Chat message sent successfully, response:",
      response
    );

    if (response && response.error) {
      throw new Error(response.error);
    }

    console.log(
      "[YouTube AI Summarizer] Chat message sent, waiting for streaming response"
    );
  } catch (error) {
    console.error("[YouTube AI Summarizer] Error sending chat message:", error);
    updateStreamingMessage(
      responseId,
      "Error: Failed to send message. Please try again. Details: " +
        error.message
    );

    // Add error to console for debugging
    console.error("[YouTube AI Summarizer] Detailed error:", error);

    // Try direct API call as fallback
    try {
      console.log("[YouTube AI Summarizer] Attempting fallback method");
      await safeSendMessage({
        type: "CHAT_MESSAGE_FALLBACK",
        payload: {
          message: userMessage,
          history: window.conversationHistory,
          metadata: getVideoMetadata(),
          responseId: responseId,
          videoId: new URLSearchParams(window.location.search).get("v") || "",
        },
      });
    } catch (fallbackError) {
      console.error(
        "[YouTube AI Summarizer] Fallback also failed:",
        fallbackError
      );
    }
  } finally {
    // Reset input field
    chatInput.value = "";
    chatInput.style.height = "auto";

    // Re-enable input and button
    chatInput.disabled = false;
    chatButton.disabled = false;
    chatButton.textContent = "Send";
    chatInput.focus();
  }
}

// Function to add a chat message to the container
function addChatMessage(message, role, id = null) {
  const chatContainer = document.getElementById("chat-messages-container");
  if (!chatContainer) return;

  const messageElement = document.createElement("div");
  messageElement.className = "chat-message " + role;
  if (id) messageElement.id = id;

  // Style based on role
  messageElement.style.padding = "10px 15px";
  messageElement.style.marginBottom = "10px";
  messageElement.style.borderRadius = "8px";
  messageElement.style.maxWidth = "85%";
  messageElement.style.wordBreak = "break-word";

  if (role === "user") {
    messageElement.style.alignSelf = "flex-end";
    messageElement.style.backgroundColor = "#0066cc";
    messageElement.style.color = "white";
    messageElement.style.marginLeft = "auto";
    messageElement.textContent = message;
  } else {
    messageElement.style.alignSelf = "flex-start";
    messageElement.style.backgroundColor = "#f0f0f0";
    messageElement.style.color = "#333";
    messageElement.classList.add("markdown-content");

    // Parse markdown for assistant messages
    if (message) {
      messageElement.innerHTML = renderMarkdown(message);
    }

    // Store original message content as a data attribute if this is a streaming message
    if (id) {
      messageElement.setAttribute("data-content", message || "");
    }
  }

  // Make container flex for alignment
  chatContainer.style.display = "flex";
  chatContainer.style.flexDirection = "column";

  chatContainer.appendChild(messageElement);

  // Scroll to the new message
  const contentWrapper = document.querySelector(".ai-summary-content");
  if (contentWrapper) {
    contentWrapper.scrollTop = contentWrapper.scrollHeight;
  }

  return messageElement;
}

// Function to update a streaming message with new content
function updateStreamingMessage(id, content, isAppend = false) {
  console.log(
    `[YouTube AI Summarizer] Updating streaming message: ${id}, content length: ${
      content?.length || 0
    }, isAppend: ${isAppend}`
  );

  // Check for valid ID
  if (!id) {
    console.error(
      "[YouTube AI Summarizer] Missing message ID for updating streaming message"
    );
    return;
  }

  const messageElement = document.getElementById(id);
  if (!messageElement) {
    console.error(
      `[YouTube AI Summarizer] Message element not found for ID: ${id}`
    );
    return;
  }

  // Ensure content is a string
  let safeContent = content;
  if (content === undefined || content === null) {
    console.warn(
      "[YouTube AI Summarizer] Content is null or undefined, using empty string"
    );
    safeContent = "";
  } else if (typeof content !== "string") {
    console.warn(
      "[YouTube AI Summarizer] Content is not a string, converting:",
      typeof content
    );
    try {
      safeContent = String(content);
    } catch (error) {
      console.error(
        "[YouTube AI Summarizer] Error converting content to string:",
        error
      );
      safeContent = "";
    }
  }

  // Get the current content from the data attribute
  let fullContent = safeContent;

  if (isAppend) {
    try {
      // Append to existing content
      const existingContent = messageElement.getAttribute("data-content") || "";
      fullContent = existingContent + safeContent;
      console.log(
        `[YouTube AI Summarizer] Appending to existing content. New length: ${fullContent.length}`
      );
    } catch (error) {
      console.error("[YouTube AI Summarizer] Error appending content:", error);
      fullContent = safeContent; // Fall back to just using the new content
    }
  }

  try {
    // Store the raw content for future updates
    messageElement.setAttribute("data-content", fullContent);

    // Render as Markdown
    messageElement.innerHTML = renderMarkdown(fullContent);

    // Scroll to ensure visible
    const contentWrapper = document.querySelector(".ai-summary-content");
    if (contentWrapper) {
      contentWrapper.scrollTop = contentWrapper.scrollHeight;
    }

    // Add to conversation history if complete
    if (!isAppend && safeContent && !safeContent.startsWith("Error:")) {
      if (window.conversationHistory) {
        // Fix: Find if there's already an assistant message with this ID
        const messageIndex = window.conversationHistory.findIndex(
          (msg) => msg.role === "assistant" && msg.id === id
        );

        // Create new conversation history to avoid reference issues
        const updatedHistory = JSON.parse(
          JSON.stringify(window.conversationHistory)
        );

        // If an existing message with this ID is found, update it; otherwise add new
        if (messageIndex >= 0) {
          updatedHistory[messageIndex].content = safeContent;
        } else {
          updatedHistory.push({
            role: "assistant",
            content: safeContent,
            id: id,
          });
        }

        // Update the conversation history
        window.conversationHistory = updatedHistory;

        console.log(
          `[YouTube AI Summarizer] Updated conversation history, new length: ${window.conversationHistory.length}`
        );
      }
    }

    // Re-attach timestamp handlers
    attachTimestampClickHandlers();
  } catch (error) {
    console.error(
      "[YouTube AI Summarizer] Error updating streaming message:",
      error
    );
    messageElement.textContent =
      "Error rendering response: " + (error.message || "Unknown error");
  }
}

// Function to detect and enhance timestamps in text
function processTimestampsInText(text) {
  // Check for null or undefined input
  if (text === null || text === undefined) {
    console.error(
      "[YouTube AI Summarizer] Null or undefined text passed to processTimestampsInText"
    );
    return ""; // Return empty string instead of processing
  }

  try {
    // Ensure input is a string
    if (typeof text !== "string") {
      console.warn(
        "[YouTube AI Summarizer] Non-string passed to processTimestampsInText:",
        typeof text
      );
      text = String(text || "");
    }

    // Match patterns like '0:05', '1:30', '01:30', '1:30:45', etc.
    const timestampPattern = /\b(\d{1,2}:(?:\d{1,2}:)?\d{1,2})\b/g;

    // Replace timestamps with clickable links
    return text.replace(timestampPattern, (match, timestamp) => {
      try {
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
        return `<a href="#" class="timestamp-link" data-time="${seconds}" style="color: #0066cc; text-decoration: underline; font-weight: 600;">${match}</a>`;
      } catch (e) {
        console.error(
          "[YouTube AI Summarizer] Error processing timestamp:",
          e,
          "timestamp:",
          timestamp
        );
        return match; // Return original match on error
      }
    });
  } catch (error) {
    console.error(
      "[YouTube AI Summarizer] Error in processTimestampsInText:",
      error
    );
    if (typeof text === "string") {
      return text; // Return original text on error if it was a string
    } else {
      return ""; // Return empty string if original wasn't a string
    }
  }
}

// Function to enhance HTML content with timestamp styling
function enhanceHtmlWithTimestampsStyling(html) {
  if (!html) return "";

  // Regular expression to match YouTube time formats: 1:23, 01:23, 1:23:45, etc.
  const timeRegex = /\b(\d+:)?(\d+):(\d+)\b/g;

  // Replace timestamps with styled clickable spans while preserving HTML structure
  return html.replace(timeRegex, function (match) {
    return `<span class="ai-timestamp" style="color:#0066cc; font-weight:600; cursor:pointer; text-decoration:underline;" data-time="${match}">${match}</span>`;
  });
}

// New function to format bulleted summaries with improved styling
function formatBulletedSummary(text) {
  console.log("[YouTube AI Summarizer] formatBulletedSummary called with:", {
    textExists: !!text,
    textType: typeof text,
    textLength: text ? text.length : 0,
  });

  if (!text) {
    console.error(
      "[YouTube AI Summarizer] Null or undefined text passed to formatBulletedSummary"
    );
    return "<p>No content to display</p>";
  }

  if (typeof text !== "string") {
    console.warn(
      "[YouTube AI Summarizer] Non-string passed to formatBulletedSummary:",
      typeof text
    );
    try {
      text = String(text || "");
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error converting to string:", e);
      return "<p>Error processing content</p>";
    }
  }

  try {
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

          formatted += `<h3 style="color: #0066cc; font-size: 18px; font-weight: 600; margin-top: 20px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e0e0e0;">${processTimestampsInText(
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
  } catch (error) {
    console.error(
      "[YouTube AI Summarizer] Error formatting bulleted summary:",
      error
    );
    return "<p>Error formatting summary</p>";
  }
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
      <div style="background-color: #f0f7ff; padding: 16px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #0066cc;">
        <h3 style="color: #0066cc; margin-top: 0; margin-bottom: 10px; font-size: 18px;">${overviewTitle}</h3>
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
        level === 1 ? "#0066cc" : level === 2 ? "#333333" : "#555555";
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
      <div style="color: #0066cc; margin-right: 8px;">•</div>
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
    button.style.backgroundColor = "#0066cc";
    button.style.color = "white";
    button.style.border = "none";
    button.style.borderRadius = "2px";
    button.style.fontWeight = "500";
    button.style.cursor = "pointer";

    // Add hover effect
    button.addEventListener("mouseover", () => {
      button.style.backgroundColor = "#004499";
    });
    button.addEventListener("mouseout", () => {
      button.style.backgroundColor = "#0066cc";
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
      } catch (transcriptError) {
        console.error(
          "[YouTube AI Summarizer] Error showing transcript:",
          transcriptError
        );
        showError(
          "Could not find or open transcript. Please ensure the video has captions and try again."
        );
        return;
      }

      // Get the transcript text
      console.log("[YouTube AI Summarizer] Getting transcript");
      const transcript = await getTranscriptText();

      // Validate transcript
      if (!transcript || transcript.length < 100) {
        console.error(
          "[YouTube AI Summarizer] Transcript too short or empty:",
          transcript
        );
        showError(
          "Could not extract valid transcript. Please make sure the video has captions and try again."
        );
        return;
      }

      // Get video metadata for context
      const videoMetadata = getVideoMetadata();

      console.log(
        "[YouTube AI Summarizer] Sending summarize request with payload:",
        {
          text: transcript.substring(0, 100) + "...",
          metadataTitle: videoMetadata.title,
          url: videoMetadata.url,
        }
      );

      // Send request to background script to handle the AI processing
      isSummaryInProgress = true;
      const result = await safeSendMessage({
        type: "SUMMARIZE",
        payload: {
          text: transcript,
          title: videoMetadata.title,
          url: videoMetadata.url,
          channel: videoMetadata.channel,
          // Indicate we can handle streaming response for the initial summary
          supportStreaming: true,
        },
      });

      console.log(
        "[YouTube AI Summarizer] Summarize request sent, waiting for streaming response"
      );
    } catch (error) {
      console.error(
        "[YouTube AI Summarizer] Error during summarization:",
        error
      );
      showError("Error during summarization: " + error.message);
      hideLoadingIndicator();
      isProcessing = false;
      isSummaryInProgress = false;

      // Reset button state
      if (summarizeButton) {
        summarizeButton.textContent = config.buttonText;
        summarizeButton.disabled = false;
      }
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
  console.log("[YouTube AI Summarizer] renderTextSummary called with:", {
    textExists: !!text,
    textType: typeof text,
    containerExists: !!container,
    textLength: text ? text.length : 0,
  });

  if (!text) {
    console.error(
      "[YouTube AI Summarizer] No text provided to renderTextSummary"
    );
    container.innerHTML = "<p>No summary content available.</p>";
    return;
  }

  if (typeof text !== "string") {
    console.error(
      "[YouTube AI Summarizer] Non-string provided to renderTextSummary:",
      typeof text
    );
    try {
      text = String(text);
    } catch (e) {
      container.innerHTML = "<p>Error: Unable to process summary content.</p>";
      return;
    }
  }

  try {
    // Check if this looks like a bullet list with • characters
    if (text.includes("•")) {
      // This is likely a bullet list - use special formatting
      container.innerHTML = formatBulletedSummary(text);
    } else if (
      text.includes("#") ||
      text.includes("-") ||
      text.includes("*") ||
      text.includes(">")
    ) {
      // This looks like Markdown - use our new Markdown renderer
      container.innerHTML = renderMarkdown(text);
    } else {
      // Simple string summary with enhanced formatting
      const paragraphs = text.split("\n\n");
      // Clear container first
      container.innerHTML = "";

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

      // If no paragraphs were added, add the whole text as one paragraph
      if (container.innerHTML === "") {
        const p = document.createElement("div");
        p.style.marginBottom = "16px";
        p.innerHTML = processTimestampsInText(text);
        container.appendChild(p);
      }
    }
  } catch (error) {
    console.error("[YouTube AI Summarizer] Error in renderTextSummary:", error);
    container.innerHTML = `<p>Error rendering summary: ${error.message}</p>`;

    // Fallback to showing raw text
    const rawTextDiv = document.createElement("div");
    rawTextDiv.style.whiteSpace = "pre-wrap";
    rawTextDiv.style.marginTop = "16px";
    rawTextDiv.textContent = text;
    container.appendChild(rawTextDiv);
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
    overview.style.backgroundColor = "#f0f7ff";
    overview.style.borderRadius = "8px";
    overview.style.borderLeft = "4px solid #0066cc";

    // Process any timestamps in the overview
    overview.innerHTML = processTimestampsInText(data.overview);
    container.appendChild(overview);
  }

  // Chapters/sections
  if (data.chapters && data.chapters.length > 0) {
    data.chapters.forEach((chapter, index) => {
      const chapterSection = document.createElement("div");
      chapterSection.className = "summary-chapter";
      chapterSection.style.marginBottom = "30px"; // Increased spacing between chapters

      // Chapter header with timestamp if available
      const header = document.createElement("h3");
      header.style.fontSize = "20px";
      header.style.color = "#0066cc";
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
          pointItem.style.marginBottom = "16px"; // Increased spacing for better readability with longer content
          pointItem.style.paddingLeft = "4px";
          pointItem.style.lineHeight = "1.6"; // Better line height for readability

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
    takeawaysSection.style.padding = "20px"; // Increased padding for better readability
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
      takeawayItem.style.marginBottom = "16px"; // Increased spacing for longer content
      takeawayItem.style.lineHeight = "1.6"; // Better line height for readability

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

// New function to render Markdown content
function renderMarkdown(markdownText) {
  console.log("[YouTube AI Summarizer] renderMarkdown called with:", {
    textExists: !!markdownText,
    textType: typeof markdownText,
    textLength: markdownText ? markdownText.length : 0,
    textPreview: markdownText
      ? markdownText.substring(0, 100)
      : "undefined or empty",
  });

  // Safety check for undefined or null
  if (!markdownText) {
    console.warn(
      "[YouTube AI Summarizer] Attempted to render markdown with empty/null content"
    );
    return "<p>No content to display</p>";
  }

  try {
    // Ensure markdownText is a string
    if (typeof markdownText !== "string") {
      console.warn(
        "[YouTube AI Summarizer] markdownText is not a string:",
        typeof markdownText
      );
      // Try to convert to string if possible
      markdownText = String(markdownText);
    }

    // First, process timestamps in the text
    console.log("[YouTube AI Summarizer] Processing timestamps in text");
    const textWithTimestamps = processTimestampsInText(markdownText);

    console.log("[YouTube AI Summarizer] Starting markdown transformation");

    // Process Markdown syntax with more explicit error handling
    let html = textWithTimestamps;

    try {
      // Headers - h1, h2, h3
      html = html.replace(
        /^### (.*$)/gim,
        '<h3 style="font-size: 18px; color: #555555; margin-top: 20px; margin-bottom: 10px;">$1</h3>'
      );
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error processing h3 headers:", e);
    }

    try {
      html = html.replace(
        /^## (.*$)/gim,
        '<h2 style="font-size: 20px; color: #333333; margin-top: 24px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0;">$1</h2>'
      );
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error processing h2 headers:", e);
    }

    try {
      html = html.replace(
        /^# (.*$)/gim,
        '<h1 style="font-size: 22px; color: #0066cc; margin-top: 28px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #e0e0e0;">$1</h1>'
      );
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error processing h1 headers:", e);
    }

    // Bold
    try {
      html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error processing bold text:", e);
    }

    // Italic
    try {
      html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error processing italic text:", e);
    }

    // Lists - unordered
    try {
      html = html.replace(
        /^\s*[-*+]\s+(.*$)/gim,
        '<li style="margin-bottom: 8px;">$1</li>'
      );
    } catch (e) {
      console.error(
        "[YouTube AI Summarizer] Error processing unordered lists:",
        e
      );
    }

    // Lists - ordered
    try {
      html = html.replace(
        /^\s*(\d+)\.\s+(.*$)/gim,
        '<li style="margin-bottom: 8px;">$1. $2</li>'
      );
    } catch (e) {
      console.error(
        "[YouTube AI Summarizer] Error processing ordered lists:",
        e
      );
    }

    // Blockquotes
    try {
      html = html.replace(
        /^\>\s+(.*$)/gim,
        '<blockquote style="border-left: 4px solid #0066cc; padding-left: 16px; margin-left: 0; margin-right: 0; color: #555555;">$1</blockquote>'
      );
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error processing blockquotes:", e);
    }

    // Line breaks
    try {
      html = html.replace(
        /\n\n/gim,
        '</p><p style="margin-top: 16px; margin-bottom: 16px; line-height: 1.6;">'
      );
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error processing line breaks:", e);
    }

    try {
      // Finish by wrapping all content in a paragraph if not already part of a list
      html = html.replace(/<li/gim, "<||li"); // Temporarily escape list items
      html = html.replace(/<\/li>/gim, "</||li>");
      html = html.replace(
        /^(.+(?=<\/p>|$))/gim,
        '<p style="margin-top: 16px; margin-bottom: 16px; line-height: 1.6;">$1</p>'
      );
      html = html.replace(/<\|\|li/gim, "<li"); // Restore list items
      html = html.replace(/<\/\|\|li>/gim, "</li>");
    } catch (e) {
      console.error(
        "[YouTube AI Summarizer] Error wrapping content in paragraphs:",
        e
      );
    }

    // Properly wrap lists - with additional error checking
    try {
      // Use a more conservative approach for the list wrapping
      let htmlParts = html.split(/<li style="margin-bottom: 8px;">/);
      if (htmlParts.length > 1) {
        // We have list items, let's wrap them properly
        let newHtml = htmlParts[0]; // Start with content before the first list item
        let inList = false;

        for (let i = 1; i < htmlParts.length; i++) {
          let part = htmlParts[i];
          let endListPos = part.indexOf("</li>");

          if (endListPos !== -1) {
            // This part contains a complete list item
            if (!inList) {
              // Start a new list
              newHtml +=
                '<ul style="padding-left: 24px; margin-top: 12px; margin-bottom: 16px;"><li style="margin-bottom: 8px;">';
              inList = true;
            } else {
              // Continue existing list
              newHtml += '<li style="margin-bottom: 8px;">';
            }

            // Add the list item content and end tag
            newHtml += part.substring(0, endListPos + 5);

            // Add content after the list item
            let remainingContent = part.substring(endListPos + 5);

            // Check if this should end the list
            if (
              remainingContent.trim().startsWith("<h") ||
              remainingContent.trim().startsWith("<p")
            ) {
              newHtml += "</ul>";
              inList = false;
            }

            newHtml += remainingContent;
          } else {
            // No closing tag, just append the content
            newHtml += part;
          }
        }

        // Close any open list
        if (inList) {
          newHtml += "</ul>";
        }

        html = newHtml;
      }
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error wrapping lists:", e);
    }

    try {
      // Clean up empty paragraphs
      html = html.replace(/<p style="[^"]*"><\/p>/g, "");

      // Fix nested paragraph tags
      html = html.replace(/<p style="[^"]*">(<h[1-3])/g, "$1");
      html = html.replace(/<\/h[1-3]><\/p>/g, "</h3>");
    } catch (e) {
      console.error("[YouTube AI Summarizer] Error cleaning up HTML:", e);
    }

    console.log("[YouTube AI Summarizer] Markdown transformation complete");
    return html;
  } catch (error) {
    console.error(
      "[YouTube AI Summarizer] Fatal error in renderMarkdown:",
      error
    );
    // Return the original text wrapped in a paragraph as a fallback
    return `<p>${markdownText || "Error rendering content"}</p>`;
  }
}

// Add Markdown styles to the page
function addMarkdownStyles() {
  const styleElement = document.createElement("style");
  styleElement.textContent = `
    .markdown-content h1, .markdown-content h2, .markdown-content h3 {
      margin-top: 20px;
      margin-bottom: 12px;
      color: #0066cc;
      font-weight: 600;
    }
    
    .markdown-content h1 {
      font-size: 22px;
      border-bottom: 1px solid #e0e0e0;
      padding-bottom: 8px;
    }
    
    .markdown-content h2 {
      font-size: 20px;
    }
    
    .markdown-content h3 {
      font-size: 18px;
    }
    
    .markdown-content p {
      margin-bottom: 16px;
      line-height: 1.6;
    }
    
    .markdown-content ul, .markdown-content ol {
      padding-left: 24px;
      margin-bottom: 16px;
    }
    
    .markdown-content li {
      margin-bottom: 8px;
    }
    
    .markdown-content blockquote {
      border-left: 4px solid #0066cc;
      padding-left: 16px;
      margin-left: 0;
      margin-right: 0;
      color: #555;
    }
    
    .markdown-content strong {
      font-weight: 600;
    }
    
    .markdown-content .timestamp-link {
      color: #0066cc;
      text-decoration: underline;
      font-weight: 600;
    }
  `;
  document.head.appendChild(styleElement);
}

// Make sure to add styles when content script initializes
addMarkdownStyles();
