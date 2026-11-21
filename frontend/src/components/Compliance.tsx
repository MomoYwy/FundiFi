export function Compliance() {
  return <div className="feature-page">
    <header className="heading">
      <span className="eyebrow">ADMINISTRATION</span>
      <h1>Compliance Monitoring</h1>
      <p>No compliance service is connected. This view does not grant administrator permissions or establish regulatory compliance.</p>
    </header>
    <section className="feature-metrics" aria-label="Compliance metrics">
      {['Total value locked', 'Active loans', 'Default rate', 'Reserve fund balance'].map(label =>
        <div className="card feature-metric" key={label}><h2>{label}</h2><p>Unavailable</p><p className="hint">No complete, verified platform metric is connected.</p></div>)}
    </section>
    <div className="feature-grid">
      <section className="card">
        <h2>Regulatory compliance monitor</h2>
        <p className="muted">Compliance status and investor exposure controls are unavailable. Do not treat this screen as evidence of compliance.</p>
        <button className="secondary action" type="button" disabled>Change loan caps — unavailable</button>
      </section>
      <section className="card">
        <h2>Audit queue</h2>
        <p className="muted">No compliance review queue is connected. Review decisions cannot be made here.</p>
        <div className="dialog-actions">
          <button className="secondary" type="button" disabled>Approve override — unavailable</button>
          <button className="secondary" type="button" disabled>Block &amp; blacklist — unavailable</button>
        </div>
      </section>
      <section className="card"><h2>System health</h2><p className="muted">Gas and network performance analytics are unavailable.</p></section>
    </div>
  </div>
}
