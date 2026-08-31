import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ImagePlus, LogOut, Map, QrCode, Save, ShieldCheck, Ticket, Users, X } from 'lucide-react'
import { api } from './api'

const defaultSettings = { siteName: 'County Showgrounds', logoUrl: '/county-showgrounds-logo.png', supportPhone: '' }

function extractPermitRef(rawValue = '') {
  const value = String(rawValue).trim()
  const schemeMatch = value.match(/^county-plot-hub:\/\/permit\/(.+)$/i)
  if (schemeMatch) return decodeURIComponent(schemeMatch[1]).trim()
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length) return decodeURIComponent(parts[parts.length - 1]).trim()
  } catch {
    // Manual permit references are accepted as-is below.
  }
  return /^[A-Z0-9][A-Z0-9-]{4,79}$/i.test(value) ? value : ''
}

function AdminQrScanner({ enabled, onCode }) {
  const videoRef = useRef(null)
  const lastCode = useRef('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!enabled) return undefined
    let stream
    let animationFrame
    let active = true
    const start = async () => {
      if (!('BarcodeDetector' in window)) {
        setMessage('Camera scanning is unavailable. Enter the permit reference below.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!active || !videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const scan = async () => {
          if (!active || !videoRef.current || videoRef.current.readyState < 2) {
            if (active) animationFrame = window.requestAnimationFrame(scan)
            return
          }
          try {
            const raw = (await detector.detect(videoRef.current))[0]?.rawValue
            const permitRef = extractPermitRef(raw)
            if (permitRef && permitRef !== lastCode.current) {
              lastCode.current = permitRef
              onCode(permitRef)
            }
          } catch {
            // Individual video frames can fail to decode; keep scanning.
          }
          if (active) animationFrame = window.requestAnimationFrame(scan)
        }
        scan()
      } catch {
        setMessage('Camera access was unavailable. Enter the permit reference below.')
      }
    }
    start()
    return () => {
      active = false
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [enabled, onCode])

  if (!enabled) return null
  return <div className="admin-qr-scanner"><video ref={videoRef} muted playsInline aria-label="Visitor permit QR scanner" /><div className="admin-qr-frame" />{message ? <span>{message}</span> : <span>Point the camera at a visitor permit QR code</span>}</div>
}

function AdminPortal() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const resetToken = urlParams.get('token') || ''
  const [screen, setScreen] = useState(() => resetToken ? 'reset' : (localStorage.getItem('county-admin-token') ? 'dashboard' : 'login'))
  const [token, setToken] = useState(() => localStorage.getItem('county-admin-token') || '')
  const [admin, setAdmin] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [form, setForm] = useState({ email: '', password: '' })
  const [resetForm, setResetForm] = useState({ token: resetToken, password: '', confirm: '' })
  const [forgotEmail, setForgotEmail] = useState('')
  const [dashboard, setDashboard] = useState({ showgrounds: 0, bookings: 0, pendingBookings: 0, visitors: 0, pendingVisitors: 0 })
  const [showgrounds, setShowgrounds] = useState([])
  const [selectedGroundId, setSelectedGroundId] = useState('')
  const [groundDraft, setGroundDraft] = useState(null)
  const [bookings, setBookings] = useState([])
  const [visitors, setVisitors] = useState([])
  const [visitorForm, setVisitorForm] = useState({ fullName: '', phone: '', permitRef: '', visitDate: new Date().toISOString().slice(0, 10), note: '' })
  const [scanForm, setScanForm] = useState({ permitRef: '', visitorId: '', action: 'check_in' })
  const [settings, setSettings] = useState(defaultSettings)
  const [notice, setNotice] = useState(null)
  const [resetLink, setResetLink] = useState('')
  const [busy, setBusy] = useState(false)

  const flash = useCallback((message, tone = 'info') => {
    setNotice({ message, tone })
    window.setTimeout(() => setNotice(null), 4500)
  }, [])

  const adminRequest = useCallback((path, options = {}) => api(path, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  }), [token])

  const loadAll = useCallback(async () => {
    if (!token) return
    try {
      const [me, metrics, grounds, bookingResult, visitorResult, settingResult] = await Promise.all([
        adminRequest('/api/admin/auth/me'),
        adminRequest('/api/admin/dashboard'),
        adminRequest('/api/admin/showgrounds'),
        adminRequest('/api/admin/bookings'),
        adminRequest('/api/admin/visitors'),
        adminRequest('/api/admin/settings')
      ])
      setAdmin(me.admin)
      setDashboard(metrics.metrics)
      setShowgrounds(grounds.showgrounds)
      setBookings(bookingResult.bookings)
      setVisitors(visitorResult.visitors)
      setSettings({ ...defaultSettings, ...(settingResult.settings || {}) })
    } catch (error) {
      localStorage.removeItem('county-admin-token')
      setToken('')
      setScreen('login')
      flash(error.message || 'Your admin session has expired.', 'error')
    }
  }, [adminRequest, flash, token])

  useEffect(() => {
    if (screen === 'dashboard') loadAll()
  }, [loadAll, screen])

  useEffect(() => {
    if (!selectedGroundId && showgrounds.length) setSelectedGroundId(showgrounds[0].id)
    if (selectedGroundId) {
      const ground = showgrounds.find((item) => item.id === selectedGroundId)
      if (ground && !groundDraft) setGroundDraft(JSON.parse(JSON.stringify(ground)))
    }
  }, [groundDraft, selectedGroundId, showgrounds])

  const login = async (event) => {
    event.preventDefault()
    try {
      setBusy(true)
      const result = await api('/api/admin/auth/login', { method: 'POST', body: JSON.stringify(form) })
      localStorage.setItem('county-admin-token', result.token)
      setToken(result.token)
      setAdmin(result.admin)
      setScreen('dashboard')
      flash('Welcome to the administration centre.')
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const requestReset = async (event) => {
    event.preventDefault()
    try {
      setBusy(true)
      const result = await api('/api/admin/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: forgotEmail }) })
      if (result.resetUrl) setResetLink(result.resetUrl)
      flash(result.message)
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const resetPassword = async (event) => {
    event.preventDefault()
    if (resetForm.password.length < 8 || resetForm.password !== resetForm.confirm) return flash('Passwords must match and be at least 8 characters.', 'warning')
    try {
      setBusy(true)
      const result = await api('/api/admin/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: resetForm.token, password: resetForm.password }) })
      flash(result.message)
      setScreen('login')
      setResetForm({ token: '', password: '', confirm: '' })
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const selectGround = (id) => {
    const ground = showgrounds.find((item) => item.id === id)
    setSelectedGroundId(id)
    setGroundDraft(ground ? JSON.parse(JSON.stringify(ground)) : null)
  }

  const saveGround = async () => {
    if (!groundDraft) return
    try {
      setBusy(true)
      const result = await adminRequest(`/api/admin/showgrounds/${groundDraft.id}`, { method: 'PUT', body: JSON.stringify(groundDraft) })
      setShowgrounds((current) => current.map((item) => item.id === result.showground.id ? result.showground : item))
      setGroundDraft(JSON.parse(JSON.stringify(result.showground)))
      flash('Showground and plot inventory saved.')
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const setBookingApproval = async (id, approvalStatus) => {
    try {
      setBusy(true)
      await adminRequest(`/api/admin/bookings/${id}/approval`, { method: 'PATCH', body: JSON.stringify({ approvalStatus }) })
      setBookings((current) => current.map((booking) => booking.id === id ? { ...booking, approvalStatus } : booking))
      flash(`Booking marked ${approvalStatus}.`)
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const createVisitor = async (event) => {
    event.preventDefault()
    try {
      setBusy(true)
      const result = await adminRequest('/api/admin/visitors', { method: 'POST', body: JSON.stringify(visitorForm) })
      setVisitors((current) => [result.visitor, ...current])
      setVisitorForm({ fullName: '', phone: '', permitRef: '', visitDate: new Date().toISOString().slice(0, 10), note: '' })
      flash('Visitor added to the approval queue.')
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const setVisitorApproval = async (id, status) => {
    try {
      setBusy(true)
      const result = await adminRequest(`/api/admin/visitors/${id}/approval`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setVisitors((current) => current.map((visitor) => visitor.id === id ? result.visitor : visitor))
      flash(`Visitor ${status}.`)
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const scanVisitor = async (event) => {
    event.preventDefault()
    try {
      setBusy(true)
      const result = await adminRequest('/api/admin/visitors/scan', { method: 'POST', body: JSON.stringify(scanForm) })
      setVisitors((current) => [result.visitor, ...current.filter((visitor) => visitor.id !== result.visitor.id)])
      setScanForm({ permitRef: '', visitorId: '', action: scanForm.action })
      flash(result.message)
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleCameraCode = useCallback((permitRef) => {
    setScanForm((current) => ({ ...current, permitRef, visitorId: '' }))
    flash(`Permit ${permitRef} captured. Press Record scan.`)
  }, [flash])

  const saveSettings = async () => {
    try {
      setBusy(true)
      const result = await adminRequest('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settings) })
      setSettings({ ...defaultSettings, ...result.settings })
      flash('Brand settings saved. The public site now uses this logo.')
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const readLogo = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) return flash('Choose a logo under 500 KB.', 'warning')
    const reader = new FileReader()
    reader.onload = () => setSettings((current) => ({ ...current, logoUrl: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  const logout = () => {
    localStorage.removeItem('county-admin-token')
    setToken('')
    setAdmin(null)
    setScreen('login')
  }

  if (screen === 'login' || screen === 'forgot' || screen === 'reset') {
    return (
      <div className="admin-auth-shell">
        <div className="admin-auth-card">
          <div className="admin-mark"><ShieldCheck size={22} /></div>
          <span className="eyebrow">County Showgrounds</span>
          {screen === 'login' && <><h1>Administration centre</h1><p className="muted">Secure access for leasing, approvals, branding, and gate operations.</p><form onSubmit={login} className="admin-auth-form"><label className="field">Admin email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="username" required /></label><label className="field">Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="current-password" required /></label><button className="btn block" disabled={busy}>Sign in</button></form><button className="admin-link" onClick={() => setScreen('forgot')}>Forgot password?</button></>}
          {screen === 'forgot' && <><h1>Reset admin password</h1><p className="muted">We will send a secure reset link using the configured free Brevo email service.</p><form onSubmit={requestReset} className="admin-auth-form"><label className="field">Admin email<input type="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} required /></label><button className="btn block" disabled={busy}>Send reset link</button></form>{resetLink && <p className="reset-demo-link">Demo reset link: <a href={resetLink}>{resetLink}</a></p>}<button className="admin-link" onClick={() => setScreen('login')}>Back to sign in</button></>}
          {screen === 'reset' && <><h1>Choose a new password</h1><p className="muted">Use at least 8 characters. The reset link expires after 30 minutes.</p><form onSubmit={resetPassword} className="admin-auth-form"><label className="field">Reset token<input value={resetForm.token} onChange={(event) => setResetForm({ ...resetForm, token: event.target.value })} required /></label><label className="field">New password<input type="password" value={resetForm.password} onChange={(event) => setResetForm({ ...resetForm, password: event.target.value })} autoComplete="new-password" required /></label><label className="field">Confirm password<input type="password" value={resetForm.confirm} onChange={(event) => setResetForm({ ...resetForm, confirm: event.target.value })} autoComplete="new-password" required /></label><button className="btn block" disabled={busy}>Update password</button></form><button className="admin-link" onClick={() => setScreen('login')}>Back to sign in</button></>}
          {notice && <div className={`toast ${notice.tone}`}>{notice.message}</div>}
        </div>
      </div>
    )
  }

  const nav = [
    ['overview', 'Overview', ShieldCheck],
    ['leasing', 'Land leasing', Map],
    ['bookings', 'Booking approvals', Ticket],
    ['visitors', 'Visitors & gate', Users],
    ['brand', 'Logo & brand', ImagePlus]
  ]

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><div className="admin-mark small"><ShieldCheck size={18} /></div><div><strong>County Showgrounds</strong><span>Admin workspace</span></div></div>
        <nav>{nav.map(([id, label, Icon]) => <button className={activeTab === id ? 'active' : ''} key={id} onClick={() => setActiveTab(id)}><Icon size={16} />{label}</button>)}</nav>
        <button className="admin-logout" onClick={logout}><LogOut size={15} /> Sign out</button>
      </aside>
      <main className="admin-main">
        <header className="admin-header"><div><span className="eyebrow">Operations dashboard</span><h1>{nav.find(([id]) => id === activeTab)?.[1]}</h1></div><div className="admin-user"><span>{admin?.name || 'Administrator'}</span><small>{admin?.email}</small></div></header>
        {notice && <div className={`admin-notice ${notice.tone}`}>{notice.message}</div>}

        {activeTab === 'overview' && <section className="admin-content"><div className="metric-grid">{[['Showgrounds', dashboard.showgrounds, Map], ['Total bookings', dashboard.bookings, Ticket], ['Pending bookings', dashboard.pendingBookings, ShieldCheck], ['Visitors', dashboard.visitors, Users], ['Pending visitors', dashboard.pendingVisitors, QrCode]].map(([label, value, Icon]) => <div className="metric-card" key={label}><Icon size={17} /><span>{label}</span><strong>{value}</strong></div>)}</div><div className="admin-panel admin-quick"><div><span className="eyebrow">Recommended workflow</span><h2>Keep every lease and entry decision in one place.</h2><p className="muted">Update plot inventory, approve bookings, then approve visitors and scan their permit at the gate.</p></div><button className="btn" onClick={() => setActiveTab('leasing')}>Open leasing <Map size={15} /></button></div></section>}

        {activeTab === 'leasing' && <section className="admin-content admin-two-column"><div className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">Inventory</span><h2>Showgrounds</h2></div><span className="catalog-count">{showgrounds.length} locations</span></div><div className="admin-ground-list">{showgrounds.map((ground) => <button className={selectedGroundId === ground.id ? 'admin-ground active' : 'admin-ground'} key={ground.id} onClick={() => selectGround(ground.id)}><span>{ground.county}</span><strong>{ground.name}</strong><small>{ground.plots.length} plots · {ground.plots.filter((plot) => plot.status === 'available').length} available</small></button>)}</div></div>{groundDraft && <div className="admin-panel ground-editor"><div className="panel-heading"><div><span className="eyebrow">Edit inventory</span><h2>{groundDraft.name}</h2></div><button className="btn" onClick={saveGround} disabled={busy}><Save size={15} /> Save changes</button></div><div className="admin-inline-fields"><label className="field">Showground name<input value={groundDraft.name} onChange={(event) => setGroundDraft({ ...groundDraft, name: event.target.value })} /></label><label className="field">County<input value={groundDraft.county} onChange={(event) => setGroundDraft({ ...groundDraft, county: event.target.value })} /></label></div><div className="admin-inline-fields"><label className="field">Leasing opens (month)<input type="number" min="1" max="12" value={groundDraft.season?.startMonth || ''} onChange={(event) => setGroundDraft({ ...groundDraft, season: { ...groundDraft.season, startMonth: Number(event.target.value) } })} /></label><label className="field">Leasing closes (month)<input type="number" min="1" max="12" value={groundDraft.season?.endMonth || ''} onChange={(event) => setGroundDraft({ ...groundDraft, season: { ...groundDraft.season, endMonth: Number(event.target.value) } })} /></label></div><div className="plot-editor"><div className="table-heading"><span>Plot</span><span>Category</span><span>Size</span><span>Price (KES)</span><span>Status</span></div>{groundDraft.plots.map((plot, index) => <div className="plot-edit-row" key={plot.id}><strong>{plot.id}</strong><input value={plot.category} onChange={(event) => { const plots = [...groundDraft.plots]; plots[index] = { ...plot, category: event.target.value }; setGroundDraft({ ...groundDraft, plots }) }} /><input value={plot.size} onChange={(event) => { const plots = [...groundDraft.plots]; plots[index] = { ...plot, size: event.target.value }; setGroundDraft({ ...groundDraft, plots }) }} /><input type="number" value={plot.price} onChange={(event) => { const plots = [...groundDraft.plots]; plots[index] = { ...plot, price: Number(event.target.value) }; setGroundDraft({ ...groundDraft, plots }) }} /><select value={plot.status} onChange={(event) => { const plots = [...groundDraft.plots]; plots[index] = { ...plot, status: event.target.value }; setGroundDraft({ ...groundDraft, plots }) }}><option value="available">Available</option><option value="reserved">Reserved</option><option value="taken">Taken</option></select></div>)}</div></div>}</section>}

        {activeTab === 'bookings' && <section className="admin-content"><div className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">Leasing decisions</span><h2>Booking approvals</h2></div><span className="catalog-count">{bookings.length} records</span></div><div className="admin-table">{bookings.map((booking) => <div className="admin-list-row" key={booking.id}><div><strong>{booking.exhibitorName}</strong><span>{booking.showgroundId} · Plot {booking.plotId} · {booking.phone}</span></div><div className="row-status"><span className={`admin-status ${booking.approvalStatus || 'approved'}`}>{booking.approvalStatus || 'approved'}</span>{booking.status === 'confirmed' && <span className="admin-status confirmed">paid</span>}</div><div className="row-actions"><button onClick={() => setBookingApproval(booking.id, 'approved')} disabled={busy || booking.approvalStatus === 'approved'}><Check size={14} /> Approve</button><button className="reject" onClick={() => setBookingApproval(booking.id, 'rejected')} disabled={busy || booking.approvalStatus === 'rejected'}><X size={14} /> Reject</button></div></div>)}{!bookings.length && <div className="empty-card">No bookings have been created yet.</div>}</div></div></section>}

        {activeTab === 'visitors' && <section className="admin-content admin-two-column"><div className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">Gate operations</span><h2>Scan a visitor</h2></div><QrCode size={22} /></div><AdminQrScanner enabled={activeTab === 'visitors'} onCode={handleCameraCode} /><form className="admin-auth-form" onSubmit={scanVisitor}><label className="field">Permit reference<input value={scanForm.permitRef} onChange={(event) => setScanForm({ ...scanForm, permitRef: event.target.value })} placeholder="CPH-2026-..." /></label><label className="field">Or select approved visitor<select value={scanForm.visitorId} onChange={(event) => setScanForm({ ...scanForm, visitorId: event.target.value })}><option value="">Choose visitor</option>{visitors.filter((visitor) => ['approved', 'checked_in'].includes(visitor.status)).map((visitor) => <option value={visitor.id} key={visitor.id}>{visitor.fullName} · {visitor.permitRef || 'No permit'}</option>)}</select></label><label className="field">Action<select value={scanForm.action} onChange={(event) => setScanForm({ ...scanForm, action: event.target.value })}><option value="check_in">Check in</option><option value="check_out">Check out</option></select></label><button className="btn block" disabled={busy}>Record scan <QrCode size={15} /></button></form></div><div className="admin-panel"><div className="panel-heading"><div><span className="eyebrow">Visitor register</span><h2>Approve visitors</h2></div><span className="catalog-count">{visitors.length} records</span></div><form className="visitor-form" onSubmit={createVisitor}><input placeholder="Full name" value={visitorForm.fullName} onChange={(event) => setVisitorForm({ ...visitorForm, fullName: event.target.value })} required /><input placeholder="Permit reference" value={visitorForm.permitRef} onChange={(event) => setVisitorForm({ ...visitorForm, permitRef: event.target.value })} /><input type="date" value={visitorForm.visitDate} onChange={(event) => setVisitorForm({ ...visitorForm, visitDate: event.target.value })} required /><button className="btn" disabled={busy}>Add visitor</button></form><div className="admin-table visitor-table">{visitors.map((visitor) => <div className="admin-list-row" key={visitor.id}><div><strong>{visitor.fullName}</strong><span>{visitor.permitRef || 'No permit'} · {visitor.visitDate}</span></div><span className={`admin-status ${visitor.status}`}>{visitor.status.replace('_', ' ')}</span><div className="row-actions"><button onClick={() => setVisitorApproval(visitor.id, 'approved')} disabled={busy || visitor.status === 'approved'}><Check size={14} /> Approve</button><button className="reject" onClick={() => setVisitorApproval(visitor.id, 'rejected')} disabled={busy || visitor.status === 'rejected'}><X size={14} /> Reject</button></div></div>)}</div></div></section>}

        {activeTab === 'brand' && <section className="admin-content"><div className="admin-panel brand-editor"><div className="panel-heading"><div><span className="eyebrow">Public identity</span><h2>Logo and brand settings</h2></div><button className="btn" onClick={saveSettings} disabled={busy}><Save size={15} /> Save settings</button></div><div className="brand-preview"><div className="brand-preview-logo">{settings.logoUrl ? <img src={settings.logoUrl} alt="Current brand logo" /> : <ShieldCheck size={32} />}</div><div><strong>{settings.siteName}</strong><p className="muted">This logo appears on the public website and generated lease permits.</p></div></div><label className="field">Site name<input value={settings.siteName} onChange={(event) => setSettings({ ...settings, siteName: event.target.value })} /></label><label className="field">Logo image URL<input value={settings.logoUrl} onChange={(event) => setSettings({ ...settings, logoUrl: event.target.value })} placeholder="https://... or upload a file below" /></label><label className="file-picker"><ImagePlus size={16} /> Upload logo file<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={readLogo} /></label><label className="field">Support phone<input value={settings.supportPhone} onChange={(event) => setSettings({ ...settings, supportPhone: event.target.value })} placeholder="Optional public support number" /></label></div></section>}
      </main>
    </div>
  )
}

export default AdminPortal