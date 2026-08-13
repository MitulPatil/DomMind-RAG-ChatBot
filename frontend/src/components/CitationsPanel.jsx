export function CitationsPanel({ citations }) {
  return (
    <div className="citations-panel">
      <div className="citations-heading">Sources</div>
      {citations.map(citation => (
        <div key={citation.citationNumber} className="citation-card">
          <div className="citation-title">
            <span className="citation-number">{citation.citationNumber}</span>
            <span className="citation-page">{citation.pageReference}</span>
          </div>
          <div className="citation-preview">{citation.preview}</div>
          {citation.similarity && (
            <div className="citation-meta">
              Relevance: {(citation.similarity * 100).toFixed(0)}%
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
