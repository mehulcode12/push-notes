export default function Loading() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#080808",
      color: "#f59e0b",
      fontFamily: "'JetBrains Mono', monospace"
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
        <div className="graph-loader">
          <div className="center-node" />
          <div className="orbit-node n1" />
          <div className="orbit-node n2" />
          <div className="orbit-node n3" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "10px", letterSpacing: "0.25em", fontWeight: 700, color: "#f59e0b" }}>
            MAPPING KNOWLEDGE GRAPH
          </span>
          <span style={{ fontSize: "9px", color: "#3a3a3a", letterSpacing: "0.05em" }}>
            Analyzing commit history and file structures...
          </span>
        </div>
      </div>
      <style>{`
        .graph-loader {
          position: relative;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .center-node {
          width: 12px;
          height: 12px;
          background: #f59e0b;
          border-radius: 50%;
          box-shadow: 0 0 20px rgba(245,158,11,0.4);
          z-index: 2;
        }
        .orbit-node {
          position: absolute;
          width: 8px;
          height: 8px;
          background: rgba(245,158,11,0.2);
          border: 1px solid rgba(245,158,11,0.4);
          border-radius: 50%;
        }
        .n1 { animation: orbit1 2s linear infinite; }
        .n2 { animation: orbit2 2.5s linear infinite; }
        .n3 { animation: orbit3 3s linear infinite; }

        @keyframes orbit1 {
          from { transform: rotate(0deg) translateX(25px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(25px) rotate(-360deg); }
        }
        @keyframes orbit2 {
          from { transform: rotate(120deg) translateX(25px) rotate(-120deg); }
          to   { transform: rotate(480deg) translateX(25px) rotate(-480deg); }
        }
        @keyframes orbit3 {
          from { transform: rotate(240deg) translateX(25px) rotate(-240deg); }
          to   { transform: rotate(600deg) translateX(25px) rotate(-600deg); }
        }
      `}</style>
    </div>
  );
}
