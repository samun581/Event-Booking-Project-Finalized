<script setup>
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { apiUrl } from '../services/api'

const route = useRoute()
const newPassword = ref('')
const confirmPassword = ref('')
const message = ref('')
const errorMessage = ref('')

const checks = computed(() => ({
  length: newPassword.value.length >= 8,
  upper: /[A-Z]/.test(newPassword.value),
  lower: /[a-z]/.test(newPassword.value),
  number: /[0-9]/.test(newPassword.value),
  special: /[^A-Za-z0-9]/.test(newPassword.value),
}))
const strongPassword = computed(() => Object.values(checks.value).every(Boolean))

async function resetPassword() {
  message.value = ''
  errorMessage.value = ''
  if (!strongPassword.value) return (errorMessage.value = 'Please meet all password requirements.')
  if (newPassword.value !== confirmPassword.value) return (errorMessage.value = 'Passwords do not match.')

  try {
    const response = await fetch(apiUrl('/api/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(route.query.email || ''),
        token: String(route.query.token || ''),
        newPassword: newPassword.value,
      }),
    })
    const data = await response.json()
    if (!response.ok) return (errorMessage.value = data.message || 'Could not reset password.')
    message.value = data.message
    newPassword.value = ''
    confirmPassword.value = ''
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
      <h1>Set New Password</h1>
      <form @submit.prevent="resetPassword">
        <div class="form-field">
          <label for="newPassword">New Password</label>
          <input id="newPassword" v-model="newPassword" type="password" required />
          <div class="password-rules">
            <span :class="{ met: checks.length }">8+ characters</span>
            <span :class="{ met: checks.upper }">uppercase</span>
            <span :class="{ met: checks.lower }">lowercase</span>
            <span :class="{ met: checks.number }">number</span>
            <span :class="{ met: checks.special }">special character</span>
          </div>
        </div>
        <div class="form-field"><label for="confirmPassword">Confirm Password</label><input id="confirmPassword" v-model="confirmPassword" type="password" required /></div>
        <p v-if="message" class="message success">{{ message }} <RouterLink to="/login">Go to login</RouterLink>.</p>
        <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
        <button type="submit">Reset Password</button>
      </form>
    </section>
  </main>
</template>
