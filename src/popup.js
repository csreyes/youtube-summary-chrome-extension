// popup.js
document.addEventListener("DOMContentLoaded", function () {
  const summarizeBtn = document.getElementById("summarizeBtn");
  const optionsBtn = document.getElementById("optionsBtn");
  const statusContainer = document.getElementById("statusContainer");
  const statusMessage = document.getElementById("statusMessage");
  const currentPageMessage = document.getElementById("currentPageMessage");

  console.log("[YouTube AI Summarizer] Popup opened");

  // Set initial state for summarize button
  summarizeBtn.disabled = true;

  // State to track if content script is ready
  let contentScriptReady = false;
  let maxRetries = 3;
  let retryCount = 0;

  // Function to safely send tab messages
  function safeTabSendMessage(tabId, message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[YouTube AI Summarizer] Message error:",
              chrome.runtime.lastError
            );
            resolve({ error: chrome.runtime.lastError, response: null });
          } else {
            resolve({ error: null, response });
          }
        });
      } catch (e) {
        console.error("[YouTube AI Summarizer] Send exception:", e);
        resolve({ error: e, response: null });
      }
    });
  }

  // Check if current page is a YouTube video
  function checkCurrentTab() {
    console.log("[YouTube AI Summarizer] Checking current tab");
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const currentTab = tabs[0];
      const url = currentTab.url || "";

      console.log("[YouTube AI Summarizer] Current URL:", url);

      if (url.includes("youtube.com/watch")) {
        // This is a YouTube video page
        currentPageMessage.textContent =
          "Ready to summarize this YouTube video!";

        // Check if content script is ready
        if (!contentScriptReady) {
          checkContentScriptReady(currentTab.id);
        } else {
          // Content script already verified as ready
          checkApiKeyConfigured();
        }
      } else {
        // Not a YouTube video page
        currentPageMessage.textContent =
          "Navigate to a YouTube video to use this extension.";
        summarizeBtn.disabled = true;
        showStatus(
          "Please open a YouTube video to use this extension",
          "warning"
        );
      }
    });
  }

  // Check if content script is ready with retries
  async function checkContentScriptReady(tabId) {
    console.log(
      "[YouTube AI Summarizer] Checking if content script is ready (attempt " +
        (retryCount + 1) +
        "/" +
        (maxRetries + 1) +
        ")"
    );

    // Try to send a message to the content script
    const { error, response } = await safeTabSendMessage(tabId, {
      action: "ping",
    });

    if (error) {
      // Content script not ready
      console.error("[YouTube AI Summarizer] Content script not ready:", error);

      if (retryCount < maxRetries) {
        // Retry after a delay
        retryCount++;
        console.log("[YouTube AI Summarizer] Retrying in 300ms...");
        setTimeout(() => checkContentScriptReady(tabId), 300);
      } else {
        // Max retries reached, show error
        summarizeBtn.disabled = true;
        showStatus(
          "Error: Content script not ready. Try refreshing the page.",
          "error"
        );
      }
    } else {
      console.log("[YouTube AI Summarizer] Content script ready:", response);
      // Content script is ready, now check API key
      contentScriptReady = true;
      retryCount = 0;
      checkApiKeyConfigured();
    }
  }

  // Check if API key is configured
  function checkApiKeyConfigured() {
    console.log("[YouTube AI Summarizer] Checking if API key is configured");
    chrome.storage.sync.get(["apiKey"], function (result) {
      // Even if no API key, we still enable the button since we have a fallback summary
      summarizeBtn.disabled = false;

      if (!result.apiKey) {
        showStatus(
          "API key not configured. A placeholder summary will be shown.",
          "warning"
        );
      } else {
        hideStatus();
      }
    });
  }

  // Show status message
  function showStatus(message, type) {
    console.log("[YouTube AI Summarizer] Showing status:", message, type);
    statusMessage.textContent = message;
    statusContainer.className = `status ${type}`;
    statusContainer.style.display = "block";
  }

  // Hide status message
  function hideStatus() {
    statusContainer.style.display = "none";
  }

  // Handle summarize button click
  summarizeBtn.addEventListener("click", async function () {
    console.log("[YouTube AI Summarizer] Summarize button clicked");
    // Disable button to prevent multiple clicks
    summarizeBtn.disabled = true;

    // Send message to the content script
    chrome.tabs.query(
      { active: true, currentWindow: true },
      async function (tabs) {
        console.log(
          "[YouTube AI Summarizer] Sending initiateSummarize to tab:",
          tabs[0].id
        );

        const { error, response } = await safeTabSendMessage(tabs[0].id, {
          action: "initiateSummarize",
        });

        if (error) {
          console.error(
            "[YouTube AI Summarizer] Error sending message:",
            error
          );
          showStatus(
            "Error: Content script not ready. Try refreshing the page.",
            "error"
          );
          summarizeBtn.disabled = false;
        } else if (response && response.status === "error") {
          console.error(
            "[YouTube AI Summarizer] Error from content script:",
            response.message
          );
          showStatus(`Error: ${response.message}`, "error");
          summarizeBtn.disabled = false;
        } else {
          console.log(
            "[YouTube AI Summarizer] Summarize initiated successfully"
          );
          // Close the popup
          window.close();
        }
      }
    );
  });

  // Handle options button click
  optionsBtn.addEventListener("click", function () {
    console.log("[YouTube AI Summarizer] Opening options page");
    chrome.runtime.openOptionsPage();
  });

  // Listen for content script ready messages
  chrome.runtime.onMessage.addListener(function (
    message,
    sender,
    sendResponse
  ) {
    console.log("[YouTube AI Summarizer] Received message in popup:", message);
    if (message.type === "CONTENT_SCRIPT_READY") {
      console.log("[YouTube AI Summarizer] Content script is ready");
      contentScriptReady = true;
      checkCurrentTab();
    }
    // Don't keep channel open
    return false;
  });

  // Check current tab when popup opens
  checkCurrentTab();
});
