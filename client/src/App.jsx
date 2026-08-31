import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Popup, Rectangle, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { ArrowLeft, ArrowRight, Check, CircleHelp, Clock3, Download, Leaf, MapPin, MessageSquare, RefreshCw, ScanLine, Send, Smartphone, Store, Ticket, Video, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { api } from './api'

const steps = ['Showground', 'Browse', 'Map', 'Inquire', 'Book', 'Pay', 'Permit']
const viewStep = { showground: 0, browse: 1, map: 2, book: 4, pay: 5, permit: 6, scanner: 6 }

function formatMoney(value) {
  return `KES ${Number(value || 0).toLocaleString()}`
}

function normalizePhone(value = '') {
  const raw = value.replace(/\s+/g, '')
  return raw.startsWith('+254') ? `0${raw.slice(4)}` : raw
}

function isValidPhone(value) {
  return /^(?:\+254|0)(?:7|1)\d{8}$/.test(value.replace(/\s+/g, ''))
}

function extractPermitRef(rawValue = '') {
  const value = String(rawValue).trim()
  const schemeMatch = value.match(/^county-plot-hub:\/\/permit\/(.+)$/i)
  if (schemeMatch) return decodeURIComponent(schemeMatch[1]).trim()
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length) return decodeURIComponent(parts[parts.length - 1]).trim()
  } catch {
    // A plain permit reference is also accepted below.
  }
  return /^[A-Z0-9][A-Z0-9-]{4,79}$/i.test(value) ? value : ''
}

async function loadImageDataUrl(path) {
  const response = await fetch(path)
  if (!response.ok) throw new Error('Permit logo could not be loaded')
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function formatCountdown(ms) {
  if (ms === null || ms === undefined) return ''
  if (ms <= 0) return 'now'
  const total = Math.floor(ms / 1000)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days) return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`
}

function seasonState(season) {
  if (!season?.startMonth || !season?.endMonth) return { active: true, label: 'Booking open', countdown: '' }
  const now = new Date()
  const range = (year) => {
    const start = new Date(year, season.startMonth - 1, 1)
    const endYear = season.endMonth < season.startMonth ? year + 1 : year
    const end = new Date(endYear, season.endMonth, 0, 23, 59, 59, 999)
    return { start, end }
  }
  const ranges = [range(now.getFullYear() - 1), range(now.getFullYear()), range(now.getFullYear() + 1)]
  const current = ranges.find((item) => now >= item.start && now <= item.end)
  const target = current ? current.end : (ranges.find((item) => item.start > now) || range(now.getFullYear() + 2)).start
  return { active: Boolean(current), label: current ? 'Booking open' : 'Booking closed', countdown: formatCountdown(target - now), target }
}

function normalizeCatalog(items = []) {
  return items.map((showground) => ({
    ...showground,
    plots: (showground.plots || []).map((plot) => ({
      ...plot,
      exhibitors_capacity: plot.exhibitorsCapacity ?? plot.exhibitors_capacity
    }))
  }))
}

function FitMap({ points, maxZoom = 6 }) {
  const map = useMap()
  // Leaflet should fit the map when the dataset changes, not when a user
  // selects a different marker or plot. The array is recreated during
  // renders, so use a value-based key instead of the array reference.
  const pointsKey = useMemo(() => points.map(([lat, lng]) => `${lat}:${lng}`).join('|'), [points])
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [25, 25], maxZoom })
  }, [map, pointsKey, maxZoom])
  return null
}

function CountyMarker({ selected, position, onClick }) {
  const icon = useMemo(() => L.divIcon({
    className: 'county-marker-wrap',
    html: `<span class="county-marker ${selected ? 'selected' : ''}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  }), [selected])
  return <Marker position={position} icon={icon} eventHandlers={{ click: onClick }} />
}

function CountyMap({ showgrounds, selected, onSelect }) {
  const points = showgrounds.map((item) => [item.lat, item.lng])
  return (
    <MapContainer className="county-map" center={[0.0236, 37.9062]} zoom={6} scrollWheelZoom={false}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {showgrounds.map((item) => (
        <CountyMarker key={item.id} selected={selected?.id === item.id} position={[item.lat, item.lng]} onClick={() => onSelect(item)} />
      ))}
      <FitMap points={points} />
    </MapContainer>
  )
}

function metersToLatLng(lat, lng, north, east) {
  const radius = 6378137
  return [
    lat + (north / radius) * (180 / Math.PI),
    lng + (east / (radius * Math.cos(lat * Math.PI / 180))) * (180 / Math.PI)
  ]
}

function PlotMap({ showground, selectedPlot, onSelect }) {
  const allPoints = [[showground.lat, showground.lng]]
  const road = [
    metersToLatLng(showground.lat, showground.lng, -20, -45),
    metersToLatLng(showground.lat, showground.lng, -20, 25)
  ]
  allPoints.push(...road)
  return (
    <MapContainer className="site-map" center={[showground.lat, showground.lng]} zoom={17} scrollWheelZoom={false}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={20} />
      <Rectangle bounds={[road[0], road[1]]} pathOptions={{ color: '#d8d2c0', weight: 9, opacity: 0.95, fill: false }} />
      {showground.plots.map((plot, index) => {
        const [width, height] = String(plot.size || '3x3m').replace('m', '').split('x').map(Number)
        const sw = metersToLatLng(showground.lat, showground.lng, plot.offsetN ?? [6, 6, -12, -12][index % 4], plot.offsetE ?? [-34, -27, -34, 0][index % 4])
        const ne = metersToLatLng(showground.lat, showground.lng, (plot.offsetN ?? [6, 6, -12, -12][index % 4]) + height, (plot.offsetE ?? [-34, -27, -34, 0][index % 4]) + width)
        allPoints.push(sw, ne)
        return (
          <Rectangle
            key={plot.id}
            bounds={[sw, ne]}
            pathOptions={{
              className: `plot-rect ${plot.status} ${plot.id === selectedPlot?.id ? 'selected' : ''}`,
              color: plot.status === 'available' ? '#4c7a5d' : plot.status === 'reserved' ? '#b98a3e' : '#8b8b82',
              fillColor: plot.status === 'available' ? '#e4eee3' : plot.status === 'reserved' ? '#f3e7d2' : '#eaeae6',
              weight: plot.id === selectedPlot?.id ? 3 : 1,
              fillOpacity: 0.72
            }}
            eventHandlers={{ click: () => onSelect(plot) }}
          >
            <Popup><strong>Plot {plot.id}</strong><br />{formatMoney(plot.price)} · {plot.status}</Popup>
          </Rectangle>
        )
      })}
      <FitMap points={allPoints} maxZoom={18} />
    </MapContainer>
  )
}

function Stepper({ current }) {
  return (
    <div className="stepper" aria-label="Booking progress">
      {steps.map((label, index) => (
        <div className={`step-pill ${index === current ? 'active' : index < current ? 'done' : ''}`} key={label}>
          {index < current && <Check size={13} />}
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}

function StatusPill({ status }) {
  const label = status === 'available' ? 'Available' : status === 'reserved' ? 'Reserved' : status === 'taken' ? 'Taken' : status
  return <span className={`status-pill ${status}`}><i />{label}</span>
}

function TrafficBars({ traffic }) {
  const count = traffic === 'high' ? 3 : traffic === 'medium' ? 2 : 1
  return <span className="traffic-label"><span className="traffic-bars">{[1, 2, 3].map((item) => <i className={item <= count ? 'on' : ''} key={item} />)}</span>{traffic}</span>
}

function PermitScanner({ permit, onScan, onClose, busy }) {
  const videoRef = useRef(null)
  const lastValue = useRef('')
  const [manualRef, setManualRef] = useState('')
  const [cameraMessage, setCameraMessage] = useState('')

  useEffect(() => {
    let stream
    let animationFrame
    let active = true
    const startCamera = async () => {
      if (!('BarcodeDetector' in window)) {
        setCameraMessage('Camera scanning is not supported in this browser. Enter the permit number below.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (!active || !videoRef.current) return
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const scanFrame = async () => {
          if (!active || !videoRef.current || videoRef.current.readyState < 2) {
            if (active) animationFrame = window.requestAnimationFrame(scanFrame)
            return
          }
          try {
            const codes = await detector.detect(videoRef.current)
            const rawValue = codes[0]?.rawValue
            if (rawValue && rawValue !== lastValue.current) {
              lastValue.current = rawValue
              onScan(rawValue)
            }
          } catch {
            // Keep the camera running; transient frames can fail to decode.
          }
          if (active) animationFrame = window.requestAnimationFrame(scanFrame)
        }
        scanFrame()
      } catch {
        setCameraMessage('Camera access was unavailable. Allow camera permission or enter the permit number below.')
      }
    }
    startCamera()
    return () => {
      active = false
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [onScan])

  const submitManual = (event) => {
    event.preventDefault()
    onScan(manualRef)
  }

  return (
    <section className="scanner-screen">
      <div className="section-heading">
        <div><span className="eyebrow">Permit verification</span><h2>Scan an exhibitor permit</h2></div>
        <button className="back-button" onClick={onClose}><X size={15} /> Close scanner</button>
      </div>
      <div className="scanner-layout">
        <div className="scanner-card">
          <div className="scanner-view">
            <video ref={videoRef} muted playsInline aria-label="QR code camera scanner" />
            <div className="scanner-frame"><i /><i /><i /><i /></div>
            {!cameraMessage && <span className="scanner-hint"><Video size={15} /> Point the camera at the permit QR code</span>}
          </div>
          {cameraMessage && <p className="scanner-message">{cameraMessage}</p>}
          <form className="manual-scan" onSubmit={submitManual}>
            <label className="field">Or enter permit number
              <input value={manualRef} onChange={(event) => setManualRef(event.target.value)} placeholder="e.g. NAI-B-05-1864" autoCapitalize="characters" />
            </label>
            <button className="btn" type="submit" disabled={busy || !manualRef.trim()}><ScanLine size={16} /> Verify permit</button>
          </form>
        </div>
        {permit && (
          <div className="permit-result">
            <div className="verified-heading"><Check size={17} /> Verified permit</div>
            <h3>{permit.exhibitorName}</h3>
            <p className="muted">{permit.permitRef} · {permit.status}</p>
            <div className="detail-row"><span>Showground</span><strong>{permit.showgroundName}</strong></div>
            <div className="detail-row"><span>County</span><strong>{permit.county}</strong></div>
            <div className="detail-row"><span>Plot</span><strong>{permit.plotId}</strong></div>
            <div className="detail-row"><span>Category</span><strong>{permit.category || '—'}</strong></div>
            <div className="detail-row"><span>Stand size</span><strong>{permit.size || '—'}</strong></div>
            <div className="detail-row"><span>Exhibitors</span><strong>{permit.exhibitorCount}</strong></div>
            <div className="detail-row"><span>Setup date</span><strong>{permit.setupDate || 'Not set'}</strong></div>
            <div className="detail-row"><span>Amount paid</span><strong>{formatMoney(permit.amount)}</strong></div>
          </div>
        )}
      </div>
    </section>
  )
}

const SCANNER_PATH = '/scanner'

export default function App() {
  const [now, setNow] = useState(() => new Date())
  const [showgrounds, setShowgrounds] = useState([])
  const [selectedShowground, setSelectedShowground] = useState(null)
  const [selectedPlot, setSelectedPlot] = useState(null)
  const [view, setView] = useState(() => (window.location.pathname === SCANNER_PATH ? 'scanner' : 'showground'))
  const continueRef = useRef(null)
  const [filter, setFilter] = useState({ size: '', status: 'available', traffic: '' })
  const [form, setForm] = useState({ exhibitorName: '', phone: '', exhibitorCount: 1, powerNeed: 'none', signageText: '', setupDate: '', competitionOptIn: false })
  const [bookPage, setBookPage] = useState(1)
  const [otp, setOtp] = useState({ requested: false, verified: false, code: '', token: '', demoCode: '' })
  const [booking, setBooking] = useState(null)
  const [payment, setPayment] = useState(null)
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState('')
  const [showQuestion, setShowQuestion] = useState(false)
  const [permitQr, setPermitQr] = useState('')
  const [verifiedPermit, setVerifiedPermit] = useState(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // Keep the URL in sync with the scanner view so it has its own linkable/bookmarkable address.
  useEffect(() => {
    const onScannerRoute = window.location.pathname === SCANNER_PATH
    if (view === 'scanner' && !onScannerRoute) {
      window.history.pushState({}, '', SCANNER_PATH)
    } else if (view !== 'scanner' && onScannerRoute) {
      window.history.replaceState({}, '', '/')
    }
  }, [view])

  // Support the browser back/forward buttons for the scanner route.
  useEffect(() => {
    const onPopState = () => {
      setView(window.location.pathname === SCANNER_PATH ? 'scanner' : 'showground')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // When a showground is picked (from the map or the option cards), bring the Continue button into view.
  useEffect(() => {
    if (view !== 'showground' || !selectedShowground) return
    const frame = window.requestAnimationFrame(() => {
      continueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedShowground, view])

  const flash = useCallback((message, tone = 'info') => {
    setNotice({ message, tone })
    window.setTimeout(() => setNotice(null), 4500)
  }, [])

  const loadCatalog = useCallback(async () => {
    const result = await api('/api/showgrounds')
    setShowgrounds(normalizeCatalog(result.showgrounds))
  }, [])

  useEffect(() => {
    loadCatalog().catch((error) => flash(error.message || 'The live catalog could not be loaded.', 'error')).finally(() => setLoading(false))
  }, [flash, loadCatalog])

  useEffect(() => {
    if (!booking?.permitRef) return
    QRCode.toDataURL(`county-plot-hub://permit/${booking.permitRef}`, { width: 180, margin: 1, color: { dark: '#2b4034', light: '#ffffff' } })
      .then(setPermitQr)
      .catch(() => setPermitQr(''))
  }, [booking?.permitRef])

  const plots = useMemo(() => {
    if (!selectedShowground) return []
    return selectedShowground.plots.filter((plot) =>
      (!filter.size || plot.size === filter.size) &&
      (!filter.status || plot.status === filter.status) &&
      (!filter.traffic || plot.traffic === filter.traffic)
    )
  }, [filter, selectedShowground])

  const chooseShowground = (showground) => {
    setSelectedShowground(showground)
    setSelectedPlot(null)
  }

  const choosePlot = (plot) => {
    setSelectedPlot(plot)
    setView('map')
  }

  const startBooking = () => {
    const current = seasonState(selectedShowground?.season)
    if (!selectedShowground || !selectedPlot) return
    if (!current.active) return flash(`${selectedShowground.name} is outside its leasing window.`, 'warning')
    if (selectedPlot.status !== 'available') return flash('That plot is not available. Choose another plot.', 'warning')
    setBookPage(1)
    setView('book')
  }

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const requestOtp = async () => {
    if (!isValidPhone(form.phone)) return flash('Enter a valid Kenyan phone number first.', 'warning')
    try {
      setBusy(true)
      const result = await api('/api/otp/request', { method: 'POST', body: JSON.stringify({ phone: normalizePhone(form.phone) }) })
      setOtp({ requested: true, verified: false, code: '', token: '', demoCode: result.demoCode || '' })
      flash(result.demoCode ? `Demo verification code: ${result.demoCode}` : 'Verification code sent through Talk Sasa.')
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const verifyOtp = async () => {
    try {
      setBusy(true)
      const result = await api('/api/otp/verify', { method: 'POST', body: JSON.stringify({ phone: normalizePhone(form.phone), code: otp.code }) })
      setOtp((current) => ({ ...current, verified: true, token: result.verificationToken }))
      flash('Phone number verified.')
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const goBookPage = (page) => {
    if (page === 2 && (!form.exhibitorName.trim() || !otp.verified)) {
      return flash('Enter the exhibitor name and verify the phone number first.', 'warning')
    }
    setBookPage(page)
  }

  const createBooking = async () => {
    if (!selectedShowground || !selectedPlot) return
    try {
      setBusy(true)
      const result = await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          phone: normalizePhone(form.phone),
          showgroundId: selectedShowground.id,
          plotId: selectedPlot.id,
          otpToken: otp.token
        })
      })
      setBooking(result.booking)
      setView('pay')
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const pollBooking = useCallback((id) => {
    let attempts = 0
    const poll = async () => {
      attempts += 1
      try {
        const result = await api(`/api/bookings/${id}`)
        setBooking(result.booking)
        if (result.booking.status === 'confirmed') {
          setBusy(false)
          setView('permit')
          return
        }
        if (['failed', 'expired', 'cancelled'].includes(result.booking.status)) {
          setBusy(false)
          flash(`Payment ${result.booking.status}. Your reservation was released.`, 'warning')
          return
        }
      } catch (error) {
        setBusy(false)
        flash(error.message, 'error')
        return
      }
      if (attempts < 30) window.setTimeout(poll, 2000)
      else {
        setBusy(false)
        flash('Still waiting for payment confirmation. Check again shortly.', 'warning')
      }
    }
    setBusy(true)
    poll()
  }, [flash])

  const startPayment = async () => {
    if (!booking) return
    try {
      setBusy(true)
      const result = await api('/api/payments/stk', { method: 'POST', body: JSON.stringify({ bookingId: booking.id, phone: normalizePhone(form.phone) }) })
      setPayment(result)
      setBooking(result.booking || booking)
      flash(result.demo ? 'Demo payment started. Confirmation will arrive shortly.' : 'M-Pesa prompt sent. Check your phone.')
      pollBooking(booking.id)
    } catch (error) {
      setBusy(false)
      flash(error.message, 'error')
    }
  }

  const sendQuestion = async () => {
    if (!question.trim()) return flash('Write a question first.', 'warning')
    if (!selectedShowground || !selectedPlot || !isValidPhone(form.phone)) return flash('Enter a valid phone number so the team can reply.', 'warning')
    try {
      setBusy(true)
      await api('/api/inquiries', {
        method: 'POST',
        body: JSON.stringify({ showgroundId: selectedShowground.id, plotId: selectedPlot.id, phone: normalizePhone(form.phone), message: question })
      })
      setQuestion('')
      setShowQuestion(false)
      flash('Question sent to the showground team.')
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const verifyPermit = useCallback(async (rawValue) => {
    const permitRef = extractPermitRef(rawValue)
    if (!permitRef) return flash('That QR code does not contain a valid permit reference.', 'warning')
    try {
      setBusy(true)
      const result = await api(`/api/permits/${encodeURIComponent(permitRef)}`)
      setVerifiedPermit(result.permit)
      flash('Permit verified successfully.')
    } catch (error) {
      setVerifiedPermit(null)
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }, [flash])

  const reset = async () => {
    setSelectedShowground(null)
    setSelectedPlot(null)
    setBooking(null)
    setPayment(null)
    setPermitQr('')
    setOtp({ requested: false, verified: false, code: '', token: '', demoCode: '' })
    setForm({ exhibitorName: '', phone: '', exhibitorCount: 1, powerNeed: 'none', signageText: '', setupDate: '', competitionOptIn: false })
    setBookPage(1)
    setFilter({ size: '', status: 'available', traffic: '' })
    setView('showground')
    await loadCatalog().catch(() => {})
  }

  const downloadPermit = async () => {
    if (!booking || !selectedPlot || !selectedShowground) return
    const doc = new jsPDF()
    const green = [43, 64, 52]; const amber = [185, 138, 62]; const ink = [35, 42, 34]; const soft = [91, 100, 89]; const border = [211, 216, 201]
    doc.setFillColor(...green); doc.rect(0, 0, 210, 42, 'F')
    doc.setFillColor(...amber); doc.circle(26, 21, 10, 'F')
    try {
      const logoDataUrl = await loadImageDataUrl('/county-showgrounds-logo.png')
      doc.addImage(logoDataUrl, 'PNG', 17, 12, 18, 18)
    } catch {
      doc.setTextColor(...green); doc.setFontSize(12); doc.text('CPH', 26, 25, { align: 'center' })
    }
    doc.setTextColor(242, 244, 238); doc.setFontSize(9); doc.text('EXHIBITOR PLOT LEASE PERMIT', 42, 16); doc.setFontSize(20); doc.text('County Showgrounds', 42, 27); doc.setFontSize(9); doc.text(selectedShowground.name, 42, 35)
    doc.setTextColor(...ink); doc.setFontSize(9); doc.text('PERMIT NO.', 20, 57); doc.setFontSize(14); doc.text(booking.permitRef || 'PENDING', 20, 66)
    doc.setDrawColor(...border); doc.roundedRect(15, 76, 180, 88, 3, 3)
    const rows = [['Exhibitor', form.exhibitorName], ['Plot', selectedPlot.id], ['Category', selectedPlot.category], ['Stand size', selectedPlot.size], ['Setup date', form.setupDate || 'Not set'], ['Amount paid', formatMoney(booking.amount)]]
    let y = 88
    rows.forEach(([label, value]) => { doc.setTextColor(...soft); doc.text(label, 22, y); doc.setTextColor(...ink); doc.text(String(value || ''), 92, y); doc.setDrawColor(...border); doc.line(22, y + 3, 188, y + 3); y += 12 })
    if (permitQr) doc.addImage(permitQr, 'PNG', 22, 178, 32, 32)
    doc.setTextColor(...green); doc.setFontSize(11); doc.text('Payment confirmed', 64, 188); doc.setTextColor(...soft); doc.setFontSize(9); doc.text(`Permit ${booking.permitRef} is registered in the county register.`, 64, 198); doc.text('Present this permit with valid ID at the gate.', 64, 206)
    doc.setFontSize(8); doc.text('Issued by County Showgrounds · Not transferable', 105, 285, { align: 'center' })
    doc.save(`county-showgrounds-permit-${selectedPlot.id}.pdf`)
  }

  const currentStep = viewStep[view]
  const season = selectedShowground ? seasonState(selectedShowground.season) : null
  const detailPlot = selectedShowground?.plots.find((plot) => plot.id === selectedPlot?.id)

  return (
    <div className="app-shell">
      <div className="wrap">
        <div className="datetime-bar">
            <span className="dt-date">{now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span className="dt-sep">·</span>
            <span className="dt-clock" aria-live="polite">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
        <header className="top">
          <div><h1>County Showgrounds</h1><p>Exhibitor plot booking</p></div>
          <div className="top-actions"><div className="brand-logo" aria-label="County Showgrounds seal"><Leaf size={39} strokeWidth={1.4} /></div></div>
        </header>
        <Stepper current={currentStep} />
        {notice && <div className={`toast ${notice.tone}`}><span className="toast-dot" />{notice.message}</div>}
        {selectedShowground && view !== 'showground' && (
          <div className="top-showground-bar">
            <span><strong>{selectedShowground.name}</strong> · {selectedShowground.county} {season && <span className={`season-status ${season.active ? 'open' : 'closed'}`}><i />{season.label} · {season.countdown}</span>}</span>
            <button onClick={() => { setSelectedPlot(null); setView('showground') }}>Change showground</button>
          </div>
        )}

        {loading && <div className="loading-card"><RefreshCw className="spin" /> Loading the live catalog…</div>}

        {!loading && view === 'scanner' && <PermitScanner permit={verifiedPermit} onScan={verifyPermit} onClose={() => setView('showground')} busy={busy} />}

        {!loading && view === 'showground' && (
          <section>
            <div className="showground-map"><CountyMap showgrounds={showgrounds} selected={selectedShowground} onSelect={chooseShowground} /></div>
            <div className="showground-grid">
              {showgrounds.map((showground) => {
                const open = seasonState(showground.season)
                const available = showground.plots.filter((plot) => plot.status === 'available').length
                return (
                  <button className={`showground-card ${selectedShowground?.id === showground.id ? 'selected' : ''}`} key={showground.id} onClick={() => chooseShowground(showground)}>
                    <div className="county">{showground.county}</div>
                    <h3>{showground.name}</h3>
                    <p className="muted">{available} of {showground.plots.length} plots available</p>
                    <span className={`season-status ${open.active ? 'open' : 'closed'}`}><i />{open.active ? 'Closes in' : 'Opens in'} {open.countdown}</span>
                  </button>
                )
              })}
            </div>
            <div className="showground-continue" ref={continueRef}>
              <div className="continue-note">{selectedShowground ? `Selected: ${selectedShowground.name}` : 'Choose a showground to continue'}</div>
              <button className="btn" disabled={!selectedShowground} onClick={() => setView('browse')}>Continue <ArrowRight size={16} /></button>
            </div>
          </section>
        )}

        {!loading && view === 'browse' && selectedShowground && (
          <section>
            <div className="section-heading"><div><span className="eyebrow">01 · Browse plots</span><h2>Choose your footprint</h2></div><span className="catalog-count">{plots.length} shown</span></div>
            <div className="filters">
              <select value={filter.size} onChange={(event) => setFilter({ ...filter, size: event.target.value })}><option value="">All sizes</option><option value="3x3m">3x3m</option><option value="6x6m">6x6m</option><option value="9x9m">9x9m</option></select>
              <select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">All statuses</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="taken">Taken</option></select>
              <select value={filter.traffic} onChange={(event) => setFilter({ ...filter, traffic: event.target.value })}><option value="">All traffic</option><option value="high">High traffic</option><option value="medium">Medium traffic</option><option value="low">Low traffic</option></select>
            </div>
            <div className="plot-grid">
              {plots.map((plot) => (
                <button className={`plot-card ${selectedPlot?.id === plot.id ? 'selected' : ''}`} key={plot.id} onClick={() => choosePlot(plot)}>
                  <div className="plot-card-top"><span className="plot-code">{plot.id}</span><StatusPill status={plot.status} /></div>
                  <h3>{plot.category}</h3>
                  <div className="plot-specs"><span>{plot.size}</span><span>Up to {plot.exhibitors_capacity}</span><TrafficBars traffic={plot.traffic} /></div>
                  <strong>{formatMoney(plot.price)}</strong>
                </button>
              ))}
            </div>
            {!plots.length && <div className="empty-card">No plots match these filters. Try showing all statuses.</div>}
          </section>
        )}

        {!loading && view === 'map' && selectedShowground && detailPlot && (
          <section>
            <div className="section-heading"><div><span className="eyebrow">02 · Inspect the site</span><h2>Plot {detailPlot.id} on the ground</h2></div><button className="back-button" onClick={() => setView('browse')}><ArrowLeft size={15} /> Back to plots</button></div>
            <div className="legend"><span><i className="legend-swatch available" />Available</span><span><i className="legend-swatch reserved" />Reserved</span><span><i className="legend-swatch taken" />Taken</span></div>
            <div className="map-layout">
              <div className="map-svg-wrap"><PlotMap showground={selectedShowground} selectedPlot={detailPlot} onSelect={setSelectedPlot} /><p className="site-map-caption">Digitized site plan · select a plot to inspect it</p></div>
              <div className="detail-panel">
                <h3>Plot {detailPlot.id}</h3><p className="muted">{detailPlot.category} · {selectedShowground.name}</p>
                <div className="detail-row"><span>Size</span><strong>{detailPlot.size}</strong></div>
                <div className="detail-row"><span>Price</span><strong>{formatMoney(detailPlot.price)}</strong></div>
                <div className="detail-row"><span>Status</span><strong>{detailPlot.status}</strong></div>
                <div className="detail-row"><span>Exhibitors allowed</span><strong>{detailPlot.exhibitors_capacity}</strong></div>
                <div className="detail-row"><span>Expected traffic</span><TrafficBars traffic={detailPlot.traffic} /></div>
                <button className="btn secondary block" onClick={() => setShowQuestion(true)}><MessageSquare size={15} /> Ask a question</button>
                <button className="btn block" disabled={!season?.active || detailPlot.status !== 'available'} onClick={startBooking}>Book this plot <ArrowRight size={16} /></button>
                {!season?.active && <p className="booking-lock">Booking is closed for this showground during the current leasing window.</p>}
              </div>
            </div>
          </section>
        )}

        {!loading && view === 'book' && selectedShowground && selectedPlot && (
          <section>
            <div className="section-heading"><div><span className="eyebrow">03 · Book</span><h2>Reserve your stand</h2></div><button className="back-button" onClick={() => setView('map')}><ArrowLeft size={15} /> Back to plot</button></div>
            <div className="form-card">
              <div className="form-steps">{[1, 2, 3].map((item) => <span className={item <= bookPage ? 'active' : ''} key={item} />)}</div>
              {bookPage === 1 && <><h3>Your details</h3><p className="muted">Plot {selectedPlot.id} · {formatMoney(selectedPlot.price)}</p><label className="field">Business or exhibitor name<input value={form.exhibitorName} onChange={(event) => updateForm('exhibitorName', event.target.value)} placeholder="e.g. Kibaki Dairy Farmers Co-op" /></label><label className="field">Phone number<input value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} placeholder="07XX XXX XXX" inputMode="tel" /></label><div className="otp-row"><button className="btn secondary" onClick={requestOtp} disabled={busy}>{otp.requested ? 'Resend code' : 'Send code'}</button>{otp.requested && <><input value={otp.code} onChange={(event) => setOtp({ ...otp, code: event.target.value })} placeholder="Enter 6 digit code" inputMode="numeric" /><button className="btn secondary" onClick={verifyOtp} disabled={busy || otp.code.length !== 6}>Verify</button></>}</div>{otp.demoCode && !otp.verified && <p className="otp-hint">Demo mode code: <strong>{otp.demoCode}</strong></p>}{otp.verified && <p className="verified"><Check size={14} /> Number verified</p>}<div className="btn-row"><button className="btn secondary" onClick={() => setView('map')}>Back</button><button className="btn" onClick={() => goBookPage(2)} disabled={!form.exhibitorName.trim() || !otp.verified}>Continue <ArrowRight size={16} /></button></div></>}
              {bookPage === 2 && <><h3>Plot needs</h3><label className="field">Number of exhibitors<input type="number" min="1" max={selectedPlot.exhibitors_capacity} value={form.exhibitorCount} onChange={(event) => updateForm('exhibitorCount', Number(event.target.value))} /><span className="hint">Up to {selectedPlot.exhibitors_capacity} allowed for this plot</span></label><label className="field">Power requirement<select value={form.powerNeed} onChange={(event) => updateForm('powerNeed', event.target.value)}><option value="none">None</option><option value="single">Single phase</option><option value="three">Three phase</option></select></label><label className="field">Signage text<input value={form.signageText} onChange={(event) => updateForm('signageText', event.target.value)} placeholder="What should your signboard say?" /></label><label className="field">Setup date<input type="date" value={form.setupDate} onChange={(event) => updateForm('setupDate', event.target.value)} /></label><label className="field">Best Stand competition<div className="toggle-group"><button className={`toggle-btn ${!form.competitionOptIn ? 'selected' : ''}`} onClick={() => updateForm('competitionOptIn', false)}>No thanks</button><button className={`toggle-btn ${form.competitionOptIn ? 'selected' : ''}`} onClick={() => updateForm('competitionOptIn', true)}>Yes, enter us</button></div></label><div className="btn-row"><button className="btn secondary" onClick={() => setBookPage(1)}>Back</button><button className="btn" onClick={() => setBookPage(3)}>Review <ArrowRight size={16} /></button></div></>}
              {bookPage === 3 && <><h3>Review and confirm</h3>{[['Plot', `${selectedPlot.id} · ${selectedShowground.name}`], ['Exhibitor', form.exhibitorName], ['Phone', form.phone], ['Exhibitors in stand', form.exhibitorCount], ['Power', form.powerNeed], ['Setup date', form.setupDate || 'Not set'], ['Best Stand', form.competitionOptIn ? 'Entered' : 'Not entered'], ['Total', formatMoney(selectedPlot.price)]].map(([label, value]) => <div className="summary-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}<div className="btn-row"><button className="btn secondary" onClick={() => setBookPage(2)}>Back</button><button className="btn" onClick={createBooking} disabled={busy}>{busy ? 'Saving…' : 'Confirm and pay'} <ArrowRight size={16} /></button></div></>}
            </div>
          </section>
        )}

        {!loading && view === 'pay' && booking && (
          <section className="pay-screen"><div className="pulse" /><span className="eyebrow">04 · Payment</span><h2>Check your phone</h2><p className="muted">Enter your M-Pesa PIN to complete payment of <strong>{formatMoney(booking.amount)}</strong>.</p>{!payment ? <button className="btn" onClick={startPayment} disabled={busy}>{busy ? 'Starting payment…' : 'Send M-Pesa prompt'} <Smartphone size={16} /></button> : <><div className="payment-wait"><Clock3 size={17} /><span>{payment.demo ? 'Demo payment is simulating confirmation.' : 'Waiting for M-Pesa confirmation.'}</span></div><button className="btn secondary" onClick={() => pollBooking(booking.id)} disabled={busy}><RefreshCw size={15} /> Check again</button></>}<button className="back-button payment-back" onClick={() => setView('book')}><ArrowLeft size={15} /> Back to booking</button></section>
        )}

        {!loading && view === 'permit' && booking && selectedShowground && selectedPlot && (
          <section><div className="permit-status-line"><Check size={18} /> Payment confirmed · permit issued</div><div className="permit-shell"><div className="permit"><div className="permit-letterhead"><div className="permit-logo">CPH</div><div><small>EXHIBITOR PLOT LEASE PERMIT</small><h2>County Showgrounds</h2><span>{selectedShowground.name} · {selectedShowground.county}</span></div><strong><Ticket size={13} /> {booking.permitRef}</strong></div><div className="permit-body"><small>LEASE DETAILS</small>{[['Exhibitor', form.exhibitorName], ['Plot', selectedPlot.id], ['Category', selectedPlot.category], ['Stand size', selectedPlot.size], ['Setup date', form.setupDate || 'Not set'], ['Amount paid', formatMoney(booking.amount)]].map(([label, value]) => <div className="permit-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="permit-verify">{permitQr ? <img src={permitQr} alt="Permit QR code" /> : <RefreshCw className="spin" />}<p><strong>Scan to verify authenticity</strong><br />Permit {booking.permitRef} is registered in the county showgrounds register.</p></div><div className="permit-foot">Issued by County Showgrounds · Not transferable · Present with valid ID at the gate</div></div></div><div className="permit-actions"><button className="btn block" onClick={downloadPermit}><Download size={16} /> Download permit (PDF)</button><button className="btn secondary block" onClick={reset}>Book another plot</button></div></section>
        )}
      </div>

      <footer><span><Leaf size={14} /> County Showgrounds</span><span>Live catalog · Secure booking</span></footer>
      {showQuestion && <div className="modal-backdrop" onClick={() => setShowQuestion(false)}><div className="modal" onClick={(event) => event.stopPropagation()}><CircleHelp size={21} /><h3>Ask about plot {selectedPlot?.id}</h3><p className="muted">The showground team will reply to your phone number.</p><textarea rows="4" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. Is there shade cover on this plot?" /><div className="btn-row"><button className="btn secondary" onClick={() => setShowQuestion(false)}>Cancel</button><button className="btn" onClick={sendQuestion} disabled={busy}><Send size={15} /> Send question</button></div></div></div>}
    </div>
  )
}