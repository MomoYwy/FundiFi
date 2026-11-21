export function SupportCenter() {
  return <div className="feature-page">
    <header className="card feature-header">
      <span className="eyebrow">HELP &amp; DISPUTES</span>
      <h1>Help &amp; Disputes</h1>
      <p className="muted">Support tickets, dispute handling and file uploads are not connected. Do not submit sensitive information here.</p>
    </header>
    <div className="feature-grid">
      <section className="card">
        <h2>Submit a support ticket</h2>
        <p className="hint">Ticket submission and attachments are unavailable.</p>
        <fieldset disabled>
          <label htmlFor="support-category">Category</label>
          <select id="support-category" defaultValue=""><option value="">Unavailable</option></select>
          <label htmlFor="support-transaction">Transaction hash</label>
          <input id="support-transaction" />
          <label htmlFor="support-description">Description</label>
          <textarea id="support-description" rows={4} />
          <label htmlFor="support-attachment">Attachment</label>
          <input id="support-attachment" type="file" />
          <button className="primary action" type="button" disabled>Submit support ticket — unavailable</button>
        </fieldset>
      </section>
      <section className="card">
        <h2>Ticket history</h2>
        <p className="muted">Unavailable: no ticket history service is connected.</p>
      </section>
    </div>
  </div>
}
