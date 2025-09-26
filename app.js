import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_URL, SUPABASE_KEY } from './config.js'

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// UI refs
const tbody = document.querySelector('#tbl tbody')
const status = document.getElementById('status')
const btnReload = document.getElementById('btnReload')
const btnToggleForm = document.getElementById('btnToggleForm')
const btnLogout = document.getElementById('btnLogout')
const userBadge = document.getElementById('userBadge')

const loginBox = document.getElementById('loginBox')
const emailI = document.getElementById('email')
const btnLogin = document.getElementById('btnLogin')
const loginMsg = document.getElementById('loginMsg')

const form = document.getElementById('form')
const saveMsg = document.getElementById('saveMsg')
const btnCancel = document.getElementById('btnCancel')

// form fields
const f = (id) => document.getElementById(id)
const fields = {
  job_number: f('job_number'),
  year: f('year'),
  name: f('name'),
  owner: f('owner'),
  jam_sent: f('jam_sent'),
  jam_confirmed: f('jam_confirmed'),
  material_orders: f('material_orders'),
  notes: f('notes'),
}

// colonne editabili e loro “tipo”
const COLS = [
  { key: 'job_number', type: 'text' },
  { key: 'year', type: 'number' },
  { key: 'name', type: 'text' },
  { key: 'jam_sent', type: 'date' },
  { key: 'jam_confirmed', type: 'date' },
  { key: 'notes', type: 'text' },
  { key: 'material_orders', type: 'date' },
  { key: 'owner', type: 'select', options: ['Piaser','Lazzarin','Reato','Mattiuzzo','Saccon','Savio'] },
]

function fmt(x){ return x ?? '' }
function fmtDate(d){ return d ?? '' }

// -------- READ
async function load() {
  status.textContent = 'Carico…'
  const { data, error } = await sb
    .from('projects')
    .select('id, job_number, year, name, jam_sent, jam_confirmed, notes, material_orders, owner, created_by, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    status.textContent = 'Errore: ' + error.message
    return
  }

  tbody.innerHTML = ''
  for (const r of data) {
    const tr = document.createElement('tr')
    tr.dataset.id = r.id
    tr.dataset.createdBy = r.created_by || ''
    tr.innerHTML = `
      <td data-col="job_number">${fmt(r.job_number)}</td>
      <td data-col="year">${fmt(r.year)}</td>
      <td data-col="name">${fmt(r.name)}</td>
      <td data-col="jam_sent">${fmtDate(r.jam_sent)}</td>
      <td data-col="jam_confirmed">${fmtDate(r.jam_confirmed)}</td>
      <td data-col="notes">${fmt(r.notes)}</td>
      <td data-col="material_orders">${fmtDate(r.material_orders)}</td>
      <td data-col="owner">${fmt(r.owner)}</td>
    `
    tbody.appendChild(tr)
  }
  status.textContent = `Righe: ${data.length}`
}

// -------- AUTH
btnLogin.onclick = async () => {
  const email = emailI.value
  const redirectTo = window.location.href   // sempre la pagina corrente
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo }
  })
  loginMsg.textContent = error ? ('Errore: ' + error.message) : 'Link inviato ✅ controlla la mail.'
}




btnLogout.onclick = async () => { await sb.auth.signOut() }

sb.auth.onAuthStateChange(async (_event, session) => {
  const logged = !!session?.user
  loginBox.classList.toggle('hidden', logged)
  btnToggleForm.classList.toggle('hidden', !logged)
  btnLogout.classList.toggle('hidden', !logged)
  userBadge.textContent = logged ? (session.user.email ?? 'utente') : ''
})

// -------- CREATE
btnToggleForm.onclick = () => { form.classList.toggle('hidden'); saveMsg.textContent = '' }
btnCancel.onclick = () => { form.classList.add('hidden'); saveMsg.textContent = ''; form.reset() }

form.onsubmit = async (e) => {
  e.preventDefault()
  const { data: u } = await sb.auth.getUser()
  const user = u?.user
  if (!user) { saveMsg.textContent = 'Devi essere loggato.'; return }

  const payload = {
    job_number: fields.job_number.value,
    year: parseInt(fields.year.value),
    name: fields.name.value,
    owner: fields.owner.value,
    jam_sent: fields.jam_sent.value || null,
    jam_confirmed: fields.jam_confirmed.value || null,
    material_orders: fields.material_orders.value || null,
    notes: fields.notes.value,
    created_by: user.id,
  }

  const { error } = await sb.from('projects').insert(payload)
  if (error) { saveMsg.textContent = 'Errore: ' + error.message }
  else { saveMsg.textContent = 'Salvato ✅'; form.reset(); form.classList.add('hidden'); load() }
}

// -------- INLINE EDIT
let editingCell = null

tbody.addEventListener('click', async (e) => {
  const td = e.target.closest('td')
  if (!td) return
  if (editingCell) return // una alla volta

  const tr = td.parentElement
  const id = tr.dataset.id
  const col = td.dataset.col
  if (!id || !col) return

  // Controllo permesso: puoi aggiornare solo se sei l'autore (policy RLS)
  const { data: u } = await sb.auth.getUser()
  const userId = u?.user?.id || null
  const createdBy = tr.dataset.createdBy || null
  if (!userId || userId !== createdBy) {
    status.textContent = 'Non puoi modificare questa riga (non sei il creatore).'
    return
  }

  // Trova meta colonna
  const meta = COLS.find(c => c.key === col)
  if (!meta) return

  // Crea editor
  const oldVal = td.textContent.trim()
  editingCell = td
  td.classList.add('editing')

  let input
  if (meta.type === 'select') {
    input = document.createElement('select')
    input.className = 'cell-input'
    input.innerHTML = `<option value=""></option>` + meta.options.map(o => `<option>${o}</option>`).join('')
    input.value = oldVal
  } else {
    input = document.createElement('input')
    input.className = 'cell-input'
    input.type = (meta.type === 'date' ? 'date' : (meta.type === 'number' ? 'number' : 'text'))
    input.value = oldVal
    if (meta.type === 'number') input.step = '1'
  }

  td.innerHTML = ''
  td.appendChild(input)
  input.focus()
  if (input.select) input.select()

  const commit = async () => {
    const newValRaw = input.value.trim()
    const newVal = (meta.type === 'date' && newValRaw === '') ? null : (meta.type === 'number' ? (newValRaw === '' ? null : Number(newValRaw)) : newValRaw)

    // Se non cambia, annulla
    if (String(newVal ?? '') === String(oldVal ?? '')) {
      td.textContent = oldVal
      td.classList.remove('editing')
      editingCell = null
      return
    }

    // UPDATE
    const patch = {}
    patch[col] = newVal
    patch.updated_at = new Date().toISOString()

    const { error } = await sb.from('projects').update(patch).eq('id', id)
    if (error) {
      status.textContent = 'Errore salvataggio: ' + error.message
      td.textContent = oldVal // rollback UI
    } else {
      // mostra valore formattato
      td.textContent = (meta.type === 'date') ? (newVal ?? '') : (newVal ?? '')
      status.textContent = 'Modifica salvata ✅'
    }
    td.classList.remove('editing')
    editingCell = null
  }

  const cancel = () => {
    td.textContent = oldVal
    td.classList.remove('editing')
    editingCell = null
  }

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); commit() }
    if (ev.key === 'Escape') { ev.preventDefault(); cancel() }
  })
  input.addEventListener('blur', commit)
})

// init
btnReload.addEventListener('click', load)
load()
