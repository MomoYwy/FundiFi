export function AIInsights() {
  return <div className="feature-page">
    <header className="heading">
      <span className="eyebrow">AI RISK INTELLIGENCE</span>
      <h1>AI Insights</h1>
      <p>Aggregate analytics and model performance metrics are not available from the current API.</p>
    </header>
    <section className="feature-metrics" aria-label="Model metrics">
      {['Model accuracy', 'AUC-ROC', 'Fraud detection rate', 'False positive rate'].map(label =>
        <div className="card feature-metric" key={label}><h2>{label}</h2><p>Unavailable</p><p className="hint">No verified metric is provided.</p></div>)}
    </section>
    <div className="feature-grid">
      <section className="card"><h2>Risk distribution</h2><p className="muted">Unavailable: the API does not provide aggregate application scores.</p></section>
      <section className="card"><h2>Model performance</h2><p className="muted">Unavailable: evaluation metrics are not exposed.</p></section>
      <section className="card"><h2>Cluster analysis</h2><p className="muted">Unavailable: cluster analytics are not exposed.</p></section>
      <section className="card"><h2>Fraud events</h2><p className="muted">Unavailable: no fraud event feed is connected.</p></section>
    </div>
    <p className="notice">Individual risk assessments are advisory and use self-reported, unverified history. They do not verify identity or guarantee repayment.</p>
  </div>
}
