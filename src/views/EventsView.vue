<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { apiUrl } from '../services/api'

const router = useRouter()
const searchTerm = ref('')
const categoryFilter = ref('All')
const locationFilter = ref('')
const dateFilter = ref('')
const events = ref([])
const loading = ref(true)
const errorMessage = ref('')
const successMessage = ref('')

const categories = computed(() => ['All', ...new Set(events.value.map((event) => event.category || 'Other'))])

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatTime(time) { return time || '18:00' }

function fallbackImage() {
  return '/event-placeholder.svg'
}

function availabilityText(event) {
  if (event.isPast) return 'Past event'
  if (event.isSoldOut) return 'Sold out'
  const capacityValue = Number(event.capacity)
  const capacity = Number.isInteger(capacityValue) && capacityValue > 0 ? capacityValue : 50
  const availableValue = Number(event.availablePlaces)
  const bookedValue = Number(event.bookedCount)
  const available = Number.isFinite(availableValue)
    ? Math.max(availableValue, 0)
    : Math.max(capacity - (Number.isFinite(bookedValue) ? bookedValue : 0), 0)
  return `${available} of ${capacity} places left`
}

function showSuccess(message) {
  successMessage.value = message
  window.setTimeout(() => {
    if (successMessage.value === message) successMessage.value = ''
  }, 4500)
}

async function getCoordinates(location) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`)
    const data = await response.json()
    if (!data.length) return null
    return { lat: data[0].lat, lon: data[0].lon }
  } catch (error) {
    console.error(error)
    return null
  }
}

async function loadEvents() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await fetch(apiUrl('/api/events'))
    if (!response.ok) throw new Error('Failed to load events')
    const eventData = await response.json()

    for (const event of eventData) {
      const coordinates = await getCoordinates(event.location)
      if (coordinates) Object.assign(event, coordinates)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    events.value = eventData
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not load events.'
  } finally {
    loading.value = false
  }
}

async function bookEvent(event) {
  successMessage.value = ''
  errorMessage.value = ''
  const token = localStorage.getItem('token')

  if (!token) {
    router.push({ path: '/login', query: { reason: 'booking', redirect: '/events' } })
    return
  }

  try {
    const response = await fetch(apiUrl('/api/bookings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventId: event._id }),
    })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Booking failed.')

    showSuccess(`Booking confirmed for ${event.title}. You can view it in your Dashboard.${data.notificationMode === 'sendgrid' ? ' A confirmation email was sent.' : ''}`)
    await loadEvents()
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not connect to the server.'
  }
}

function clearFilters() {
  searchTerm.value = ''
  categoryFilter.value = 'All'
  locationFilter.value = ''
  dateFilter.value = ''
}

function openMap(event) {
  if (!event.lat || !event.lon) return
  window.open(`https://www.openstreetmap.org/?mlat=${event.lat}&mlon=${event.lon}#map=16/${event.lat}/${event.lon}`, '_blank')
}

function getMapEmbedUrl(event) {
  if (!event.lat || !event.lon) return ''
  const lat = Number(event.lat)
  const lon = Number(event.lon)
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.01}%2C${lat - 0.006}%2C${lon + 0.01}%2C${lat + 0.006}&layer=mapnik&marker=${lat}%2C${lon}`
}

const filteredEvents = computed(() => {
  const search = searchTerm.value.trim().toLowerCase()
  const location = locationFilter.value.trim().toLowerCase()
  return events.value.filter((event) => {
    const matchesSearch = !search || event.title.toLowerCase().includes(search) || event.description.toLowerCase().includes(search)
    const matchesCategory = categoryFilter.value === 'All' || event.category === categoryFilter.value
    const matchesLocation = !location || event.location.toLowerCase().includes(location)
    const matchesDate = !dateFilter.value || event.date === dateFilter.value
    return matchesSearch && matchesCategory && matchesLocation && matchesDate
  })
})

onMounted(loadEvents)
</script>

<template>
  <main>
    <section class="page-intro">
      <span class="eyebrow">DISCOVER BERLIN</span>
      <h1>Find your next event</h1>
      <p>Browse publicly, compare events, check live availability and create an account only when you are ready to book.</p>
    </section>

    <section class="filters">
      <div class="filter-field wide"><label for="search">Search</label><input id="search" v-model="searchTerm" type="text" placeholder="Search title or description" /></div>
      <div class="filter-field"><label for="category">Category</label><select id="category" v-model="categoryFilter"><option v-for="category in categories" :key="category" :value="category">{{ category }}</option></select></div>
      <div class="filter-field"><label for="location">Location</label><input id="location" v-model="locationFilter" type="text" placeholder="e.g. Mitte" /></div>
      <div class="filter-field"><label for="date">Date</label><input id="date" v-model="dateFilter" type="date" /></div>
      <button class="button secondary filter-clear" @click="clearFilters">Clear</button>
    </section>

    <p v-if="successMessage" class="message success booking-toast" aria-live="polite">{{ successMessage }}</p>
    <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
    <p v-if="loading" class="muted">Loading events and map locations...</p>
    <p v-else-if="filteredEvents.length === 0" class="empty-state">No events match your filters.</p>

    <div class="event-list">
      <article v-for="event in filteredEvents" :key="event._id" class="event-card event-detail-card">
        <img class="event-image event-image-large" :src="event.imageUrl || fallbackImage(event)" :alt="event.title" @error="$event.target.src = fallbackImage(event)" />
        <div class="event-card-body">
          <div class="card-topline">
            <span class="badge">{{ event.category }}</span>
            <span :class="['availability', { sold: event.isSoldOut || event.isPast }]">{{ availabilityText(event) }}</span>
          </div>

          <h2>{{ event.title }}</h2>
          <p>{{ event.description }}</p>

          <div class="event-meta">
            <span><strong>Date:</strong> {{ formatDate(event.date) }}</span>
            <span><strong>Time:</strong> {{ formatTime(event.time) }}</span>
            <span><strong>Location:</strong> {{ event.location }}</span>
            <span><strong>Price:</strong> {{ event.price === 0 ? 'Free' : `€${event.price}` }}</span>
          </div>

          <div class="event-actions">
            <RouterLink class="button secondary" :to="{ name: 'event-detail', params: { id: String(event._id) } }">View Details</RouterLink>
            <button :disabled="event.isSoldOut || event.isPast" @click="bookEvent(event)">{{ event.isPast ? 'Event Finished' : event.isSoldOut ? 'Sold Out' : 'Book Event' }}</button>
            <button v-if="event.lat && event.lon" class="secondary" @click="openMap(event)">View on Map</button>
          </div>

          <iframe v-if="event.lat && event.lon" :src="getMapEmbedUrl(event)" height="250" title="Event location map" loading="lazy"></iframe>
          <p v-else class="muted">Map location unavailable.</p>
        </div>
      </article>
    </div>
  </main>
</template>
