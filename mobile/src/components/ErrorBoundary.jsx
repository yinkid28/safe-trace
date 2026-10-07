import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("App crash caught by ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", padding: "2rem",
          fontFamily: "Inter, system-ui, sans-serif", textAlign: "center",
        }}>
          <h2 style={{ marginBottom: "0.5rem" }}>Something went wrong</h2>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            The app encountered an error. Please restart.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.href = "/";
            }}
            style={{
              padding: "0.75rem 1.5rem", background: "#6B4F3A", color: "#fff",
              border: "none", borderRadius: "8px", fontWeight: 600, cursor: "pointer",
            }}
          >
            Restart App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
