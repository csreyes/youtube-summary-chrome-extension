// background.js (Service Worker)

// Add debugging
console.log("[YouTube AI Summarizer] Background service worker started");

// Default configuration
const DEFAULT_CONFIG = {
  apiKey: process.env.OPENROUTER_API_KEY || "", // Use environment variable as default
  apiEndpoint: "https://openrouter.ai/api/v1/chat/completions",
  model: "anthropic/claude-3.5-sonnet",
  promptTemplate:
    "Please provide a concise summary of the following YouTube video transcript. Focus on the main points, key insights, and important details.\n\nVideo Title: {{title}}\nChannel: {{channel}}\nTranscript:\n{{transcript}}",
};

// Track tabs with active content scripts
const activeContentScriptTabs = new Set();

// For testing - provides a sample summary if no API key is set
function getTestSummary(videoTitle, channelName, transcriptLength) {
  console.log(
    "[YouTube AI Summarizer] Using test summary as no API key is configured"
  );
  return `# Summary of "${videoTitle}" by ${channelName}

This video discusses important concepts around the given topic. The speaker covers several key points:

## Main Points:
- The transcript was successfully extracted (${transcriptLength} characters)
- This is a placeholder summary since no API key is configured
- To get real summaries, please configure your API key in the extension options

## How to Configure:
1. Click on the extension icon
2. Select "Options"
3. Enter your OpenAI API key
4. Save the settings

Once configured, you'll get real AI-generated summaries instead of this placeholder.`;
}

// Function to safely send messages to tabs - handles any errors gracefully
async function safeSendTabMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    console.log(
      `[YouTube AI Summarizer] Error sending message to tab ${tabId}:`,
      e.message
    );
    return null;
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log(
    "[YouTube AI Summarizer] Background received message:",
    message.type,
    sender.tab ? `from tab ${sender.tab.id}` : "from extension"
  );

  if (message.type === "SUMMARIZE") {
    console.log("[YouTube AI Summarizer] Handling summarize request");
    // Don't use sendResponse here since we're handling things asynchronously
    handleSummarizeRequest(message.payload, sender.tab.id).catch((error) =>
      console.error(
        "[YouTube AI Summarizer] Error in summarize handler:",
        error
      )
    );

    // No need to return true - we're not using sendResponse
    return false;
  }

  if (message.type === "CONTENT_SCRIPT_READY" && sender.tab) {
    console.log(
      "[YouTube AI Summarizer] Content script ready in tab",
      sender.tab.id
    );
    // Remember this tab has an active content script
    activeContentScriptTabs.add(sender.tab.id);

    // Forward the ready state to the popup if it's open
    try {
      chrome.runtime
        .sendMessage({
          type: "CONTENT_SCRIPT_READY",
          tabId: sender.tab.id,
        })
        .catch((error) => {
          // Popup might not be open, which is fine
          console.log(
            "[YouTube AI Summarizer] Could not forward ready state (expected if popup not open)"
          );
        });
    } catch (e) {
      // This is expected if no popup is listening
      console.log(
        "[YouTube AI Summarizer] Could not forward ready state (expected if popup not open)"
      );
    }

    return false;
  }

  // Default - don't keep channel open
  return false;
});

// Listen for tab updates to track active content scripts
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // If the tab is completely loaded and it's a YouTube video
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("youtube.com/watch")
  ) {
    console.log("[YouTube AI Summarizer] YouTube tab updated:", tabId);
  }
});

// When a tab is closed, remove it from our tracking
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeContentScriptTabs.has(tabId)) {
    console.log("[YouTube AI Summarizer] Removing tab from tracking:", tabId);
    activeContentScriptTabs.delete(tabId);
  }
});

// Handle summarize requests by getting user config and calling the API
async function handleSummarizeRequest(payload, tabId) {
  console.log(`[Background] Processing summarize request for tab ${tabId}`);

  try {
    // Validate that we have a proper transcript
    if (
      !payload.text ||
      payload.text.trim().length < 100 ||
      payload.text.includes("[]")
    ) {
      console.error(
        "[Background] Invalid transcript received:",
        payload.text?.substring(0, 100)
      );
      await notifyError(
        tabId,
        "Could not extract valid transcript. Please make sure the video has captions and try again."
      );
      return;
    }

    // Get the API key and endpoint from storage
    const { apiKey, apiEndpoint, model, maxTokens, temperature } =
      await getConfig();

    if (!apiKey) {
      console.error("[Background] API key not configured");
      await notifyError(
        tabId,
        "Please configure your API key in the extension options"
      );
      return;
    }

    // Send the summarization request to the OpenRouter API
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim().replace(/"/g, "")}`,
        "HTTP-Referer": "https://youtube-summarizer-extension.com", // Required by OpenRouter
        "X-Title": "YouTube AI Summarizer", // Required by OpenRouter
      },
      body: JSON.stringify({
        model: model || "anthropic/claude-3.5-sonnet",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that summarizes YouTube video transcripts. Focus only on educational content and main informational points.",
          },
          {
            role: "user",
            content: `Please provide a factual, educational summary of this YouTube video transcript. Focus only on the main informational points and educational content:\n\n${payload.text}`,
          },
        ],
        temperature: 0.3, // Use a lower temperature for more focused summaries
        stream: false, // Disable streaming to ensure we get a complete response
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(
        "[Background] API request failed:",
        response.status,
        errorData
      );
      await notifyError(tabId, `API request failed: ${response.statusText}`);
      return;
    }

    const data = await response.json();
    console.log("[Background] API response:", data); // Log the full response for debugging

    // Check if the response was blocked by content filter
    if (data.choices[0]?.finish_reason === "content_filter") {
      console.error("[Background] Content filter triggered in OpenAI API");
      await notifyError(
        tabId,
        "Unable to generate summary due to content filter. The video may contain sensitive content."
      );
      return;
    }

    // Extract summary from the OpenRouter response
    const summary = data.choices[0]?.message?.content;

    // More robust validation
    if (!summary || summary.length < 20) {
      console.error("[Background] Invalid or incomplete summary:", summary);
      await notifyError(
        tabId,
        "Unable to generate a meaningful summary. The content may have been too complex or inappropriate."
      );
      return;
    }

    console.log(
      `[Background] Generated summary (${summary.length} chars) for tab ${tabId}`
    );

    // Send the summary back to the content script
    chrome.tabs.sendMessage(tabId, { action: "display_summary", summary });
  } catch (error) {
    console.error("[Background] Error during summarization:", error);
    await notifyError(tabId, `Error: ${error.message}`);
  }
}

// Get user configuration from storage, with fallbacks to defaults
async function getUserConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        apiKey: process.env.OPENROUTER_API_KEY || "", // Use environment variable as default
        apiEndpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: "anthropic/claude-3.5-sonnet",
        promptTemplate:
          "Please provide a concise summary of the following YouTube video transcript. Focus on the main points, key insights, and important details.\n\nVideo Title: {{title}}\nChannel: {{channel}}\nTranscript:\n{{transcript}}",
      },
      (items) => {
        resolve(items);
      }
    );
  });
}

// Replace template variables in the prompt template
function createPromptFromTemplate(template, data) {
  let prompt = template;

  // Replace each template variable with its value
  Object.keys(data).forEach((key) => {
    const placeholder = `{{${key}}}`;
    prompt = prompt.replace(new RegExp(placeholder, "g"), data[key]);
  });

  console.log(
    "[YouTube AI Summarizer] Created prompt with length:",
    prompt.length
  );
  return prompt;
}

// Call the LLM API with the prompt
async function callLlmApi(prompt, config) {
  try {
    console.log(
      "[YouTube AI Summarizer] Preparing API request to:",
      config.apiEndpoint
    );
    // OpenRouter request format
    const requestData = {
      model: config.model || "anthropic/claude-3.5-sonnet",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that summarizes YouTube video transcripts. Focus only on educational content and main informational points.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3, // Use a lower temperature for more focused summaries
      stream: false, // Disable streaming to ensure we get a complete response
    };

    // Make the API request
    console.log("[YouTube AI Summarizer] Sending API request");
    const response = await fetch(config.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey.trim().replace(/"/g, "")}`,
        "HTTP-Referer": "https://youtube-summarizer-extension.com", // Required by OpenRouter
        "X-Title": "YouTube AI Summarizer", // Required by OpenRouter
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(
        "[YouTube AI Summarizer] API error response:",
        response.status,
        errorData
      );
      throw new Error(
        errorData.error?.message ||
          `API request failed with status ${response.status}`
      );
    }

    const data = await response.json();
    console.log("[YouTube AI Summarizer] API response received");

    // Check for content filter
    if (data.choices?.[0]?.finish_reason === "content_filter") {
      console.error(
        "[YouTube AI Summarizer] Content filter triggered in API response"
      );
      throw new Error("Content filter triggered. Unable to generate summary.");
    }

    // Extract the summary text from the response
    const summaryText =
      data.choices?.[0]?.message?.content || "No summary was generated.";

    // Validate response
    if (!summaryText || summaryText.length < 20) {
      console.error(
        "[YouTube AI Summarizer] Summary too short or empty:",
        summaryText
      );
      throw new Error(
        "Generated summary was too short or empty. Please try again."
      );
    }

    console.log(
      "[YouTube AI Summarizer] Summary extracted, length:",
      summaryText.length
    );

    return summaryText;
  } catch (error) {
    console.error("[YouTube AI Summarizer] LLM API error:", error);
    throw new Error(`Failed to get summary: ${error.message}`);
  }
}

// Send an error message back to the content script
async function notifyError(tabId, errorMessage) {
  console.error("[YouTube AI Summarizer] Error notification:", errorMessage);
  await safeSendTabMessage(tabId, {
    type: "SUMMARY_RESULT",
    summary: `Error: ${errorMessage}`,
  });
}

// Set up initial configuration when extension is installed
chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log("[YouTube AI Summarizer] Extension installed, reason:", reason);
  if (reason === "install") {
    // Set default configuration
    chrome.storage.sync.set(DEFAULT_CONFIG, () => {
      console.log("[YouTube AI Summarizer] Default configuration set");

      // Open options page for initial setup
      chrome.runtime.openOptionsPage();
    });
  }
});

// Add this function to the background.js file if it's missing
function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        apiKey: process.env.OPENROUTER_API_KEY || "", // Use environment variable as default
        apiEndpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: "anthropic/claude-3.5-sonnet",
        maxTokens: 1000,
        temperature: 0.3,
      },
      (items) => {
        resolve(items);
      }
    );
  });
}
