<script setup>
import { computed, onMounted, ref } from 'vue'
import { apiUrl } from '../services/api'

const bookings = ref([])
const loading = ref(true)
const errorMessage = ref('')
const bookingMessage = ref('')
const profile = ref({ name: '', email: '', role: '' })
const profileMessage = ref('')
const profileError = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const passwordMessage = ref('')
const passwordError = ref('')

const passwordChecks = computed(() => ({
  length: newPassword.value.length >= 8,
  upper: /[A-Z]/.test(newPassword.value),
  lower: /[a-z]/.test(newPassword.value),
  number: /[0-9]/.test(newPassword.value),
  special: /[^A-Za-z0-9]/.test(newPassword.value),
}))

function tokenHeaders(json = false) {
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` }
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fallbackImage() {
  return '/event-placeholder.svg'
}

async function loadProfile() {
  profileError.value = ''
  try {
    const response = await fetch(apiUrl('/api/profile'), { headers: tokenHeaders() })
    const data = await response.json()
    if (!response.ok) return (profileError.value = data.message || 'Could not load profile.')
    profile.value = data
  } catch (error) { console.error(error); profileError.value = 'Could not connect to the server.' }
}

async function updateProfile() {
  profileMessage.value = ''; profileError.value = ''
  try {
    const response = await fetch(apiUrl('/api/profile'), { method: 'PUT', headers: tokenHeaders(true), body: JSON.stringify({ name: profile.value.name }) })
    const data = await response.json()
    if (!response.ok) return (profileError.value = data.message || 'Could not update profile.')
    profileMessage.value = data.message
    localStorage.setItem('name', profile.value.name)
  } catch (error) { console.error(error); profileError.value = 'Could not connect to the server.' }
}

async function changePassword() {
  passwordMessage.value = ''; passwordError.value = ''
  try {
    const response = await fetch(apiUrl('/api/profile/password'), {
      method: 'PUT', headers: tokenHeaders(true),
      body: JSON.stringify({ currentPassword: currentPassword.value, newPassword: newPassword.value }),
    })
    const data = await response.json()
    if (!response.ok) return (passwordError.value = data.message || 'Could not change password.')
    passwordMessage.value = data.message
    currentPassword.value = ''; newPassword.value = ''
  } catch (error) { console.error(error); passwordError.value = 'Could not connect to the server.' }
}

async function loadBookings() {
  loading.value = true; errorMessage.value = ''
  try {
    const response = await fetch(apiUrl('/api/bookings'), { headers: tokenHeaders() })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Could not load bookings.')
    bookings.value = data
  } catch (error) { console.error(error); errorMessage.value = 'Could not connect to the server.' }
  finally { loading.value = false }
}

async function cancelBooking(booking) {
  if (!window.confirm(`Cancel your booking for ${booking.event.title}?`)) return
  bookingMessage.value = ''; errorMessage.value = ''
  try {
    const response = await fetch(apiUrl(`/api/bookings/${booking._id}`), { method: 'DELETE', headers: tokenHeaders() })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Could not cancel booking.')
    bookingMessage.value = `${data.message} The event place is available again.`
    window.setTimeout(() => { bookingMessage.value = '' }, 4500)
    await loadBookings()
  } catch (error) { console.error(error); errorMessage.value = 'Could not connect to the server.' }
}

onMounted(() => { loadProfile(); loadBookings() })
</script>

<template>
  <main>
    <section class="page-intro">
      <span class="eyebrow">YOUR ACCOUNT</span>
      <h1>User Dashboard</h1>
      <p>Manage your profile, password security and event bookings.</p>
    </section>

    <div class="dashboard-grid">
      <section>
        <h2>My Profile</h2>
        <p v-if="profileError" class="message error">{{ profileError }}</p>
        <p v-if="profileMessage" class="message success">{{ profileMessage }}</p>
        <div class="form-field"><label for="name">Name</label><input id="name" v-model="profile.name" type="text" /></div>
        <div class="form-field"><label for="email">Email</label><input id="email" :value="profile.email" type="email" disabled /></div>
        <div class="form-field"><label for="role">Role</label><input id="role" :value="profile.role" type="text" disabled /></div>
        <button @click="updateProfile">Update Profile</button>
      </section>

      <section>
        <h2>Change Password</h2>
        <p v-if="passwordMessage" class="message success">{{ passwordMessage }}</p>
        <p v-if="passwordError" class="message error">{{ passwordError }}</p>
        <div class="form-field"><label for="currentPassword">Current Password</label><input id="currentPassword" v-model="currentPassword" type="password" /></div>
        <div class="form-field">
          <label for="newPassword">New Password</label><input id="newPassword" v-model="newPassword" type="password" />
          <div class="password-rules">
            <span :class="{ met: passwordChecks.length }">8+ characters</span><span :class="{ met: passwordChecks.upper }">uppercase</span><span :class="{ met: passwordChecks.lower }">lowercase</span><span :class="{ met: passwordChecks.number }">number</span><span :class="{ met: passwordChecks.special }">special character</span>
          </div>
        </div>
        <button @click="changePassword">Change Password</button>
      </section>
    </div>

    <section>
      <div class="section-heading"><div><span class="eyebrow">BOOKING HISTORY</span><h2>My Bookings</h2></div></div>
      <p class="muted">When email notifications are configured, you receive a confirmation after booking and administrators can send event reminders.</p>
      <p v-if="bookingMessage" class="message success booking-toast" aria-live="polite">{{ bookingMessage }}</p>
      <p v-if="loading" class="muted">Loading bookings...</p>
      <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
      <p v-if="!loading && !errorMessage && bookings.length === 0" class="empty-state">You have no bookings yet.</p>

      <div class="booking-grid">
        <article v-for="booking in bookings" :key="booking._id" class="booking-card image-card">
          <img class="event-image booking-image" :src="booking.event.imageUrl || fallbackImage(booking.event)" :alt="booking.event.title" @error="$event.target.src = fallbackImage(booking.event)" />
          <div class="event-card-body">
            <span class="badge">{{ booking.event.category }}</span>
            <h3>{{ booking.event.title }}</h3>
            <p><strong>Date:</strong> {{ formatDate(booking.event.date) }}</p>
            <p><strong>Location:</strong> {{ booking.event.location }}</p>
            <p><strong>Price:</strong> {{ booking.event.price === 0 ? 'Free' : `€${booking.event.price}` }}</p>
            <p class="muted">Booked {{ new Date(booking.bookedAt).toLocaleString('en-GB') }}</p>
            <button class="danger" @click="cancelBooking(booking)">Cancel Booking</button>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>
