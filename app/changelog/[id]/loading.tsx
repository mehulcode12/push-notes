export default function Loading() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0a0a0a",
      color: "#f59e0b",
      fontFamily: "'JetBrains Mono', monospace"
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
        <div className="spinner" />
        <span style={{ fontSize: "12px", letterSpacing: "0.2em", fontWeight: 700 }}>PREPARING CHANGELOG...</span>
      </div>
      <style>{`
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(245,158,11,0.1);
          border-top-color: #f59e0b;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
