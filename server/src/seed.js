import mongoose from 'mongoose'
import { config } from './config.js'
import { AdminUser, Showground } from './models.js'
import { passwordHash } from './auth.js'

const slots = [
  { offsetN: 6, offsetE: -34 },
  { offsetN: 6, offsetE: -27 },
  { offsetN: -12, offsetE: -34 },
  { offsetN: -12, offsetE: 0 }
]

const definitions = [
  { id: 'nairobi', county: 'Nairobi County', name: 'Jamhuri Park Showground', lat: -1.2921, lng: 36.7813, whatsappNumber: '0711000001', season: { startMonth: 7, endMonth: 9 }, plots: [['A-01', 'Trade avenue', '3x3m', 9000, 'available', 2, 'high'], ['A-02', 'Trade avenue', '3x3m', 9000, 'reserved', 2, 'high'], ['B-05', 'Exhibition hall', '6x6m', 18000, 'available', 4, 'high'], ['C-02', 'Livestock row', '9x9m', 26000, 'taken', 6, 'medium']] },
  { id: 'nyeri', county: 'Nyeri County', name: 'Nyeri Agricultural Showground', lat: -0.4201, lng: 36.9476, whatsappNumber: '0711000002', season: { startMonth: 6, endMonth: 8 }, plots: [['A-12', 'Trade avenue', '3x3m', 8000, 'available', 2, 'medium'], ['A-14', 'Trade avenue', '3x3m', 8000, 'reserved', 2, 'medium'], ['B-03', 'Open ground', '6x6m', 15000, 'available', 4, 'medium'], ['C-05', 'Livestock row', '9x9m', 22000, 'available', 6, 'low']] },
  { id: 'nakuru', county: 'Nakuru County', name: 'ASK Nakuru Showground', lat: -0.3031, lng: 36.08, whatsappNumber: '0711000003', season: { startMonth: 3, endMonth: 5 }, plots: [['A-01', 'Rift avenue', '3x3m', 10000, 'available', 2, 'high'], ['B-02', 'Rift avenue', '3x3m', 10000, 'available', 2, 'high'], ['C-01', 'Open ground', '6x6m', 19000, 'reserved', 4, 'high'], ['D-01', 'Livestock row', '9x9m', 28000, 'available', 6, 'high']] },
  { id: 'mombasa', county: 'Mombasa County', name: 'Mombasa Coast Showground', lat: -4.0435, lng: 39.6682, whatsappNumber: '0711000004', season: { startMonth: 11, endMonth: 1 }, plots: [['A-01', 'Beachfront row', '3x3m', 9500, 'available', 2, 'medium'], ['B-01', 'Open ground', '6x6m', 17000, 'available', 4, 'medium'], ['C-01', 'Trade hall', '6x6m', 17500, 'taken', 4, 'high'], ['D-01', 'Livestock row', '9x9m', 23000, 'available', 6, 'low']] },
  { id: 'kisumu', county: 'Kisumu County', name: 'Kisumu Showground', lat: -0.0917, lng: 34.768, whatsappNumber: '0711000005', season: { startMonth: 9, endMonth: 11 }, plots: [['A-01', 'Lakeside avenue', '3x3m', 8500, 'available', 2, 'medium'], ['B-01', 'Open ground', '6x6m', 15500, 'reserved', 4, 'medium'], ['C-01', 'Trade hall', '6x6m', 16000, 'available', 4, 'medium'], ['D-01', 'Livestock row', '9x9m', 21000, 'available', 6, 'low']] },
  { id: 'uasin-gishu', county: 'Uasin Gishu County', name: 'Eldoret Showground', lat: 0.5143, lng: 35.2698, whatsappNumber: '0711000006', season: { startMonth: 2, endMonth: 4 }, plots: [['A-01', 'Highland row', '3x3m', 8200, 'available', 2, 'medium'], ['B-01', 'Open ground', '6x6m', 15200, 'available', 4, 'medium'], ['C-01', 'Trade hall', '6x6m', 15800, 'available', 4, 'low'], ['D-01', 'Livestock row', '9x9m', 21500, 'taken', 6, 'medium']] }
]

// A ready-to-use manager account, in case creating one through the admin
// panel isn't working. Re-running `npm run seed` re-applies this account
// (including resetting its password to the value below), so it's always a
// working fallback you can sign in with at /admin.
const sampleManager = {
  email: 'manager@countyshowgrounds.test',
  name: 'Sample Showground Manager',
  password: 'ManagerDemo123!',
  showgroundIds: ['nyeri', 'kisumu']
}

await mongoose.connect(config.mongoUri)
for (const item of definitions) {
  const plots = item.plots.map((p, index) => ({ id: p[0], category: p[1], size: p[2], price: p[3], status: p[4], exhibitorsCapacity: p[5], traffic: p[6], ...slots[index] }))
  await Showground.findOneAndUpdate({ id: item.id }, { ...item, plots }, { upsert: true, new: true, setDefaultsOnInsert: true })
}
console.log(`Seeded ${definitions.length} showgrounds`)

const adminEmail = String(config.admin.email || '').trim().toLowerCase()
if (sampleManager.email.toLowerCase() === adminEmail) {
  console.log(`Skipped sample manager: ${sampleManager.email} matches ADMIN_EMAIL, which is reserved for the primary admin account.`)
} else {
  const validGroundIds = (await Showground.find({ id: { $in: sampleManager.showgroundIds } }).select('id').lean()).map((item) => item.id)
  await AdminUser.findOneAndUpdate(
    { email: sampleManager.email },
    {
      email: sampleManager.email,
      name: sampleManager.name,
      role: 'manager',
      showgroundIds: validGroundIds,
      passwordHash: await passwordHash(sampleManager.password)
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  console.log(`Seeded sample manager: ${sampleManager.email} / ${sampleManager.password} (assigned: ${validGroundIds.join(', ') || 'none'})`)
  console.log('Sign in at /admin with these credentials, or re-run "npm run seed" any time to restore this account.')
}

await mongoose.disconnect()
