// Last-resort CLI for managing showground-manager accounts directly in the
// database, bypassing the admin web UI and HTTP API entirely. Useful if the
// UI is down, the admin account is locked out, or you're scripting setup.
//
// Applies the exact same rules the API enforces (valid email, 8+ character
// password, at least one real showground, and the primary admin's email is
// reserved) so accounts created this way behave identically to ones created
// through the UI.
//
// Usage (run from server/):
//   node src/manageManagers.js list
//   node src/manageManagers.js add    --name "Jane Doe" --email jane@example.com --password "Secret123" --showgrounds kisumu,mombasa
//   node src/manageManagers.js update --email jane@example.com --showgrounds kisumu --password "NewSecret123"
//   node src/manageManagers.js remove --email jane@example.com
//
// Or via npm: npm run manager -- add --name "Jane Doe" --email jane@example.com --password "Secret123" --showgrounds kisumu

import mongoose from 'mongoose'
import { config } from './config.js'
import { AdminUser, AdminSession, Showground } from './models.js'
import { passwordHash } from './auth.js'

const managerEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const cleanEmail = (value = '') => String(value).trim().toLowerCase()

function parseArgs(argv) {
  const [command, ...rest] = argv
  const flags = {}
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = rest[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i += 1
    }
  }
  return { command, flags }
}

function fail(message) {
  console.error(`\nError: ${message}\n`)
  process.exitCode = 1
}

function printManager(manager) {
  const ids = Array.isArray(manager.showgroundIds) ? manager.showgroundIds : []
  console.log(`- ${manager.name} <${manager.email}> [${manager._id}]`)
  console.log(`  showgrounds: ${ids.length ? ids.join(', ') : '(none)'}`)
}

async function listManagers() {
  const managers = await AdminUser.find({ role: 'manager', email: { $ne: cleanEmail(config.admin.email) } }).sort({ name: 1 }).lean()
  if (!managers.length) {
    console.log('No manager accounts exist yet.')
    return
  }
  console.log(`${managers.length} manager account(s):`)
  managers.forEach(printManager)
}

async function resolveShowgroundIds(rawList) {
  const ids = [...new Set(String(rawList || '').split(',').map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) throw new Error('Provide at least one showground with --showgrounds id1,id2 (see: npm run manager -- list-showgrounds).')
  const found = await Showground.find({ id: { $in: ids } }).select('id').lean()
  const foundIds = new Set(found.map((item) => item.id))
  const missing = ids.filter((id) => !foundIds.has(id))
  if (missing.length) throw new Error(`These showground IDs do not exist: ${missing.join(', ')}. Run "npm run manager -- list-showgrounds" to see valid IDs.`)
  return ids
}

async function listShowgrounds() {
  const grounds = await Showground.find({}).select('id name county').sort({ county: 1 }).lean()
  if (!grounds.length) {
    console.log('No showgrounds exist yet. Create one in the admin UI or via seed.js first.')
    return
  }
  console.log(`${grounds.length} showground(s):`)
  grounds.forEach((ground) => console.log(`- ${ground.id}  (${ground.name}, ${ground.county})`))
}

async function addManager(flags) {
  const name = String(flags.name || '').trim()
  const email = cleanEmail(flags.email)
  const password = String(flags.password || '')
  if (!name) throw new Error('--name is required.')
  if (!managerEmailPattern.test(email)) throw new Error('--email must be a valid email address.')
  if (password.length < 8) throw new Error('--password must be at least 8 characters.')
  if (email === cleanEmail(config.admin.email)) throw new Error('That email is reserved for the primary admin login. Use a different email.')
  const showgroundIds = await resolveShowgroundIds(flags.showgrounds)
  if (await AdminUser.exists({ email })) throw new Error(`An account with email ${email} already exists. Use "update" instead.`)
  const manager = await AdminUser.create({ email, name, passwordHash: await passwordHash(password), role: 'manager', showgroundIds })
  console.log(`Created manager account:`)
  printManager(manager)
}

async function updateManager(flags) {
  const email = cleanEmail(flags.email)
  if (!managerEmailPattern.test(email)) throw new Error('--email must be a valid email address to identify the manager to update.')
  const manager = await AdminUser.findOne({ email, role: 'manager' })
  if (!manager) throw new Error(`No manager account found with email ${email}.`)
  if (flags.name) manager.name = String(flags.name).trim()
  if (flags.showgrounds) manager.showgroundIds = await resolveShowgroundIds(flags.showgrounds)
  if (flags.password) {
    const password = String(flags.password)
    if (password.length < 8) throw new Error('--password must be at least 8 characters.')
    manager.passwordHash = await passwordHash(password)
    await AdminSession.deleteMany({ adminId: manager._id })
  }
  await manager.save()
  console.log('Updated manager account:')
  printManager(manager)
}

async function removeManager(flags) {
  const email = cleanEmail(flags.email)
  if (!managerEmailPattern.test(email)) throw new Error('--email must be a valid email address to identify the manager to remove.')
  const manager = await AdminUser.findOneAndDelete({ email, role: 'manager' })
  if (!manager) throw new Error(`No manager account found with email ${email}.`)
  await AdminSession.deleteMany({ adminId: manager._id })
  console.log(`Removed manager account for ${manager.name} <${manager.email}>.`)
}

function printUsage() {
  console.log(`
Usage: node src/manageManagers.js <command> [--flags]

Commands:
  list                                   List all manager accounts
  list-showgrounds                       List showground IDs you can assign
  add --name --email --password --showgrounds
                                          Create a manager account
  update --email [--name] [--password] [--showgrounds]
                                          Update an existing manager account
  remove --email                         Delete a manager account

Examples:
  node src/manageManagers.js list
  node src/manageManagers.js add --name "Jane Doe" --email jane@example.com --password "Secret123" --showgrounds kisumu,mombasa
  node src/manageManagers.js update --email jane@example.com --showgrounds kisumu
  node src/manageManagers.js remove --email jane@example.com
`)
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2))
  const validCommands = ['list', 'list-showgrounds', 'add', 'update', 'remove']
  if (!command || flags.help || flags.h || command === '--help' || command === '-h' || !validCommands.includes(command)) {
    if (command && !validCommands.includes(command) && command !== '--help' && command !== '-h') fail(`Unknown command "${command}".`)
    printUsage()
    return
  }
  await mongoose.connect(config.mongoUri)
  try {
    if (command === 'list') await listManagers()
    else if (command === 'list-showgrounds') await listShowgrounds()
    else if (command === 'add') await addManager(flags)
    else if (command === 'update') await updateManager(flags)
    else if (command === 'remove') await removeManager(flags)
  } catch (error) {
    fail(error.message)
  } finally {
    await mongoose.disconnect()
  }
}

main()
