import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Popup, Rectangle, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
<<<<<<< HEAD
import { ArrowLeft, ArrowRight, Check, CircleHelp, Clock3, Download, Leaf, MapPin, MessageSquare, RefreshCw, Send, ShieldCheck, Smartphone, Sparkles, Store, Ticket, Zap } from 'lucide-react'
=======
import { ArrowLeft, ArrowRight, Check, CircleHelp, Clock3, Download, Leaf, MapPin, MessageSquare, RefreshCw, Send, Smartphone, Store, Ticket } from 'lucide-react'
>>>>>>> master
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { api } from './api'

<<<<<<< HEAD
const steps = ['Discover', 'Explore', 'Reserve', 'Pay', 'Permit']
const stepIndex = { discover: 0, explore: 1, reserve: 2, pay: 3, permit: 4 }
=======
const steps = ['Showground', 'Browse', 'Map', 'Inquire', 'Book', 'Pay', 'Permit']
const viewStep = { showground: 0, browse: 1, map: 2, book: 4, pay: 5, permit: 6 }
>>>>>>> master

function formatMoney(value) {
  return `KES ${Number(value || 0).toLocaleString()}`
}

<<<<<<< HEAD
function seasonState(season) {
  if (!season) return { active: true, label: 'Booking open', countdown: '' }
=======
function normalizePhone(value = '') {
  const raw = value.replace(/\s+/g, '')
  return raw.startsWith('+254') ? `0${raw.slice(4)}` : raw
}

function isValidPhone(value) {
  return /^(?:\+254|0)(?:7|1)\d{8}$/.test(value.replace(/\s+/g, ''))
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
>>>>>>> master
  const now = new Date()
  const range = (year) => {
    const start = new Date(year, season.startMonth - 1, 1)
    const endYear = season.endMonth < season.startMonth ? year + 1 : year
    const end = new Date(endYear, season.endMonth, 0, 23, 59, 59, 999)
    return { start, end }
  }
  const ranges = [range(now.getFullYear() - 1), range(now.getFullYear()), range(now.getFullYear() + 1)]
<<<<<<< HEAD
  const current = ranges.find((r) => now >= r.start && now <= r.end)
  const target = current ? current.end : (ranges.find((r) => r.start > now) || range(now.getFullYear() + 2)).start
  const ms = Math.max(0, target - now)
  const days = Math.floor(ms / 86400000)
  return { active: Boolean(current), label: current ? 'Booking open' : 'Booking closed', countdown: `${days}d ${String(Math.floor(ms / 3600000) % 24).padStart(2, '0')}h` }
}

function normalizePhone(value) {
  const raw = value.replace(/\s+/g, '')
  if (raw.startsWith('+254')) return `0${raw.slice(4)}`
  return raw
}

function buildPermitRef(booking) {
  return booking?.permitRef || 'PENDING'
}

function normalizeCatalog(items) {
  return items.map((showground) => ({
    ...showground,
    plots: showground.plots.map((plot) => ({ ...plot, exhibitors_capacity: plot.exhibitorsCapacity ?? plot.exhibitors_capacity }))
  }))
}

function KenyaMarker({ selected, position, onClick }) {
=======
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
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [25, 25], maxZoom })
  }, [map, points, maxZoom])
  return null
}

function CountyMarker({ selected, position, onClick }) {
>>>>>>> master
  const icon = useMemo(() => L.divIcon({
    className: 'county-marker-wrap',
    html: `<span class="county-marker ${selected ? 'selected' : ''}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  }), [selected])
  return <Marker position={position} icon={icon} eventHandlers={{ click: onClick }} />
}

<<<<<<< HEAD
function FitMap({ points, zoom = 6 }) {
  const map = useMap()
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: zoom })
  }, [map, points, zoom])
  return null
}

function PlotMap({ showground, selectedPlot, onSelect }) {
  const points = [[showground.lat, showground.lng]]
  const plotBounds = (plot) => {
    const [w, h] = String(plot.size || '3x3m').replace('m', '').split('x').map(Number)
    const dLat = (h / 6378137) * (180 / Math.PI)
    const dLng = (w / (6378137 * Math.cos(showground.lat * Math.PI / 180))) * (180 / Math.PI)
    const sw = [showground.lat + (plot.offsetN / 6378137) * (180 / Math.PI), showground.lng + (plot.offsetE / (6378137 * Math.cos(showground.lat * Math.PI / 180))) * (180 / Math.PI)]
    const ne = [sw[0] + dLat, sw[1] + dLng]
    points.push(sw, ne)
    return [sw, ne]
  }
  return (
    <MapContainer className="plot-map" center={[showground.lat, showground.lng]} zoom={17} scrollWheelZoom={false}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {showground.plots.map((plot) => {
        const bounds = plotBounds(plot)
        return <Rectangle key={plot.id} bounds={bounds} pathOptions={{ className: `plot-shape ${plot.status} ${plot.id === selectedPlot?.id ? 'selected' : ''}`, weight: plot.id === selectedPlot?.id ? 3 : 1, fillOpacity: 0.62 }} eventHandlers={{ click: () => onSelect(plot) }}>
          <Popup><strong>Plot {plot.id}</strong><br />{formatMoney(plot.price)} · {plot.status}</Popup>
        </Rectangle>
      })}
      <FitMap points={points} zoom={17} />
    </MapContainer>
  )
}

function ShowgroundMap({ showgrounds, selected, onSelect }) {
  const points = showgrounds.map((s) => [s.lat, s.lng])
  return (
    <MapContainer className="county-map" center={[0.0236, 37.9062]} zoom={6} scrollWheelZoom={false}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {showgrounds.map((s) => <KenyaMarker key={s.id} selected={selected?.id === s.id} onClick={() => onSelect(s)} position={[s.lat, s.lng]} />)}
=======
function CountyMap({ showgrounds, selected, onSelect }) {
  const points = showgrounds.map((item) => [item.lat, item.lng])
  return (
    <MapContainer className="county-map" center={[0.0236, 37.9062]} zoom={6} scrollWheelZoom={false}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {showgrounds.map((item) => (
        <CountyMarker key={item.id} selected={selected?.id === item.id} position={[item.lat, item.lng]} onClick={() => onSelect(item)} />
      ))}
>>>>>>> master
      <FitMap points={points} />
    </MapContainer>
  )
}

<<<<<<< HEAD
function Stepper({ current }) {
  return <div className="stepper" aria-label="Booking progress">{steps.map((label, index) => <div className={`step ${index === current ? 'active' : index < current ? 'done' : ''}`} key={label}><span>{index < current ? <Check size={14} /> : index + 1}</span><small>{label}</small></div>)}</div>
=======
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
>>>>>>> master
}

function StatusPill({ status }) {
  const label = status === 'available' ? 'Available' : status === 'reserved' ? 'Reserved' : status === 'taken' ? 'Taken' : status
  return <span className={`status-pill ${status}`}><i />{label}</span>
}

<<<<<<< HEAD
=======
function TrafficBars({ traffic }) {
  const count = traffic === 'high' ? 3 : traffic === 'medium' ? 2 : 1
  return <span className="traffic-label"><span className="traffic-bars">{[1, 2, 3].map((item) => <i className={item <= count ? 'on' : ''} key={item} />)}</span>{traffic}</span>
}

>>>>>>> master
export default function App() {
  const [showgrounds, setShowgrounds] = useState([])
  const [selectedShowground, setSelectedShowground] = useState(null)
  const [selectedPlot, setSelectedPlot] = useState(null)
<<<<<<< HEAD
  const [view, setView] = useState('discover')
  const [filter, setFilter] = useState({ size: '', status: 'available', traffic: '' })
  const [form, setForm] = useState({ exhibitorName: '', phone: '', exhibitorCount: 1, powerNeed: 'none', signageText: '', setupDate: '', competitionOptIn: false })
=======
  const [view, setView] = useState('showground')
  const [filter, setFilter] = useState({ size: '', status: 'available', traffic: '' })
  const [form, setForm] = useState({ exhibitorName: '', phone: '', exhibitorCount: 1, powerNeed: 'none', signageText: '', setupDate: '', competitionOptIn: false })
  const [bookPage, setBookPage] = useState(1)
>>>>>>> master
  const [otp, setOtp] = useState({ requested: false, verified: false, code: '', token: '', demoCode: '' })
  const [booking, setBooking] = useState(null)
  const [payment, setPayment] = useState(null)
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [question, setQuestion] = useState('')
  const [showQuestion, setShowQuestion] = useState(false)
  const [permitQr, setPermitQr] = useState('')

  const flash = useCallback((message, tone = 'info') => {
    setNotice({ message, tone })
<<<<<<< HEAD
    window.setTimeout(() => setNotice(null), 4200)
  }, [])

  useEffect(() => {
    api('/api/showgrounds').then((result) => setShowgrounds(normalizeCatalog(result.showgrounds))).catch((error) => flash(error.message, 'error')).finally(() => setLoading(false))
  }, [flash])

  useEffect(() => {
    if (!booking?.permitRef) return
    QRCode.toDataURL(`county-plot-hub://permit/${booking.permitRef}`, { width: 180, margin: 1, color: { dark: '#173b2d', light: '#ffffff' } }).then(setPermitQr).catch(() => setPermitQr(''))
=======
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
>>>>>>> master
  }, [booking?.permitRef])

  const plots = useMemo(() => {
    if (!selectedShowground) return []
<<<<<<< HEAD
    return selectedShowground.plots.filter((p) => (!filter.size || p.size === filter.size) && (!filter.status || p.status === filter.status) && (!filter.traffic || p.traffic === filter.traffic))
=======
    return selectedShowground.plots.filter((plot) =>
      (!filter.size || plot.size === filter.size) &&
      (!filter.status || plot.status === filter.status) &&
      (!filter.traffic || plot.traffic === filter.traffic)
    )
>>>>>>> master
  }, [filter, selectedShowground])

  const chooseShowground = (showground) => {
    setSelectedShowground(showground)
    setSelectedPlot(null)
  }

  const choosePlot = (plot) => {
    setSelectedPlot(plot)
<<<<<<< HEAD
    setView('explore')
  }

  const startBooking = () => {
    const season = seasonState(selectedShowground?.season)
    if (!season.active) return flash(`${selectedShowground.name} is outside its leasing window.`, 'warning')
    if (selectedPlot?.status !== 'available') return flash('That plot has just become unavailable. Refresh and choose another plot.', 'warning')
    setView('reserve')
=======
    setView('map')
  }

  const startBooking = () => {
    const current = seasonState(selectedShowground?.season)
    if (!selectedShowground || !selectedPlot) return
    if (!current.active) return flash(`${selectedShowground.name} is outside its leasing window.`, 'warning')
    if (selectedPlot.status !== 'available') return flash('That plot is not available. Choose another plot.', 'warning')
    setBookPage(1)
    setView('book')
>>>>>>> master
  }

  const updateForm = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const requestOtp = async () => {
<<<<<<< HEAD
=======
    if (!isValidPhone(form.phone)) return flash('Enter a valid Kenyan phone number first.', 'warning')
>>>>>>> master
    try {
      setBusy(true)
      const result = await api('/api/otp/request', { method: 'POST', body: JSON.stringify({ phone: normalizePhone(form.phone) }) })
      setOtp({ requested: true, verified: false, code: '', token: '', demoCode: result.demoCode || '' })
<<<<<<< HEAD
      flash(result.demoCode ? `Demo OTP: ${result.demoCode}` : 'Verification code sent through Talk Sasa.')
    } catch (error) { flash(error.message, 'error') } finally { setBusy(false) }
=======
      flash(result.demoCode ? `Demo verification code: ${result.demoCode}` : 'Verification code sent through Talk Sasa.')
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
>>>>>>> master
  }

  const verifyOtp = async () => {
    try {
      setBusy(true)
      const result = await api('/api/otp/verify', { method: 'POST', body: JSON.stringify({ phone: normalizePhone(form.phone), code: otp.code }) })
      setOtp((current) => ({ ...current, verified: true, token: result.verificationToken }))
      flash('Phone number verified.')
<<<<<<< HEAD
    } catch (error) { flash(error.message, 'error') } finally { setBusy(false) }
  }

  const createBooking = async () => {
    try {
      setBusy(true)
      const result = await api('/api/bookings', { method: 'POST', body: JSON.stringify({ ...form, phone: normalizePhone(form.phone), showgroundId: selectedShowground.id, plotId: selectedPlot.id, otpToken: otp.token }) })
      setBooking(result.booking)
      setView('pay')
    } catch (error) { flash(error.message, 'error') } finally { setBusy(false) }
  }

  const startPayment = async () => {
    try {
      setBusy(true)
      const result = await api('/api/payments/stk', { method: 'POST', body: JSON.stringify({ bookingId: booking.id, phone: normalizePhone(form.phone) }) })
      setPayment(result)
      flash(result.demo ? 'Demo payment started. A simulated confirmation will arrive shortly.' : 'M-Pesa prompt sent. Check your phone.')
      pollBooking(booking.id)
    } catch (error) { flash(error.message, 'error'); setBusy(false) }
  }

  const pollBooking = (id) => {
=======
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
>>>>>>> master
    let attempts = 0
    const poll = async () => {
      attempts += 1
      try {
        const result = await api(`/api/bookings/${id}`)
        setBooking(result.booking)
        if (result.booking.status === 'confirmed') {
<<<<<<< HEAD
          setView('permit')
          setBusy(false)
=======
          setBusy(false)
          setView('permit')
>>>>>>> master
          return
        }
        if (['failed', 'expired', 'cancelled'].includes(result.booking.status)) {
          setBusy(false)
          flash(`Payment ${result.booking.status}. Your reservation was released.`, 'warning')
          return
        }
<<<<<<< HEAD
      } catch (error) { flash(error.message, 'error'); setBusy(false); return }
      if (attempts < 30) window.setTimeout(poll, 2000)
      else { setBusy(false); flash('Still waiting for payment confirmation. This page can be refreshed safely.', 'warning') }
    }
    poll()
=======
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
>>>>>>> master
  }

  const sendQuestion = async () => {
    if (!question.trim()) return flash('Write a question first.', 'warning')
<<<<<<< HEAD
    const phone = normalizePhone(form.phone)
    if (!/^(?:\+254|0)(?:7|1)\d{8}$/.test(phone)) return flash('Enter a valid Kenyan phone number so the team can reply.', 'warning')
    try {
      setBusy(true)
      await api('/api/inquiries', { method: 'POST', body: JSON.stringify({ showgroundId: selectedShowground.id, plotId: selectedPlot.id, phone, message: question }) })
      setQuestion('')
      setShowQuestion(false)
      flash('Question sent to the showground team.')
    } catch (error) { flash(error.message, 'error') } finally { setBusy(false) }
  }

  const reset = async () => {
    setSelectedPlot(null); setBooking(null); setPayment(null); setPermitQr(''); setOtp({ requested: false, verified: false, code: '', token: '', demoCode: '' }); setForm({ exhibitorName: '', phone: '', exhibitorCount: 1, powerNeed: 'none', signageText: '', setupDate: '', competitionOptIn: false }); setView('discover')
    const result = await api('/api/showgrounds').catch(() => null)
    if (result) setShowgrounds(normalizeCatalog(result.showgrounds))
  }

  const downloadPermit = () => {
    const doc = new jsPDF()
    const green = [23, 59, 45]; const yellow = [243, 194, 55]; const ink = [30, 39, 34]; const soft = [100, 112, 101]
    doc.setFillColor(...green); doc.rect(0, 0, 210, 42, 'F')
    doc.setFillColor(...yellow); doc.circle(25, 21, 9, 'F'); doc.setTextColor(...green); doc.setFontSize(13); doc.text('CPH', 25, 25, { align: 'center' })
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.text('EXHIBITOR PLOT LEASE PERMIT', 40, 16); doc.setFontSize(20); doc.text('County Plot Hub', 40, 27); doc.setFontSize(9); doc.text(`${selectedShowground.name} · ${selectedShowground.county}`, 40, 35)
    doc.setTextColor(...ink); doc.setFontSize(10); doc.text('PERMIT REFERENCE', 20, 58); doc.setFontSize(15); doc.text(buildPermitRef(booking), 20, 68)
    doc.setDrawColor(220, 226, 216); doc.roundedRect(15, 78, 180, 86, 3, 3)
    const rows = [['Exhibitor', form.exhibitorName], ['Plot', selectedPlot.id], ['Category', selectedPlot.category], ['Size', selectedPlot.size], ['Setup date', form.setupDate || 'Not set'], ['Amount paid', formatMoney(booking.amount)]]
    let y = 89; rows.forEach(([label, value]) => { doc.setTextColor(...soft); doc.text(label, 22, y); doc.setTextColor(...ink); doc.text(String(value), 90, y); doc.setDrawColor(232, 236, 230); doc.line(22, y + 3, 188, y + 3); y += 12 })
    doc.setFillColor(245, 248, 242); doc.roundedRect(15, 174, 180, 37, 3, 3, 'F'); if (permitQr) doc.addImage(permitQr, 'PNG', 162, 177, 28, 28); doc.setTextColor(...green); doc.setFontSize(11); doc.text('Payment confirmed', 22, 188); doc.setTextColor(...soft); doc.setFontSize(9); doc.text('Present this permit with valid ID at the gate.', 22, 200)
    doc.setTextColor(...soft); doc.setFontSize(8); doc.text('Issued by County Plot Hub · Not transferable', 105, 285, { align: 'center' })
    doc.save(`county-plot-permit-${selectedPlot.id}.pdf`)
  }

  const currentStep = stepIndex[view]
  const season = selectedShowground ? seasonState(selectedShowground.season) : null

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Leaf size={22} /></div><div><strong>County Plot Hub</strong><span>Kenya showground leasing</span></div></div>
      <div className="topbar-meta"><span><span className="live-dot" /> Live catalog</span><span className="date-label">{new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
    </header>
    <main className="page">
      <section className="hero">
        <div><span className="eyebrow"><Sparkles size={14} /> Exhibitor season 2026</span><h1>Make your mark<br /><em>where Kenya gathers.</em></h1><p>Find the right plot, see it on the ground, and secure your stand without the spreadsheet shuffle.</p></div>
        <div className="hero-note"><div className="hero-note-icon"><MapPin size={18} /></div><div><strong>Built for the gate, not just the screen.</strong><span>Every permit carries a verifiable booking reference.</span></div></div>
      </section>
      <Stepper current={currentStep} />
      {notice && <div className={`notice ${notice.tone}`}><span>{notice.tone === 'error' ? '!' : '•'}</span>{notice.message}</div>}
      {loading && <div className="loading-card"><RefreshCw className="spin" /> Loading the live catalog…</div>}
      {!loading && view === 'discover' && <section className="discover-grid">
        <div className="map-frame"><ShowgroundMap showgrounds={showgrounds} selected={selectedShowground} onSelect={chooseShowground} /><div className="map-caption"><span><span className="map-key" /> {showgrounds.length} showgrounds on the map</span><span>OpenStreetMap</span></div></div>
        <div className="catalog-panel"><div className="section-heading"><div><span className="eyebrow">01 · Choose a destination</span><h2>Where will you show?</h2></div><span className="catalog-count">{showgrounds.length} places</span></div><div className="showground-list">{showgrounds.map((s) => { const open = seasonState(s.season); const available = s.plots.filter((p) => p.status === 'available').length; return <button className={`showground-card ${selectedShowground?.id === s.id ? 'selected' : ''}`} key={s.id} onClick={() => chooseShowground(s)}><div className="card-top"><span className="county-label">{s.county}</span><span className={`open-indicator ${open.active ? 'open' : ''}`}>{open.active ? 'Leasing now' : 'Seasonal'}</span></div><h3>{s.name}</h3><div className="card-bottom"><span>{available} of {s.plots.length} available</span><span>{open.active ? 'Closes' : 'Opens'} {open.countdown}</span></div></button> })}</div><button className="primary large" disabled={!selectedShowground} onClick={() => setView('explore')}>Explore plots <ArrowRight size={17} /></button></div>
      </section>}
      {!loading && view === 'explore' && selectedShowground && <section><div className="context-bar"><button className="back-button" onClick={() => setView('discover')}><ArrowLeft size={16} /> Change showground</button><span><Store size={15} /> {selectedShowground.name}</span><span className={`season-badge ${season.active ? 'active' : ''}`}><Clock3 size={14} /> {season.label} · {season.countdown}</span></div><div className="section-heading explore-heading"><div><span className="eyebrow">02 · Pick your footprint</span><h2>Plots at {selectedShowground.name}</h2></div><span className="catalog-count">{plots.length} shown</span></div><div className="filters"><select value={filter.size} onChange={(e) => setFilter({ ...filter, size: e.target.value })}><option value="">All sizes</option><option>3x3m</option><option>6x6m</option><option>9x9m</option></select><select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="">All statuses</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="taken">Taken</option></select><select value={filter.traffic} onChange={(e) => setFilter({ ...filter, traffic: e.target.value })}><option value="">All traffic</option><option value="high">High traffic</option><option value="medium">Medium traffic</option><option value="low">Low traffic</option></select></div><div className="plot-grid">{plots.map((p) => <button className={`plot-card ${selectedPlot?.id === p.id ? 'selected' : ''}`} key={p.id} onClick={() => choosePlot(p)}><div className="plot-card-top"><span className="plot-code">{p.id}</span><StatusPill status={p.status} /></div><h3>{p.category}</h3><div className="plot-specs"><span>{p.size}</span><span>Up to {p.exhibitors_capacity}</span><span className="traffic"><i className={p.traffic === 'high' ? 'on' : ''} /><i className={p.traffic !== 'low' ? 'on' : ''} /><i className="on" /> {p.traffic}</span></div><strong>{formatMoney(p.price)}</strong></button>)}</div></section>}
      {!loading && view === 'reserve' && selectedShowground && selectedPlot && <section><div className="context-bar"><button className="back-button" onClick={() => setView('explore')}><ArrowLeft size={16} /> Back to map</button><span>Plot {selectedPlot.id} · {selectedShowground.name}</span></div><div className="booking-layout"><div className="booking-map"><PlotMap showground={selectedShowground} selectedPlot={selectedPlot} onSelect={setSelectedPlot} /><div className="map-caption"><span><span className="map-key yellow" /> Selected plot</span><span>Drag to inspect</span></div></div><div className="booking-card"><span className="eyebrow">03 · Reserve your stand</span><h2>Make it yours.</h2><p className="muted">Plot {selectedPlot.id} · {selectedPlot.size} · {formatMoney(selectedPlot.price)}</p><label>Business or exhibitor name<input value={form.exhibitorName} onChange={(e) => updateForm('exhibitorName', e.target.value)} placeholder="e.g. Kibaki Dairy Farmers Co-op" /></label><label>Phone number<input value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} placeholder="07XX XXX XXX" inputMode="tel" /></label><div className="otp-box">{!otp.requested ? <button className="secondary full" onClick={requestOtp} disabled={busy || !form.phone}><Smartphone size={16} /> Send verification code</button> : <><div className="otp-status"><span className={otp.verified ? 'check-circle' : 'number-circle'}>{otp.verified ? <Check size={13} /> : '2'}</span><span>{otp.verified ? 'Phone verified' : 'Enter the code sent by Talk Sasa'}</span></div>{!otp.verified && <div className="otp-input"><input value={otp.code} onChange={(e) => setOtp({ ...otp, code: e.target.value })} placeholder="6-digit code" inputMode="numeric" /><button className="secondary" onClick={verifyOtp} disabled={busy || otp.code.length < 4}>Verify</button></div>}</>}</div>{otp.verified && <div className="optional-fields"><label>Exhibitors in stand<input type="number" min="1" max={selectedPlot.exhibitors_capacity} value={form.exhibitorCount} onChange={(e) => updateForm('exhibitorCount', Number(e.target.value))} /></label><label>Power requirement<select value={form.powerNeed} onChange={(e) => updateForm('powerNeed', e.target.value)}><option value="none">None</option><option value="single">Single phase</option><option value="three">Three phase</option></select></label><label>Setup date<input type="date" value={form.setupDate} onChange={(e) => updateForm('setupDate', e.target.value)} /></label><label>Signage text<input value={form.signageText} onChange={(e) => updateForm('signageText', e.target.value)} placeholder="What should your signboard say?" /></label><label className="switch-label"><input type="checkbox" checked={form.competitionOptIn} onChange={(e) => updateForm('competitionOptIn', e.target.checked)} /><span className="switch" /> Enter Best Stand competition</label></div>}<button className="primary full" onClick={createBooking} disabled={busy || !otp.verified || !form.exhibitorName || !form.phone}>{busy ? 'Saving…' : 'Review and continue'} <ArrowRight size={17} /></button><button className="text-button" onClick={() => setShowQuestion(true)}><MessageSquare size={15} /> Ask about this plot</button></div></div></section>}
      {!loading && view === 'pay' && booking && <section className="center-stage"><div className="payment-card"><div className="payment-icon"><Smartphone size={25} /></div><span className="eyebrow">04 · Secure payment</span><h2>Check your phone.</h2><p>We’ll send an M-Pesa prompt to <strong>{form.phone}</strong> for <strong>{formatMoney(booking.amount)}</strong>.</p>{!payment ? <button className="primary full" onClick={startPayment} disabled={busy}>{busy ? 'Starting secure checkout…' : 'Send M-Pesa prompt'} <Zap size={16} /></button> : <><div className="waiting"><span className="pulse-ring"><Clock3 size={17} /></span><div><strong>Waiting for confirmation</strong><span>{payment.demo ? 'Demo mode is simulating the callback.' : 'Enter your PIN on the phone to continue.'}</span></div></div><button className="secondary full" onClick={() => pollBooking(booking.id)} disabled={busy}><RefreshCw size={15} /> Check again</button></>}<button className="text-button" onClick={() => setView('reserve')}><ArrowLeft size={15} /> Back to booking</button></div></section>}
       {!loading && view === 'permit' && booking && selectedShowground && selectedPlot && <section className="permit-stage"><div className="permit-success"><div className="success-mark"><Check size={23} /></div><div><span className="eyebrow">05 · Permit issued</span><h2>You’re on the map.</h2><p>Payment confirmed. Keep this permit for the gate.</p></div><span className="permit-ref"><Ticket size={14} /> {buildPermitRef(booking)}</span></div><div className="permit-layout"><div className="permit-preview"><div className="permit-head"><div className="permit-logo">CPH</div><div><small>EXHIBITOR PLOT LEASE PERMIT</small><strong>County Plot Hub</strong><span>{selectedShowground.name} · {selectedShowground.county}</span></div><div className="permit-status">CONFIRMED</div></div><div className="permit-body"><small>LEASE DETAILS</small><div className="permit-row"><span>Exhibitor</span><strong>{form.exhibitorName}</strong></div><div className="permit-row"><span>Plot</span><strong>{selectedPlot.id}</strong></div><div className="permit-row"><span>Category</span><strong>{selectedPlot.category}</strong></div><div className="permit-row"><span>Stand size</span><strong>{selectedPlot.size}</strong></div><div className="permit-row"><span>Setup date</span><strong>{form.setupDate || 'Not set'}</strong></div><div className="permit-row"><span>Amount paid</span><strong>{formatMoney(booking.amount)}</strong></div></div><div className="permit-foot"><div className="real-qr">{permitQr ? <img src={permitQr} alt={`QR code for permit ${buildPermitRef(booking)}`} /> : <RefreshCw className="spin" size={17} />}</div><p><strong>Scan to verify authenticity</strong><br />Permit {buildPermitRef(booking)} is registered in the county showgrounds register.</p></div></div><div className="permit-actions"><div className="confirmed-panel"><ShieldCheck size={19} /><div><strong>Payment verified</strong><span>Daraja confirmation recorded</span></div></div><button className="primary full" onClick={downloadPermit}><Download size={16} /> Download permit PDF</button><button className="secondary full" onClick={reset}>Book another plot</button></div></div></section>}
    </main>
    <footer><span><Leaf size={14} /> County Plot Hub</span><span>Green ground. Clear booking.</span></footer>
    {showQuestion && <div className="modal-backdrop" onClick={() => setShowQuestion(false)}><div className="modal" onClick={(e) => e.stopPropagation()}><div className="modal-icon"><CircleHelp size={21} /></div><h2>Ask about plot {selectedPlot?.id}</h2><p className="muted">The showground team will reply to the phone number on this booking.</p><textarea rows="4" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Is there shade cover on this plot?" /><div className="modal-actions"><button className="secondary" onClick={() => setShowQuestion(false)}>Cancel</button><button className="primary" onClick={sendQuestion} disabled={busy}><Send size={15} /> Send question</button></div></div></div>}
  </div>
}
=======
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

  const downloadPermit = () => {
    if (!booking || !selectedPlot || !selectedShowground) return
    const doc = new jsPDF()
    const green = [43, 64, 52]; const amber = [185, 138, 62]; const ink = [35, 42, 34]; const soft = [91, 100, 89]; const border = [211, 216, 201]
    doc.setFillColor(...green); doc.rect(0, 0, 210, 42, 'F')
    doc.setFillColor(...amber); doc.circle(26, 21, 9, 'F'); doc.setTextColor(...green); doc.setFontSize(12); doc.text('CPH', 26, 25, { align: 'center' })
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
          <span className="dt-date">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span className="dt-sep">·</span>
          <span className="dt-clock">{new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
        <header className="top">
          <div><h1>County Showgrounds</h1><p>Exhibitor plot booking</p></div>
          <div className="brand-logo" aria-label="County Showgrounds seal"><Leaf size={39} strokeWidth={1.4} /></div>
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
            <div className="showground-continue">
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
>>>>>>> master
