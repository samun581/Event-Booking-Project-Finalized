<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { apiUrl } from '../services/api'

const email = ref('')
const message = ref('')
const errorMessage = ref('')
const previewResetUrl = ref('')

async function requestReset() {
  message.value = ''
  errorMessage.value = ''
  previewResetUrl.value = ''

  try {
    const response = await fetch(apiUrl('/api/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value }),
    })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Could not process request.')
    message.value = data.message
    previewResetUrl.value = data.previewResetUrl || ''
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Could not connect to the server.'
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card">
      <span class="eyebrow">ACCOUNT RECOVERY</span>
      <h1>Forgot Password</h1>
      <p class="muted">Enter your registered email address. A password reset link is valid for 15 minutes.</p>
      <form @submit.prevent="requestReset">
        <div class="form-field"><label for="email">Email</label><input id="email" v-model="email" type="email" required /></div>
        <p v-if="message" class="message success">{{ message }}</p>
        <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
        <p v-if="previewResetUrl" class="message info">Development preview: <a :href="previewResetUrl">Open password reset link</a></p>
        <button type="submit">Send Reset Link</button>
      </form>
      <p class="auth-switch"><RouterLink to="/login">Back to login</RouterLink></p>
    </section>
  </main>
</template>
