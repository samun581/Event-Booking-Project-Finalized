<script setup>
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { apiUrl } from '../services/api'

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const message = ref('')
const errorMessage = ref('')
const router = useRouter()

const checks = computed(() => ({
  length: password.value.length >= 8,
  upper: /[A-Z]/.test(password.value),
  lower: /[a-z]/.test(password.value),
  number: /[0-9]/.test(password.value),
  special: /[^A-Za-z0-9]/.test(password.value),
}))

const strongPassword = computed(() => Object.values(checks.value).every(Boolean))

async function register() {
  message.value = ''
  errorMessage.value = ''

  if (!strongPassword.value) {
    errorMessage.value = 'Please meet all password requirements.'
    return
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match.'
    return
  }

  try {
    const response = await fetch(apiUrl('/api/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.value, email: email.value, password: password.value }),
    })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Registration failed.')

    message.value = data.message
    setTimeout(() => router.push('/login'), 900)
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not connect to the server.'
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card">
      <span class="eyebrow">JOIN THE COMMUNITY</span>
      <h1>Create Account</h1>
      <p class="muted">Create your account to book events and manage everything from your dashboard.</p>

      <form @submit.prevent="register">
        <div class="form-field">
          <label for="name">Name</label>
          <input id="name" v-model="name" type="text" autocomplete="name" required />
        </div>
        <div class="form-field">
          <label for="email">Email</label>
          <input id="email" v-model="email" type="email" autocomplete="email" required />
        </div>
        <div class="form-field">
          <label for="password">Password</label>
          <input id="password" v-model="password" type="password" autocomplete="new-password" required />
          <div class="password-rules">
            <span :class="{ met: checks.length }">8+ characters</span>
            <span :class="{ met: checks.upper }">uppercase</span>
            <span :class="{ met: checks.lower }">lowercase</span>
            <span :class="{ met: checks.number }">number</span>
            <span :class="{ met: checks.special }">special character</span>
          </div>
        </div>
        <div class="form-field">
          <label for="confirmPassword">Confirm Password</label>
          <input id="confirmPassword" v-model="confirmPassword" type="password" autocomplete="new-password" required />
        </div>

        <p v-if="message" class="message success">{{ message }}</p>
        <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
        <button type="submit">Create Account</button>
      </form>

      <p class="auth-switch">Already registered? <RouterLink to="/login">Login here</RouterLink>.</p>
    </section>
  </main>
</template>
