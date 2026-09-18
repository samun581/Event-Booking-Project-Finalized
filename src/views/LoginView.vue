<script setup>
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { apiUrl } from '../services/api'

const email = ref('')
const password = ref('')
const errorMessage = ref('')
const router = useRouter()
const route = useRoute()

async function login() {
  errorMessage.value = ''
  try {
    const response = await fetch(apiUrl('/api/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value }),
    })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Login failed.')

    localStorage.setItem('token', data.token)
    localStorage.setItem('role', data.role)
    localStorage.setItem('name', data.name)

    if (route.query.redirect) router.push(String(route.query.redirect))
    else router.push(data.role === 'admin' ? '/admin' : '/dashboard')
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not connect to the server.'
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card">
      <span class="eyebrow">WELCOME BACK</span>
      <h1>Login</h1>
      <p v-if="route.query.reason === 'booking'" class="message info">Please log in or create an account to book an event.</p>
      <p class="muted">Sign in to manage your Berlin Event Hub bookings.</p>

      <form @submit.prevent="login">
        <div class="form-field"><label for="email">Email</label><input id="email" v-model="email" type="email" autocomplete="email" required /></div>
        <div class="form-field"><label for="password">Password</label><input id="password" v-model="password" type="password" autocomplete="current-password" required /></div>
        <div class="form-row-link"><RouterLink to="/forgot-password">Forgot password?</RouterLink></div>
        <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
        <button type="submit">Login</button>
      </form>

      <p class="auth-switch">No account yet? <RouterLink to="/register">Register here</RouterLink>.</p>
    </section>
  </main>
</template>
