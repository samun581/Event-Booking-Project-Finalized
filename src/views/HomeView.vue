<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { apiUrl } from '../services/api'

const upcomingEvents = ref([])
const loading = ref(true)

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

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
  return `${available} places left`
}

onMounted(async () => {
  try {
    const response = await fetch(apiUrl('/api/events'))
    const events = await response.json()
    const today = new Date().toISOString().slice(0, 10)
    upcomingEvents.value = events.filter((event) => event.date >= today).slice(0, 6)
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main>
    <section class="hero">
      <div>
        <span class="eyebrow">DISCOVER BERLIN</span>
        <h1>Great events should be easy to find.</h1>
        <p>
          Browse public event listings before you register. Explore technology, music, business,
          networking, art and community events, check availability and book when you are ready.
        </p>
        <div class="hero-actions">
          <RouterLink class="button" to="/events">Explore Events</RouterLink>
          <RouterLink class="button secondary" to="/register">Create Free Account</RouterLink>
        </div>
      </div>
      <div class="hero-panel">
        <span class="hero-kicker">BERLIN EVENT HUB</span>
        <strong>Plan less. Experience more.</strong>
        <ul>
          <li>Public event discovery before login</li>
          <li>Live remaining-place information</li>
          <li>Maps and venue locations</li>
          <li>Booking confirmations and reminders</li>
        </ul>
      </div>
    </section>


    <section>
      <div class="section-heading">
        <div><span class="eyebrow">WHAT'S ON</span><h2>Upcoming Events</h2></div>
        <RouterLink to="/events">View all events →</RouterLink>
      </div>

      <p v-if="loading">Loading upcoming events...</p>
      <p v-else-if="upcomingEvents.length === 0" class="muted">No upcoming events have been added yet.</p>

      <div class="card-grid">
        <article v-for="event in upcomingEvents" :key="event._id" class="event-card compact image-card">
          <img class="event-image" :src="event.imageUrl || fallbackImage(event)" :alt="event.title" @error="$event.target.src = fallbackImage(event)" />
          <div class="event-card-body">
            <div class="card-topline">
              <span class="badge">{{ event.category }}</span>
              <span :class="['availability', { sold: event.isSoldOut }]">{{ availabilityText(event) }}</span>
            </div>
            <h3>{{ event.title }}</h3>
            <p class="muted">{{ formatDate(event.date) }} · {{ event.time || '18:00' }} · {{ event.location }}</p>
            <p>{{ event.description }}</p>
            <RouterLink class="text-link" :to="{ name: 'event-detail', params: { id: String(event._id) } }">View event →</RouterLink>
          </div>
        </article>
      </div>
    </section>

    <section class="cta-section">
      <div><span class="eyebrow">READY TO JOIN?</span><h2>Find an event that fits your week.</h2><p>Browsing is public. Create an account only when you want to book.</p></div>
      <RouterLink class="button" to="/events">Browse All Events</RouterLink>
    </section>
  </main>
</template>
