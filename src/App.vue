<script setup>
import { ref } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'

const router = useRouter()
const isLoggedIn = ref(false)
const role = ref(null)
const name = ref('')

function updateAuthState() {
  isLoggedIn.value = !!localStorage.getItem('token')
  role.value = localStorage.getItem('role')
  name.value = localStorage.getItem('name') || ''
}

updateAuthState()
router.afterEach(updateAuthState)

function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('role')
  localStorage.removeItem('name')
  updateAuthState()
  router.push('/login')
}
</script>

<template>
  <header class="site-header">
    <div class="header-inner">
      <RouterLink class="brand" to="/">
        <span class="brand-mark">BE</span>
        <span>
          <strong>Berlin Event Hub</strong>
          <small>Discover. Book. Enjoy.</small>
        </span>
      </RouterLink>

      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/events">Events</RouterLink>
        <RouterLink to="/about">About</RouterLink>
        <RouterLink v-if="isLoggedIn && role === 'user'" to="/dashboard">Dashboard</RouterLink>
        <RouterLink v-if="isLoggedIn && role === 'admin'" to="/admin">Admin</RouterLink>
        <RouterLink v-if="!isLoggedIn" to="/login">Login</RouterLink>
        <RouterLink v-if="!isLoggedIn" class="nav-cta" to="/register">Register</RouterLink>
        <span v-if="isLoggedIn && name" class="welcome-name">Hi, {{ name }}</span>
        <button v-if="isLoggedIn" class="button secondary small" @click="logout">Logout</button>
      </nav>
    </div>
  </header>

  <RouterView />

  <footer class="site-footer">
    <p>Berlin Event Hub · Full-stack event booking application</p>
  </footer>
</template>
