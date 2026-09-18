<script setup>
import { onMounted, ref } from 'vue'
import { apiUrl } from '../services/api'

const events = ref([])
const bookings = ref([])
const loading = ref(true)
const message = ref('')
const errorMessage = ref('')
const stats = ref({ totalUsers: 0, totalEvents: 0, totalBookings: 0, bookingsByEvent: [] })
const emptyEvent = () => ({ title: '', description: '', category: 'Technology', date: '', time: '', location: '', imageUrl: '', price: '', capacity: 30 })
const newEvent = ref(emptyEvent())
const editingId = ref(null)
const editingEvent = ref(emptyEvent())
const reminderLoadingId = ref(null)
const categories = ['Technology', 'Music', 'Networking', 'Business', 'Art & Culture', 'Community', 'Other']

function getToken() { return localStorage.getItem('token') }
function adminHeaders(json = false) {
  const headers = { Authorization: `Bearer ${getToken()}` }
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}
function fallbackImage() { return '/event-placeholder.svg' }
function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function formatBookedAt(value) {
  return value ? new Date(value).toLocaleString('en-GB') : ''
}

async function loadStats() {
  try {
    const response = await fetch(apiUrl('/api/admin/stats'), { headers: adminHeaders() })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Could not load statistics.')
    stats.value = data
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not connect to the server.'
  }
}

async function loadBookings() {
  try {
    const response = await fetch(apiUrl('/api/admin/bookings'), { headers: adminHeaders() })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Could not load booking details.')
    bookings.value = data
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not connect to the server.'
  }
}

async function loadEvents() {
  loading.value = true
  try {
    const response = await fetch(apiUrl('/api/events'))
    if (!response.ok) throw new Error('Failed to load events')
    events.value = await response.json()
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not load events.'
  } finally { loading.value = false }
}

async function refreshAdmin() {
  await Promise.all([loadEvents(), loadStats(), loadBookings()])
}

async function addEvent() {
  message.value = ''; errorMessage.value = ''
  try {
    const response = await fetch(apiUrl('/api/events'), { method: 'POST', headers: adminHeaders(true), body: JSON.stringify(newEvent.value) })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Could not create event.')
    message.value = data.message
    newEvent.value = emptyEvent()
    await refreshAdmin()
  } catch (error) { console.error(error); errorMessage.value = 'Could not connect to the server.' }
}

function startEdit(event) {
  editingId.value = event._id
  editingEvent.value = {
    title: event.title, description: event.description, category: event.category,
    date: event.date, time: event.time || '18:00', location: event.location,
    imageUrl: event.imageUrl || '', price: event.price, capacity: event.capacity,
  }
}
function cancelEdit() { editingId.value = null }

async function saveEdit(id) {
  message.value = ''; errorMessage.value = ''
  try {
    const response = await fetch(apiUrl(`/api/events/${id}`), { method: 'PUT', headers: adminHeaders(true), body: JSON.stringify(editingEvent.value) })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Could not update event.')
    message.value = data.message
    editingId.value = null
    await refreshAdmin()
  } catch (error) { console.error(error); errorMessage.value = 'Could not connect to the server.' }
}

async function deleteEvent(event) {
  if (!window.confirm(`Delete ${event.title}? Related bookings will also be removed.`)) return
  message.value = ''; errorMessage.value = ''
  try {
    const response = await fetch(apiUrl(`/api/events/${event._id}`), { method: 'DELETE', headers: adminHeaders() })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Could not delete event.')
    message.value = data.message
    await refreshAdmin()
  } catch (error) { console.error(error); errorMessage.value = 'Could not connect to the server.' }
}

async function sendReminder(event) {
  reminderLoadingId.value = event._id
  message.value = ''; errorMessage.value = ''
  try {
    const response = await fetch(apiUrl(`/api/admin/events/${event._id}/reminders`), { method: 'POST', headers: adminHeaders() })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Could not send reminders.')
    message.value = `${event.title}: ${data.message}`
  } catch (error) { console.error(error); errorMessage.value = 'Could not connect to the server.' }
  finally { reminderLoadingId.value = null }
}

onMounted(refreshAdmin)
</script>

<template>
  <main>
    <section class="page-intro">
      <span class="eyebrow">ADMINISTRATION</span>
      <h1>Admin Dashboard</h1>
      <p>Manage events, booking activity and email reminders.</p>
    </section>

    <section>
      <h2>Analytics</h2>
      <div class="stats">
        <div class="stat-card"><span>Total Users</span><strong>{{ stats.totalUsers }}</strong></div>
        <div class="stat-card"><span>Total Events</span><strong>{{ stats.totalEvents }}</strong></div>
        <div class="stat-card"><span>Total Bookings</span><strong>{{ stats.totalBookings }}</strong></div>
      </div>
      <h3>Bookings by Event</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Event</th><th>Bookings</th><th>Capacity</th><th>Availability</th></tr></thead>
          <tbody>
            <tr v-for="item in stats.bookingsByEvent" :key="item.eventId"><td>{{ item.title }}</td><td>{{ item.bookings }}</td><td>{{ item.capacity }}</td><td>{{ Math.max(item.capacity - item.bookings, 0) }} left</td></tr>
            <tr v-if="stats.bookingsByEvent.length === 0"><td colspan="4">No events yet.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Booking Details</h2>
      <p class="muted">Shows which registered users booked each event.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>User</th><th>Email</th><th>Event</th><th>Event Date</th><th>Booked At</th></tr></thead>
          <tbody>
            <tr v-for="booking in bookings" :key="booking._id">
              <td>{{ booking.userName }}</td>
              <td>{{ booking.userEmail }}</td>
              <td>{{ booking.eventTitle }}</td>
              <td>{{ formatDate(booking.eventDate) }} · {{ booking.eventTime }}</td>
              <td>{{ formatBookedAt(booking.bookedAt) }}</td>
            </tr>
            <tr v-if="bookings.length === 0"><td colspan="5">No bookings yet.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Manage Events</h2>
      <p v-if="message" class="message success">{{ message }}</p>
      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>

      <h3>Add New Event</h3>
      <form class="event-form" @submit.prevent="addEvent">
        <div class="form-field"><label>Title</label><input v-model="newEvent.title" type="text" required /></div>
        <div class="form-field"><label>Category</label><select v-model="newEvent.category"><option v-for="category in categories" :key="category">{{ category }}</option></select></div>
        <div class="form-field full"><label>Description</label><textarea v-model="newEvent.description" rows="3" required></textarea></div>
        <div class="form-field full"><label>Event Image URL (optional)</label><input v-model="newEvent.imageUrl" type="url" placeholder="https://example.com/event-photo.jpg" /><small>Paste a public image URL. A placeholder is shown if left blank.</small></div>
        <div class="form-field"><label>Date</label><input v-model="newEvent.date" type="date" required /></div>
        <div class="form-field"><label>Time</label><input v-model="newEvent.time" type="time" required /></div>
        <div class="form-field"><label>Location</label><input v-model="newEvent.location" type="text" required /></div>
        <div class="form-field"><label>Price (€)</label><input v-model="newEvent.price" type="number" min="0" step="0.01" required /></div>
        <div class="form-field"><label>Capacity</label><input v-model.number="newEvent.capacity" type="number" min="1" step="1" required /></div>
        <button type="submit">Add Event</button>
      </form>
    </section>

    <section>
      <h2>Existing Events</h2>
      <p v-if="loading" class="muted">Loading events...</p>
      <div class="admin-event-list">
        <article v-for="event in events" :key="event._id" class="admin-event-card">
          <div v-if="editingId === event._id" class="event-form edit-form">
            <div class="form-field"><label>Title</label><input v-model="editingEvent.title" type="text" /></div>
            <div class="form-field"><label>Category</label><select v-model="editingEvent.category"><option v-for="category in categories" :key="category">{{ category }}</option></select></div>
            <div class="form-field full"><label>Description</label><textarea v-model="editingEvent.description" rows="3"></textarea></div>
            <div class="form-field full"><label>Event Image URL</label><input v-model="editingEvent.imageUrl" type="url" /></div>
            <div class="form-field"><label>Date</label><input v-model="editingEvent.date" type="date" /></div>
            <div class="form-field"><label>Time</label><input v-model="editingEvent.time" type="time" /></div>
            <div class="form-field"><label>Location</label><input v-model="editingEvent.location" type="text" /></div>
            <div class="form-field"><label>Price (€)</label><input v-model="editingEvent.price" type="number" min="0" step="0.01" /></div>
            <div class="form-field"><label>Capacity</label><input v-model.number="editingEvent.capacity" type="number" min="1" step="1" /></div>
            <div class="full action-row"><button @click="saveEdit(event._id)">Save</button><button class="secondary" @click="cancelEdit">Cancel</button></div>
          </div>

          <div v-else class="admin-event-display">
            <img class="admin-event-thumb" :src="event.imageUrl || fallbackImage(event)" :alt="event.title" @error="$event.target.src = fallbackImage(event)" />
            <div class="admin-event-copy">
              <div class="card-topline"><span class="badge">{{ event.category }}</span><span :class="['availability', { sold: event.isSoldOut || event.isPast }]">{{ event.isPast ? 'Past event' : event.isSoldOut ? 'Sold out' : `${event.availablePlaces} / ${event.capacity} places left` }}</span></div>
              <h3>{{ event.title }}</h3>
              <p>{{ event.description }}</p>
              <p class="muted">{{ formatDate(event.date) }} · {{ event.time }} · {{ event.location }} · {{ event.price === 0 ? 'Free' : `€${event.price}` }}</p>
              <div class="action-row">
                <button @click="startEdit(event)">Edit</button>
                <button class="secondary" :disabled="reminderLoadingId === event._id || event.isPast" @click="sendReminder(event)">{{ reminderLoadingId === event._id ? 'Sending…' : 'Send Reminder' }}</button>
                <button class="danger" @click="deleteEvent(event)">Delete</button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>
