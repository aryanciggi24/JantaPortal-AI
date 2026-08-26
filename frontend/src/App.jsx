import { useEffect, useMemo, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const DEMO_CASE_META = {
  'CASE-2026-001': { location: 'Pune, Maharashtra', days: 7 },
  'CASE-2026-002': { location: 'Lucknow, Uttar Pradesh', days: 14 },
  'CASE-2026-003': { location: 'Bengaluru Urban, Karnataka', days: 25 },
}
const CIVIC_CATEGORIES = ['Public Works & Municipal Roads', 'Higher Education & Scholarships', 'Water Supply & Drainage Infrastructure', 'Sanitation & Waste Management', 'Electricity Distribution & Street Lighting', 'Public Distribution System (PDS / Ration)', 'Healthcare & Public Health Centers', 'Revenue & Land Records', 'Public Transport & Traffic Operations']
const EMPTY_FORM = { category: CIVIC_CATEGORIES[0], location: '', prompt_text: '', days_pending: 1 }

export default function App() {
  const [cases, setCases] = useState([])
  const [dossiers, setDossiers] = useState({})
  const [caseData, setCaseData] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [activeTab, setActiveTab] = useState('cpgrams')
  const [role, setRole] = useState('citizen')
  const [loginOpen, setLoginOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [filter, setFilter] = useState('all')
  const [queueActions, setQueueActions] = useState({})
  const [guardrailOpen, setGuardrailOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { loadInitialCases() }, [])

  const persona = role === 'officer' ? { title: 'Nodal Officer (PWD Desk)' } : { title: 'Citizen (Demo)' }
  const allCaseRows = useMemo(() => cases.map(item => dossiers[item.case_id] || { ...item, district: DEMO_CASE_META[item.case_id]?.location, days_pending: DEMO_CASE_META[item.case_id]?.days }), [cases, dossiers])

  async function requestJson(url, options, label) {
    const response = await fetch(url, options)
    if (!response.ok) throw new Error(`${label} (${response.status})`)
    return response.json()
  }
  async function loadInitialCases() {
    try {
      const items = await requestJson(`${API}/api/cases`, undefined, 'Unable to load demo cases')
      setCases(items)
      const fullCases = await Promise.all(items.map(async item => {
        try { return await requestJson(`${API}/api/cases/${item.case_id}`, undefined, 'Case unavailable') }
        catch { return { ...item, district: DEMO_CASE_META[item.case_id]?.location, state: '', days_pending: DEMO_CASE_META[item.case_id]?.days } }
      }))
      const map = Object.fromEntries(fullCases.map(item => [item.case_id, item]))
      setDossiers(map)
      if (fullCases[0]) selectCase(fullCases[0], map)
    } catch (err) { setError(`${err.message}. Confirm that FastAPI is running on port 8000.`) }
  }
  function selectCase(selected, source = dossiers) {
    const data = typeof selected === 'string' ? source[selected] : selected
    if (!data) return
    setCaseData(data); setAnalysis(null); setActiveTab('cpgrams'); setError(''); setNotice('')
  }
  async function runAnalysis(data = caseData, payload) {
    if (!data) return
    setLoading(true); setError(''); setNotice('')
    try {
      const result = await requestJson(`${API}/api/cases/${data.case_id}/analyze`, {
        method: 'POST', headers: payload ? { 'Content-Type': 'application/json' } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      }, 'Analysis could not be completed')
      setAnalysis(result)
      setActiveTab(data.days_pending > 21 ? 'rti' : 'cpgrams')
      setNotice('Routing assessment and formal drafts are ready for review.')
    } catch (err) { setError(`${err.message}. The dossier remains available locally; retry when the backend is online.`) }
    finally { setLoading(false) }
  }
  async function submitCustomCase(event) {
    event.preventDefault()
    const caseId = `CASE-2026-CUSTOM-${String(Date.now()).slice(-6)}`
    const data = { case_id: caseId, ...form, district: form.location, state: 'India', applicant_name: 'Demo Custom Citizen' }
    const nextDossiers = { ...dossiers, [caseId]: data }
    setDossiers(nextDossiers); setCases(current => [...current, { case_id: caseId, category: form.category }])
    setCaseData(data); setAnalysis(null); setFormOpen(false); setForm(EMPTY_FORM)
    await runAnalysis(data, form)
  }
  async function copyPayload() {
    try { await navigator.clipboard.writeText(analysis.formatted_cpgrams_text); setNotice('CPGRAMS payload copied to clipboard.') }
    catch { setError('Clipboard access is unavailable. Please select and copy the text manually.') }
  }
  async function downloadRti() {
    if (!caseData || !analysis) return
    try {
      const response = await fetch(`${API}/api/cases/${caseData.case_id}/download-rti`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ case_id: caseData.case_id, formatted_rti_text: analysis.formatted_rti_text }) })
      if (!response.ok) throw new Error(`PDF download failed (${response.status})`)
      const href = URL.createObjectURL(await response.blob())
      const link = Object.assign(document.createElement('a'), { href, download: `${caseData.case_id}-rti-application.pdf` })
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href)
    } catch (err) { setError(err.message) }
  }
  function changeQueueAction(caseId, action) { setQueueActions(current => ({ ...current, [caseId]: action })); setNotice(`${caseId}: ${action}.`) }
  function login(nextRole) { setRole(nextRole); setLoginOpen(false); setNotice(`Logged in as ${nextRole === 'officer' ? 'Nodal Officer (PWD Desk)' : 'Citizen (Demo)'}.`) }

  return <div className="min-h-screen bg-white text-slate-900">
    <header className="site-header"><div className="shell header-row"><div className="brand"><strong>JantaPortal AI</strong><span className="status-dot" aria-hidden="true"/><span className="system-label">System online · Port 8000</span></div><nav className="header-actions" aria-label="Account actions"><span className="persona">Logged in as: <b>{persona.title}</b></span>{role === 'citizen' && <button className="file-action" onClick={() => setFormOpen(true)}>+ File Grievance</button>}<button className="text-action" onClick={() => setLoginOpen(true)}>Demo Login</button></nav></div></header>
    <aside className="guardrail"><div className="shell"><button className="guardrail-toggle" onClick={() => setGuardrailOpen(open => !open)} aria-expanded={guardrailOpen}><span><b>About JantaPortal AI &amp; Guardrails</b><small>CPGRAMS pre-screening and admissibility guidance</small></span><span>{guardrailOpen ? 'Hide details' : 'View details'}</span></button>{guardrailOpen && <div className="guardrail-content"><div><b>What we do</b><p>Autonomous AI pre-screening, bureaucratic CPGRAMS draft formatting, department mapping, and automatic RTI escalation tracking after 21 days.</p></div><div><b>What is excluded (CPGRAMS policy)</b><ul><li>RTI matters — handled separately via our RTI Generator</li><li>Subjudice / court-related matters</li><li>Religious disputes</li><li>Internal Government employee service matters</li></ul></div></div>}</div></aside>
    <main className="shell main-content">
      {error && <Message type="error">{error}</Message>}{notice && <Message type="notice">{notice}</Message>}
      {role === 'citizen' ? <CitizenView cases={cases} dossiers={dossiers} caseData={caseData} analysis={analysis} activeTab={activeTab} setActiveTab={setActiveTab} loading={loading} onSelect={selectCase} onAnalyze={() => runAnalysis()} onCopy={copyPayload} onDownload={downloadRti}/> : <OfficerView cases={allCaseRows} filter={filter} setFilter={setFilter} queueActions={queueActions} onAction={changeQueueAction}/>} 
    </main>
    {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onLogin={login}/>} 
    {formOpen && <GrievanceModal form={form} setForm={setForm} loading={loading} onClose={() => setFormOpen(false)} onSubmit={submitCustomCase}/>} 
  </div>
}

function CitizenView({ cases, dossiers, caseData, analysis, activeTab, setActiveTab, loading, onSelect, onAnalyze, onCopy, onDownload }) {
  const scope = admissibility(caseData)
  return <><section className="intro"><p className="eyebrow">Citizen workspace</p><h1>Prepare a clear public grievance.</h1><p>Review a synthetic case or file a demonstration grievance. JantaPortal AI structures the request, identifies the appropriate desk, and flags a record-based RTI escalation after 21 days.</p></section><section className="case-strip" aria-label="Synthetic test cases">{cases.map(item => { const dossier = dossiers[item.case_id] || item; const selected = caseData?.case_id === item.case_id; const days = dossier.days_pending ?? DEMO_CASE_META[item.case_id]?.days ?? 0; return <button key={item.case_id} className={`case-link ${selected ? 'selected' : ''}`} onClick={() => onSelect(dossier)}><span className="case-id">{item.case_id}</span><span>{displayCategory(item.category)}</span><small>{dossier.district || DEMO_CASE_META[item.case_id]?.location || 'Custom case'} · {days} days pending</small>{selected && <em className="selected-badge">Currently selected</em>}{days > 21 && <em className="rti-badge">RTI escalation required</em>}</button>})}</section><Workflow caseData={caseData} analysis={analysis} loading={loading}/><section className="split-layout"><article className="panel dossier-panel"><PanelHeading eyebrow="Citizen grievance dossier" title={caseData?.case_id || 'Select a case'}/>{caseData ? <><div className="scope-status"><span className={scope.admissible ? 'admissible' : 'non-admissible'}>{scope.label}</span>{!scope.admissible && <small>{scope.reason}</small>}</div><div className="metadata"><Info label="Category" value={displayCategory(caseData.category)}/><Info label="Filing date" value={`Demo filing · ${caseData.days_pending} days ago`}/><Info label="Location" value={`${caseData.district || '—'}${caseData.state ? `, ${caseData.state}` : ''}`}/><Info label="Target authority" value={analysis?.target_department || 'Pending route analysis'}/></div><div className="raw-text"><p className="eyebrow">Raw submission</p><p>{caseData.prompt_text}</p></div><button className="primary-action" onClick={onAnalyze} disabled={loading}>{loading ? 'Preparing route…' : 'Analyze & Auto-Route Grievance'}</button></> : <EmptyText text="The selected case dossier will appear here."/>}</article><article className="panel analysis-panel"><PanelHeading eyebrow="Bureaucratic routing & drafting" title="Submission review"/>{analysis && caseData ? <AnalysisDesk analysis={analysis} caseData={caseData} activeTab={activeTab} setActiveTab={setActiveTab} onCopy={onCopy} onDownload={onDownload}/> : <EmptyText text="Run the route analysis to prepare the CPGRAMS draft, statutory mapping, and RTI request where eligible."/>}</article></section></>
}

function AnalysisDesk({ analysis, caseData, activeTab, setActiveTab, onCopy, onDownload }) {
  const escalated = caseData.days_pending > 21
  return <><div className="assessment"><Info label="Priority" value={escalated ? 'Critical' : caseData.days_pending > 14 ? 'High' : 'Standard'}/><Info label="Designated desk" value={`${analysis.target_ministry} · ${analysis.target_department}`}/><Info label="Escalation" value={escalated ? 'RTI eligibility triggered' : 'CPGRAMS route ready'}/></div>{escalated && <div className="rti-callout"><b>RTI escalation notice.</b> This grievance has been pending for {caseData.days_pending} days. A record-based request may be prepared under Section 6(1) of the <i>Right to Information Act, 2005</i>.</div>}<div className="tabs" role="tablist"><Tab id="cpgrams" label="CPGRAMS Draft" active={activeTab} setActive={setActiveTab}/><Tab id="rti" label="RTI Application" active={activeTab} setActive={setActiveTab} disabled={!escalated}/><Tab id="legal" label="Legal Mapping" active={activeTab} setActive={setActiveTab}/></div>{activeTab === 'cpgrams' && <section><Draft title="Refined grievance payload" text={analysis.formatted_cpgrams_text}/><div className="draft-actions"><button className="primary-action" onClick={onCopy}>Copy Formatted Payload</button><button className="secondary-action" onClick={() => window.open('https://pgportal.gov.in', '_blank', 'noopener,noreferrer')}>Open CPGRAMS (pgportal.gov.in)</button>{escalated && <button className="secondary-action" onClick={() => setActiveTab('rti')}>Switch to RTI Escalation Desk</button>}</div></section>} {activeTab === 'rti' && <section><p className="small-copy"><b>Public Information Officer:</b> {analysis.nodal_authority}</p><Draft title="Statutory record requests" text={analysis.formatted_rti_text}/><button className="primary-action rti-download" onClick={onDownload}>Download Official RTI Application (PDF)</button></section>} {activeTab === 'legal' && <LegalMapping escalated={escalated}/>}</>
}

function OfficerView({ cases, filter, setFilter, queueActions, onAction }) {
  const queued = cases.filter(item => filter === 'all' || (filter === 'critical' ? item.days_pending > 21 : item.category?.toLowerCase().includes(filter)))
  const critical = cases.filter(item => item.days_pending > 21).length
  return <><section className="intro"><p className="eyebrow">Nodal Officer Desk</p><h1>Department grievance queue.</h1><p>Review demonstrations assigned to the Public Works desk. Route decisions are local prototype actions only and do not send submissions to government systems.</p></section><section className="stats" aria-label="Queue analytics"><Stat label="Total received" value={cases.length}/><Stat label="Auto-routed" value={cases.filter(item => item.category).length}/><Stat label="Critical escalations" value={critical}/><Stat label="RTI warning flags" value={critical}/></section><section className="queue-section"><div className="queue-heading"><div><p className="eyebrow">Department queue</p><h2>Assigned grievances</h2></div><label className="filter-label">Filter <select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All cases</option><option value="critical">Critical / overdue</option><option value="public works">Public works</option><option value="municipal">Municipal services</option></select></label></div><div className="queue-table-wrap"><table><thead><tr><th>Case</th><th>Subject / location</th><th>Pending</th><th>Route status</th><th>Action</th></tr></thead><tbody>{queued.map(item => <tr key={item.case_id}><td><b>{item.case_id}</b><br/><span>{item.category}</span></td><td>{item.district || 'Location pending'}{item.state ? `, ${item.state}` : ''}</td><td className={item.days_pending > 21 ? 'critical-text' : ''}>{item.days_pending || 0} days</td><td>{queueActions[item.case_id] || 'Auto-routed for review'}</td><td><div className="row-actions"><button onClick={() => onAction(item.case_id, 'Route accepted')}>Accept Route</button><button onClick={() => onAction(item.case_id, 'Ministry reassignment requested')}>Re-assign</button><button onClick={() => onAction(item.case_id, 'Priority action marked')}>Mark Priority</button></div></td></tr>)}</tbody></table>{queued.length === 0 && <EmptyText text="No grievances match this filter."/>}</div></section></>
}

function LoginModal({ onClose, onLogin }) { return <Modal onClose={onClose} title="Hackathon Quick Access Credentials" subtitle="Select a pre-loaded profile to evaluate role-based permissions."><Credential title="Citizen Access" email="citizen.demo@jantaportal.gov.in" onClick={() => onLogin('citizen')} action="Login as Citizen"/><Credential title="Nodal Officer Access (Ministry Desk)" email="officer.pwd@jantaportal.gov.in" onClick={() => onLogin('officer')} action="Login as Nodal Officer"/></Modal> }
function GrievanceModal({ form, setForm, loading, onClose, onSubmit }) { const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.name === 'days_pending' ? Number(event.target.value) : event.target.value })); return <Modal onClose={onClose} title="File a demonstration grievance" subtitle="This creates an in-memory synthetic case for the current prototype session."><form className="form-grid" onSubmit={onSubmit}><label>Grievance category<select name="category" value={form.category} onChange={update}>{CIVIC_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label><label>Location / district<input required name="location" value={form.location} onChange={update} placeholder="e.g. Nashik, Maharashtra"/></label><label className="wide">Detailed complaint description<textarea required minLength="10" name="prompt_text" value={form.prompt_text} onChange={update} placeholder="Describe the issue factually, including the public impact." rows="5"/></label><label className="wide">Days pending <span>{form.days_pending}</span><input name="days_pending" type="range" min="1" max="45" value={form.days_pending} onChange={update}/><input name="days_pending" type="number" min="1" max="45" value={form.days_pending} onChange={update}/></label><div className="modal-actions wide"><button type="button" className="secondary-action" onClick={onClose}>Cancel</button><button className="primary-action" disabled={loading}>{loading ? 'Creating case…' : 'Create & Analyze Grievance'}</button></div></form></Modal> }
function Modal({ title, subtitle, children, onClose }) { return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={event => event.stopPropagation()}><button className="close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">JantaPortal AI</p><h2 id="modal-title">{title}</h2><p className="modal-subtitle">{subtitle}</p>{children}</section></div> }
function Credential({ title, email, action, onClick }) { return <div className="credential"><h3>{title}</h3><p>{email}</p><p>Password: ••••••••</p><button className="primary-action" onClick={onClick}>{action}</button></div> }
function PanelHeading({ eyebrow, title }) { return <header className="panel-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></header> }
function Info({ label, value }) { return <div className="info"><span>{label}</span><b>{value}</b></div> }
function Tab({ id, label, active, setActive, disabled }) { return <button role="tab" aria-selected={active === id} className={active === id ? 'active' : ''} disabled={disabled} onClick={() => setActive(id)}>{label}</button> }
function Workflow({ caseData, analysis, loading }) { const active = !caseData ? 1 : loading ? 2 : caseData.days_pending > 21 ? 4 : analysis ? 3 : 1; const steps = ['Citizen Input Received', 'AI Ministry Mapping', 'CPGRAMS Formalized', 'RTI Escalation (>21 Days)']; return <ol className="workflow" aria-label="Grievance workflow">{steps.map((step, index) => <li key={step} className={index + 1 === active ? 'active' : index + 1 < active ? 'complete' : ''}><span>{index + 1}</span><p>{step}</p></li>)}</ol> }
function Draft({ title, text, action, onAction }) { return <section className="draft"><div><p className="eyebrow">{title}</p>{action && <button className="text-action" onClick={onAction}>{action}</button>}</div><pre>{text}</pre></section> }
function LegalMapping({ escalated }) { return <section className="legal-list"><Legal title="CPGRAMS public grievance process" text="The draft is structured as a factual request for acknowledgement, competent routing, action taken, and an expected resolution date."/><Legal title="Right to Information Act, 2005 · Section 6(1)" text={escalated ? 'The pending-period threshold supports preparing a request for existing records, certified copies, and file movement details.' : 'An RTI request becomes relevant where a record-based escalation is necessary; it should seek existing records rather than explanations.'}/><Legal title="Public Services Guarantee framework" text="Applicable state rules may provide service-delivery timelines. Confirm the relevant state department process before submitting."/></section> }
function Legal({ title, text }) { return <article><h3>{title}</h3><p>{text}</p></article> }
function Stat({ label, value }) { return <div><span>{label}</span><b>{value}</b></div> }
function EmptyText({ text }) { return <p className="empty-text">{text}</p> }
function Message({ type, children }) { return <div className={`message ${type}`}>{children}</div> }
function displayCategory(category = '') { return ({ 'Public Works': 'Public Works & Municipal Roads', 'Higher Education Scholarship': 'Higher Education & Scholarships', 'Municipal Road Repair Escalation': 'Public Works & Municipal Roads' })[category] || category }
function admissibility(caseData) { const text = `${caseData?.category || ''} ${caseData?.prompt_text || ''}`.toLowerCase(); const matched = [['rti matter', 'RTI matters are handled by the separate RTI Generator.'], ['right to information', 'RTI matters are handled by the separate RTI Generator.'], ['subjudice', 'Subjudice or court-related matters require direct legal routing.'], ['court', 'Subjudice or court-related matters require direct legal routing.'], ['religious', 'Religious disputes are outside CPGRAMS admissibility.'], ['service matter', 'Internal Government employee service matters require direct departmental routing.']].find(([term]) => text.includes(term)); return matched ? { admissible: false, label: 'Warning: Non-Admissible Scope', reason: matched[1] } : { admissible: true, label: 'Status: Admissible for CPGRAMS' } }
