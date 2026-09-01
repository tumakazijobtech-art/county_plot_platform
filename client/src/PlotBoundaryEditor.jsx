import { useEffect, useRef, useState } from 'react'
import { ImageOverlay, MapContainer, Marker, Polygon, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { AlertTriangle, Check, CheckCircle2, Clock3, Crosshair, FileUp, ImagePlus, MapPinned, Pencil, Redo2, Save, Trash2, Undo2, X, XCircle } from 'lucide-react'

const statusPaint = {
  available: { stroke: '#4c7a5d', fill: '#e4eee3' },
  reserved: { stroke: '#b98a3e', fill: '#f3e7d2' },
  taken: { stroke: '#8b8b82', fill: '#eaeae6' }
}

// GeoJSON coordinates are [longitude, latitude]; Leaflet wants [latitude, longitude].
const toLatLng = ([lng, lat]) => [lat, lng]
const toLngLat = ([lat, lng]) => [lng, lat]

function vertexIcon() {
  return L.divIcon({ className: 'vertex-icon-wrap', html: '<span class="vertex-handle"></span>', iconSize: [16, 16], iconAnchor: [8, 8] })
}

// --- Lightweight polygon-overlap check (mirrors the server-side check) so the
// admin gets an immediate warning while drawing, before saving. ---
function segmentsIntersect(p1, p2, p3, p4) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = cross(p3, p4, p1)
  const d2 = cross(p3, p4, p2)
  const d3 = cross(p1, p2, p3)
  const d4 = cross(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}
function pointInRing(point, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (((yi > point[1]) !== (yj > point[1])) && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
function ringsOverlap(ringA, ringB) {
  for (let i = 0; i < ringA.length - 1; i++) {
    for (let j = 0; j < ringB.length - 1; j++) {
      if (segmentsIntersect(ringA[i], ringA[i + 1], ringB[j], ringB[j + 1])) return true
    }
  }
  return pointInRing(ringA[0], ringB) || pointInRing(ringB[0], ringA)
}
function liveOverlaps(drawPoints, targetPlotId, plots) {
  if (drawPoints.length < 3) return []
  const ring = [...drawPoints.map(toLngLat), toLngLat(drawPoints[0])]
  return plots
    .filter((plot) => plot.id !== targetPlotId && plot.boundary?.coordinates?.[0]?.length >= 4 && ringsOverlap(ring, plot.boundary.coordinates[0]))
    .map((plot) => plot.id)
}

function MapClicks({ active, onClick }) {
  useMapEvents({ click: (event) => { if (active) onClick([event.latlng.lat, event.latlng.lng]) } })
  return null
}

function FitToGround({ ground, sitePlanBounds }) {
  const map = useMap()
  useEffect(() => {
    if (sitePlanBounds) map.fitBounds(sitePlanBounds, { padding: [20, 20] })
    else map.setView([ground.lat, ground.lng], 18)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ground.id])
  return null
}

export default function PlotBoundaryEditor({ ground, adminRequest, flash, readOnly, busy, setBusy, onGroundUpdated }) {
  const [mode, setMode] = useState('idle') // 'idle' | 'draw'
  const [targetPlotId, setTargetPlotId] = useState('')
  const [points, setPoints] = useState([])
  const [pickCorner, setPickCorner] = useState(null) // 'sw' | 'ne' | null
  const [spDraft, setSpDraft] = useState(null)
  const [importSummary, setImportSummary] = useState(null)
  const geoInputRef = useRef(null)

  useEffect(() => {
    setMode('idle')
    setPoints([])
    setTargetPlotId('')
    setSpDraft(null)
    setPickCorner(null)
    setImportSummary(null)
  }, [ground?.id])

  if (!ground) return <div className="empty-card">Choose a showground on the left to digitize its plots.</div>

  const plots = ground.plots || []
  const digitized = plots.filter((plot) => plot.boundary)
  const savedSitePlan = ground.sitePlan
  const overlapsNow = mode === 'draw' ? liveOverlaps(points, targetPlotId, plots) : []

  const startTrace = (plotId) => {
    if (readOnly || busy) return
    const existing = plots.find((plot) => plot.id === plotId)
    setMode('draw')
    setTargetPlotId(plotId)
    setPoints(existing?.boundary?.coordinates?.[0]?.slice(0, -1).map(toLatLng) || [])
  }
  const cancelTrace = () => { setMode('idle'); setPoints([]); setTargetPlotId('') }
  const undoPoint = () => setPoints((current) => current.slice(0, -1))
  const addPoint = (latlng) => setPoints((current) => [...current, latlng])
  const dragPoint = (index, latlng) => setPoints((current) => current.map((pt, i) => (i === index ? latlng : pt)))

  const saveBoundary = async () => {
    if (points.length < 3) return flash('Click at least 3 corners to define a plot boundary.', 'warning')
    try {
      setBusy(true)
      const ring = [...points.map(toLngLat), toLngLat(points[0])]
      const result = await adminRequest(`/api/admin/showgrounds/${ground.id}/plots/${encodeURIComponent(targetPlotId)}/boundary`, {
        method: 'PUT',
        body: JSON.stringify({ boundary: { type: 'Polygon', coordinates: [ring] } })
      })
      onGroundUpdated(result.showground)
      if (result.overlaps?.length) flash(`Boundary saved for plot ${targetPlotId}, but it overlaps plot(s) ${result.overlaps.join(', ')}. Correct the vertices before publishing.`, 'warning')
      else flash(`Boundary saved for plot ${targetPlotId}.`)
      cancelTrace()
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const clearBoundary = async (plotId) => {
    if (!window.confirm(`Remove the digitized boundary for plot ${plotId}? It will fall back to an approximate position until redrawn.`)) return
    try {
      setBusy(true)
      const result = await adminRequest(`/api/admin/showgrounds/${ground.id}/plots/${encodeURIComponent(plotId)}/boundary`, { method: 'PUT', body: JSON.stringify({ boundary: null }) })
      onGroundUpdated(result.showground)
      flash(`Boundary cleared for plot ${plotId}.`)
      if (mode === 'draw' && targetPlotId === plotId) cancelTrace()
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const readSitePlanFile = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 4 * 1024 * 1024) { flash('Choose a site-plan image under 4 MB.', 'warning'); event.target.value = ''; return }
    const reader = new FileReader()
    reader.onload = () => setSpDraft({
      imageUrl: String(reader.result),
      south: savedSitePlan?.bounds?.south ?? (ground.lat - 0.003),
      west: savedSitePlan?.bounds?.west ?? (ground.lng - 0.003),
      north: savedSitePlan?.bounds?.north ?? (ground.lat + 0.003),
      east: savedSitePlan?.bounds?.east ?? (ground.lng + 0.003),
      opacity: savedSitePlan?.opacity ?? 0.85
    })
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleCornerPick = (latlng) => {
    if (!pickCorner) return
    setSpDraft((current) => current && (pickCorner === 'sw'
      ? { ...current, south: latlng[0], west: latlng[1] }
      : { ...current, north: latlng[0], east: latlng[1] }))
    setPickCorner(null)
  }

  const saveSitePlan = async () => {
    if (!spDraft) return
    if (Number(spDraft.south) >= Number(spDraft.north) || Number(spDraft.west) >= Number(spDraft.east)) return flash('The south-west corner must sit below and to the left of the north-east corner.', 'warning')
    try {
      setBusy(true)
      const result = await adminRequest(`/api/admin/showgrounds/${ground.id}/site-plan`, {
        method: 'PUT',
        body: JSON.stringify({ imageUrl: spDraft.imageUrl, bounds: { south: Number(spDraft.south), west: Number(spDraft.west), north: Number(spDraft.north), east: Number(spDraft.east) }, opacity: Number(spDraft.opacity) })
      })
      onGroundUpdated(result.showground)
      setSpDraft(null)
      flash('Site-plan image aligned and saved. Trace each plot against it below.')
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const removeSitePlan = async () => {
    if (!window.confirm('Remove the uploaded site-plan image? Digitized plot boundaries are not affected.')) return
    try {
      setBusy(true)
      const result = await adminRequest(`/api/admin/showgrounds/${ground.id}/site-plan`, { method: 'DELETE' })
      onGroundUpdated(result.showground)
      flash('Site-plan image removed.')
    } catch (error) {
      flash(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const importGeoJson = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      let geojson
      try {
        geojson = JSON.parse(String(reader.result))
      } catch {
        flash('That file is not valid JSON/GeoJSON.', 'error')
        return
      }
      try {
        setBusy(true)
        const result = await adminRequest(`/api/admin/showgrounds/${ground.id}/geojson`, { method: 'POST', body: JSON.stringify({ geojson }) })
        onGroundUpdated(result.showground)
        setImportSummary(result)
        const overlapCount = Object.keys(result.overlaps || {}).length
        const tone = overlapCount || result.unmatched?.length ? 'warning' : 'info'
        flash(`Digitized ${result.matched.length} plot boundary(ies) from the file.${result.unmatched?.length ? ` ${result.unmatched.length} ID(s) did not match an existing plot.` : ''}${overlapCount ? ` ${overlapCount} plot(s) now overlap another.` : ''}`, tone)
      } catch (error) {
        flash(error.message, 'error')
      } finally {
        setBusy(false)
        if (geoInputRef.current) geoInputRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  const active = spDraft || savedSitePlan
  const activeBounds = active && (spDraft
    ? [[Number(spDraft.south), Number(spDraft.west)], [Number(spDraft.north), Number(spDraft.east)]]
    : [[savedSitePlan.bounds.south, savedSitePlan.bounds.west], [savedSitePlan.bounds.north, savedSitePlan.bounds.east]])

  return (
    <div className="boundary-editor">
      <div className="admin-panel boundary-sidebar">
        <div className="panel-heading"><div><span className="eyebrow">Digitize</span><h2>{ground.name}</h2></div></div>
        <p className="muted small">Trace each plot as a real polygon instead of a single point. Upload a base plan for reference, then click each plot's corners in order.</p>

        <div className="boundary-section">
          <strong className="section-label"><ImagePlus size={14} /> Site-plan image (optional guide)</strong>
          {!readOnly && !spDraft && <label className="file-picker small"><FileUp size={14} /> Upload image (PNG/JPG){' '}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={readSitePlanFile} disabled={busy} />
          </label>}
          {spDraft && !readOnly && (
            <div className="siteplan-align">
              <p className="muted small">Align the image by picking two known points on the base map (a road junction, gate, or survey beacon), or enter coordinates directly.</p>
              <div className="corner-pick-row">
                <button type="button" className={`btn tiny ${pickCorner === 'sw' ? 'active' : ''}`} onClick={() => setPickCorner(pickCorner === 'sw' ? null : 'sw')}><Crosshair size={13} /> Pick SW corner</button>
                <button type="button" className={`btn tiny ${pickCorner === 'ne' ? 'active' : ''}`} onClick={() => setPickCorner(pickCorner === 'ne' ? null : 'ne')}><Crosshair size={13} /> Pick NE corner</button>
              </div>
              <div className="admin-inline-fields">
                <label className="field">South<input type="number" step="0.00001" value={spDraft.south} onChange={(event) => setSpDraft({ ...spDraft, south: event.target.value })} /></label>
                <label className="field">West<input type="number" step="0.00001" value={spDraft.west} onChange={(event) => setSpDraft({ ...spDraft, west: event.target.value })} /></label>
                <label className="field">North<input type="number" step="0.00001" value={spDraft.north} onChange={(event) => setSpDraft({ ...spDraft, north: event.target.value })} /></label>
                <label className="field">East<input type="number" step="0.00001" value={spDraft.east} onChange={(event) => setSpDraft({ ...spDraft, east: event.target.value })} /></label>
              </div>
              <label className="field">Overlay opacity<input type="range" min="0.2" max="1" step="0.05" value={spDraft.opacity} onChange={(event) => setSpDraft({ ...spDraft, opacity: event.target.value })} /></label>
              <div className="panel-actions"><button type="button" className="btn secondary" onClick={() => setSpDraft(null)} disabled={busy}><X size={14} /> Discard</button><button type="button" className="btn" onClick={saveSitePlan} disabled={busy}><Save size={14} /> Save alignment</button></div>
            </div>
          )}
          {!spDraft && savedSitePlan && (
            <div className="siteplan-current">
              <img src={savedSitePlan.imageUrl} alt="Uploaded site plan" className="siteplan-thumb" />
              {!readOnly && <button type="button" className="btn secondary danger tiny" onClick={removeSitePlan} disabled={busy}><Trash2 size={13} /> Remove image</button>}
            </div>
          )}
          {!spDraft && !savedSitePlan && <p className="muted small">No site-plan image uploaded yet. The OpenStreetMap base layer can also be used as a tracing guide.</p>}
        </div>

        {!readOnly && (
          <div className="boundary-section">
            <strong className="section-label"><FileUp size={14} /> Import boundaries from GeoJSON</strong>
            <p className="muted small">Upload a GeoJSON file exported from GIS/CAD software. Each polygon's <code>id</code> property must match an existing plot ID exactly.</p>
            <label className="file-picker small"><FileUp size={14} /> Choose .geojson / .json file
              <input ref={geoInputRef} type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={importGeoJson} disabled={busy} />
            </label>
            {importSummary && (
              <div className="import-summary">
                <span className="ok"><Check size={13} /> {importSummary.matched.length} matched</span>
                {importSummary.unmatched?.length > 0 && <span className="warn"><AlertTriangle size={13} /> {importSummary.unmatched.length} unmatched: {importSummary.unmatched.join(', ')}</span>}
              </div>
            )}
          </div>
        )}

        <div className="boundary-section">
          <strong className="section-label"><MapPinned size={14} /> Plots ({digitized.length}/{plots.length} digitized)</strong>
          <div className="boundary-plot-list">
            {plots.map((plot) => (
              <div className={`boundary-plot-row ${plot.id === targetPlotId ? 'active' : ''}`} key={plot.id}>
                {plot.status === 'available' ? <CheckCircle2 className="status-icon available" size={15} /> : plot.status === 'reserved' ? <Clock3 className="status-icon reserved" size={15} /> : <XCircle className="status-icon taken" size={15} />}
                <div className="boundary-plot-meta"><strong>{plot.id}</strong><small>{plot.category} · {plot.boundary ? 'digitized' : 'approximate'}</small></div>
                {!readOnly && (
                  <div className="row-actions">
                    <button type="button" onClick={() => startTrace(plot.id)} disabled={busy || (mode === 'draw' && targetPlotId !== plot.id)} title={plot.boundary ? 'Edit vertices' : 'Draw boundary'}>
                      <Pencil size={13} /> {plot.boundary ? 'Edit' : 'Draw'}
                    </button>
                    {plot.boundary && <button type="button" className="reject" onClick={() => clearBoundary(plot.id)} disabled={busy}><Trash2 size={13} /></button>}
                  </div>
                )}
              </div>
            ))}
            {!plots.length && <div className="empty-card">This showground has no plots yet. Add plots first, then digitize their boundaries here.</div>}
          </div>
        </div>

        {mode === 'draw' && (
          <div className="boundary-section draw-controls">
            <strong className="section-label"><Pencil size={14} /> Tracing plot {targetPlotId}</strong>
            <p className="muted small">Click each corner of the plot in order on the map, then close the shape. Drag any marker to correct it.</p>
            <div className="panel-actions">
              <button type="button" className="btn secondary tiny" onClick={undoPoint} disabled={!points.length || busy}><Undo2 size={13} /> Undo point</button>
              <button type="button" className="btn secondary tiny" onClick={cancelTrace} disabled={busy}><X size={13} /> Cancel</button>
              <button type="button" className="btn tiny" onClick={saveBoundary} disabled={points.length < 3 || busy}><Save size={13} /> Save boundary</button>
            </div>
            <p className="muted small">{points.length} point{points.length === 1 ? '' : 's'} placed{points.length >= 3 ? ' · shape closes automatically on save' : ' · add at least 3'}</p>
            {overlapsNow.length > 0 && <div className="admin-notice warning"><AlertTriangle size={14} /> Overlaps plot(s): {overlapsNow.join(', ')}</div>}
          </div>
        )}
      </div>

      <div className="admin-panel boundary-map-wrap">
        <MapContainer center={[ground.lat, ground.lng]} zoom={18} className="boundary-map" scrollWheelZoom>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={21} />
          {activeBounds && <ImageOverlay url={active.imageUrl} bounds={activeBounds} opacity={Number(active.opacity ?? 0.85)} />}
          <FitToGround ground={ground} sitePlanBounds={activeBounds} />
          <MapClicks active={(mode === 'draw' || Boolean(pickCorner)) && !readOnly} onClick={pickCorner ? handleCornerPick : addPoint} />
          {digitized.filter((plot) => plot.id !== targetPlotId).map((plot) => {
            const paint = statusPaint[plot.status] || statusPaint.available
            const overlapping = overlapsNow.includes(plot.id)
            return (
              <Polygon
                key={plot.id}
                positions={plot.boundary.coordinates[0].slice(0, -1).map(toLatLng)}
                pathOptions={{ color: overlapping ? '#c0392b' : paint.stroke, fillColor: paint.fill, weight: overlapping ? 3 : 1, fillOpacity: 0.55, dashArray: overlapping ? '5 4' : null }}
              >
                <Popup><strong>Plot {plot.id}</strong><br />{plot.status}</Popup>
              </Polygon>
            )
          })}
          {points.length > 1 && <Polygon positions={points} pathOptions={{ color: overlapsNow.length ? '#c0392b' : '#2b4034', weight: 2, fillOpacity: 0.22 }} />}
          {mode === 'draw' && points.map((pt, index) => (
            <Marker
              key={index}
              position={pt}
              draggable={!readOnly}
              icon={vertexIcon()}
              eventHandlers={{
                dragend: (event) => dragPoint(index, [event.target.getLatLng().lat, event.target.getLatLng().lng]),
                click: (event) => L.DomEvent.stopPropagation(event)
              }}
            />
          ))}
        </MapContainer>
        <p className="site-map-caption">{mode === 'draw' ? 'Click the map to add a corner · drag a marker to adjust it' : pickCorner ? `Click the map to set the ${pickCorner === 'sw' ? 'south-west' : 'north-east'} corner` : 'Select a plot on the left to start tracing, or upload a site plan / GeoJSON above'}</p>
      </div>
    </div>
  )
}
