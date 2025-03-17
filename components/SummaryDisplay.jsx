import React from "react";
import ReactMarkdown from "react-markdown";

const SummaryDisplay = ({ summary }) => {
  // Safety check to ensure summary exists
  if (!summary) {
    return <div className="error-message">No summary available</div>;
  }

  // Try-catch block to handle any rendering errors
  try {
    return (
      <div className="summary-container">
        <ReactMarkdown>{summary}</ReactMarkdown>
      </div>
    );
  } catch (error) {
    console.error("Error rendering markdown:", error);
    return (
      <div className="error-message">
        <p>Error rendering summary: {error.message}</p>
        <p className="raw-summary">{summary}</p>
      </div>
    );
  }
};

export default SummaryDisplay;
