// options.js
document.addEventListener("DOMContentLoaded", function () {
  // Default values
  const defaultPromptTemplate =
    "Please provide a concise summary of the following YouTube video transcript. Focus on the main points, key insights, and important details. Format the summary in a clear, readable way with paragraphs and bullet points where appropriate.\n\nVideo Title: {{title}}\nChannel: {{channel}}\nTranscript:\n{{transcript}}";
  const defaultApiEndpoint = "https://openrouter.ai/api/v1/chat/completions";
  const defaultModel = "anthropic/claude-3.5-sonnet";

  // DOM elements
  const apiKeyInput = document.getElementById("apiKey");
  const apiEndpointInput = document.getElementById("apiEndpoint");
  const promptTemplateInput = document.getElementById("promptTemplate");
  const saveButton = document.getElementById("saveBtn");
  const statusMessage = document.getElementById("statusMessage");
  const customModelInput = document.getElementById("custom-model");
  const modelRadios = document.querySelectorAll('input[name="model"]');

  // Load saved options
  function loadOptions() {
    chrome.storage.sync.get(
      {
        apiKey: "",
        apiEndpoint: defaultApiEndpoint,
        model: defaultModel,
        promptTemplate: defaultPromptTemplate,
      },
      function (items) {
        apiKeyInput.value = items.apiKey;
        apiEndpointInput.value = items.apiEndpoint;
        promptTemplateInput.value = items.promptTemplate;

        // Set the selected model radio
        let modelFound = false;
        modelRadios.forEach((radio) => {
          if (radio.value === items.model) {
            radio.checked = true;
            modelFound = true;
          }
        });

        // If model is not one of the predefined ones, select "other" and fill in custom field
        if (!modelFound) {
          document.getElementById("model-other").checked = true;
          customModelInput.value = items.model;
        }

        // Enable/disable custom model input based on selection
        toggleCustomModelInput();
      }
    );
  }

  // Save options
  function saveOptions() {
    // Get the selected model value
    let selectedModel = "";
    modelRadios.forEach((radio) => {
      if (radio.checked) {
        selectedModel = radio.value;
      }
    });

    // If "other" is selected, use the custom model input value
    if (selectedModel === "other") {
      selectedModel = customModelInput.value.trim();
    }

    // Validate inputs
    if (!apiKeyInput.value.trim()) {
      showMessage("Please enter an API key.", "error");
      return;
    }

    if (!apiEndpointInput.value.trim()) {
      showMessage("Please enter an API endpoint.", "error");
      return;
    }

    if (selectedModel === "") {
      showMessage("Please select or enter a model.", "error");
      return;
    }

    // Save to storage
    chrome.storage.sync.set(
      {
        apiKey: apiKeyInput.value.trim(),
        apiEndpoint: apiEndpointInput.value.trim(),
        model: selectedModel,
        promptTemplate: promptTemplateInput.value || defaultPromptTemplate,
      },
      function () {
        showMessage("Options saved successfully!", "success");
      }
    );
  }

  // Show status message
  function showMessage(text, type) {
    statusMessage.textContent = text;
    statusMessage.className = `message ${type}`;
    statusMessage.style.display = "block";

    // Hide after 3 seconds
    setTimeout(function () {
      statusMessage.style.display = "none";
    }, 3000);
  }

  // Toggle custom model input based on radio selection
  function toggleCustomModelInput() {
    customModelInput.disabled = !document.getElementById("model-other").checked;
    if (customModelInput.disabled) {
      customModelInput.value = "";
    }
  }

  // Restore default prompt template
  function restoreDefaultPrompt() {
    promptTemplateInput.value = defaultPromptTemplate;
  }

  // Event listeners
  saveButton.addEventListener("click", saveOptions);

  // Update custom model input state when radio selection changes
  modelRadios.forEach((radio) => {
    radio.addEventListener("change", toggleCustomModelInput);
  });

  // Add "Reset to Default" for the prompt template
  const resetLink = document.createElement("a");
  resetLink.href = "#";
  resetLink.textContent = "Reset to default";
  resetLink.style.fontSize = "12px";
  resetLink.style.marginLeft = "8px";
  resetLink.addEventListener("click", function (e) {
    e.preventDefault();
    restoreDefaultPrompt();
  });

  document.querySelector('label[for="promptTemplate"]').appendChild(resetLink);

  // Load options when page loads
  loadOptions();
});
