const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

require('dotenv').config({
  path: path.join(__dirname, '.env'),
})

const express = require('express')
const cors = require('cors')
const { MongoClient, ObjectId } = require('mongodb')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const app = express()

const PORT = process.env.PORT || 3000
const mongoUrl = process.env.MONGO_URL
const JWT_SECRET = process.env.JWT_SECRET
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || ''
const FROM_EMAIL = process.env.FROM_EMAIL || ''
const APP_URL = process.env.APP_URL || 'http://localhost:5173'

if (!mongoUrl) throw new Error('MONGO_URL is missing from backend/.env')
if (!JWT_SECRET) throw new Error('JWT_SECRET is missing from backend/.env')

const client = new MongoClient(mongoUrl)

app.use(cors())
app.use(express.json({ limit: '1mb' }))

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ message: 'Access denied. No token provided.' })

  const token = authHeader.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Access denied. Invalid token.' })

  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token.' })
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' })
  next()
}

function passwordValidationMessage(password) {
  if (password.length < 8) return 'Password must be at least 8 characters long.'
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.'
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character.'
  return null
}

function cleanEventInput(body) {
  return {
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    category: String(body.category || '').trim(),
    date: String(body.date || '').trim(),
    time: String(body.time || '').trim(),
    location: String(body.location || '').trim(),
    imageUrl: String(body.imageUrl || '').trim(),
    price: Number(body.price),
    capacity: Number(body.capacity),
  }
}

function validateEvent(event) {
  if (
    !event.title || !event.description || !event.category || !event.date || !event.time || !event.location ||
    Number.isNaN(event.price) || Number.isNaN(event.capacity)
  ) {
    return 'Title, description, category, date, time, location, price and capacity are required.'
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time)) return 'Please enter a valid event time.'
  if (event.date < new Date().toISOString().slice(0, 10)) return 'Event date cannot be in the past.'
  if (event.imageUrl && !/^https?:\/\//i.test(event.imageUrl)) return 'Event image URL must start with http:// or https://.'
  if (event.price < 0) return 'Price cannot be negative.'
  if (!Number.isInteger(event.capacity) || event.capacity < 1) return 'Capacity must be a whole number greater than 0.'
  return null
}

async function eventWithAvailability(db, event) {
  const bookedCount = await db.collection('bookings').countDocuments({ eventId: event._id.toString() })
  const capacity = Number.isInteger(event.capacity) && event.capacity > 0 ? event.capacity : 50

  return {
    ...event,
    description: event.description || 'Event details will be announced soon.',
    category: event.category || 'Other',
    imageUrl: event.imageUrl || '',
    capacity,
    time: event.time || '18:00',
    bookedCount,
    availablePlaces: Math.max(capacity - bookedCount, 0),
    isSoldOut: bookedCount >= capacity,
    isPast: event.date < new Date().toISOString().slice(0, 10),
  }
}

async function sendEmail({ to, subject, text, html }) {
  if (!SENDGRID_API_KEY || !FROM_EMAIL) {
    console.log('\n--- EMAIL PREVIEW (SendGrid not configured) ---')
    console.log('To:', to)
    console.log('Subject:', subject)
    console.log(text)
    console.log('--- END EMAIL PREVIEW ---\n')
    return { sent: false, mode: 'preview' }
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: 'Berlin Event Hub' },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html || `<p>${text}</p>` },
      ],
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`SendGrid error ${response.status}: ${details}`)
  }

  return { sent: true, mode: 'sendgrid' }
}

async function startServer() {
  try {
    await client.connect()
    const db = client.db('berlin_event_hub')
    app.locals.db = db

    await db.collection('users').createIndex({ email: 1 }, { unique: true })
    await db.collection('bookings').createIndex({ userId: 1, eventId: 1 }, { unique: true })
    await db.collection('passwordResets').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

    console.log('Connected to MongoDB')

    app.get('/api/health', (req, res) => res.json({ message: 'Berlin Event Hub API is running' }))
    app.get('/', (req, res, next) => {
      const distPath = path.join(__dirname, '..', 'dist', 'index.html')
      if (fs.existsSync(distPath)) return next()
      return res.json({ message: 'Berlin Event Hub API is running' })
    })

    // EVENTS - PUBLIC LISTING
    app.get('/api/events', async (req, res) => {
      try {
        const events = await db.collection('events').find().sort({ date: 1 }).toArray()
        const enrichedEvents = []
        for (const event of events) enrichedEvents.push(await eventWithAvailability(db, event))
        res.json(enrichedEvents)
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Failed to fetch events.' })
      }
    })

    app.get('/api/events/:id', async (req, res) => {
      try {
        const { id } = req.params
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid event ID.' })
        const event = await db.collection('events').findOne({ _id: new ObjectId(id) })
        if (!event) return res.status(404).json({ message: 'Event not found.' })
        res.json(await eventWithAvailability(db, event))
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Failed to fetch event.' })
      }
    })

    app.post('/api/events', authenticateToken, requireAdmin, async (req, res) => {
      try {
        const event = cleanEventInput(req.body)
        const validationError = validateEvent(event)
        if (validationError) return res.status(400).json({ message: validationError })

        const result = await db.collection('events').insertOne({ ...event, createdAt: new Date() })
        res.status(201).json({ message: 'Event created successfully.', eventId: result.insertedId })
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not create event.' })
      }
    })

    app.put('/api/events/:id', authenticateToken, requireAdmin, async (req, res) => {
      try {
        const { id } = req.params
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid event ID.' })

        const event = cleanEventInput(req.body)
        const validationError = validateEvent(event)
        if (validationError) return res.status(400).json({ message: validationError })

        const bookedCount = await db.collection('bookings').countDocuments({ eventId: id })
        if (event.capacity < bookedCount) {
          return res.status(400).json({ message: `Capacity cannot be lower than the current ${bookedCount} booking(s).` })
        }

        const result = await db.collection('events').updateOne({ _id: new ObjectId(id) }, { $set: event })
        if (result.matchedCount === 0) return res.status(404).json({ message: 'Event not found.' })
        res.json({ message: 'Event updated successfully.' })
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not update event.' })
      }
    })

    app.delete('/api/events/:id', authenticateToken, requireAdmin, async (req, res) => {
      try {
        const { id } = req.params
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid event ID.' })

        const result = await db.collection('events').deleteOne({ _id: new ObjectId(id) })
        if (result.deletedCount === 0) return res.status(404).json({ message: 'Event not found.' })
        await db.collection('bookings').deleteMany({ eventId: id })
        res.json({ message: 'Event and related bookings deleted successfully.' })
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not delete event.' })
      }
    })

    // AUTHENTICATION
    app.post('/api/register', async (req, res) => {
      try {
        const name = String(req.body.name || '').trim()
        const email = String(req.body.email || '').trim().toLowerCase()
        const password = String(req.body.password || '')

        if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required.' })
        const passwordError = passwordValidationMessage(password)
        if (passwordError) return res.status(400).json({ message: passwordError })

        const usersCollection = db.collection('users')
        if (await usersCollection.findOne({ email })) return res.status(400).json({ message: 'A user with this email already exists.' })

        const hashedPassword = await bcrypt.hash(password, 10)
        const result = await usersCollection.insertOne({ name, email, password: hashedPassword, role: 'user', createdAt: new Date() })
        res.status(201).json({ message: 'Registration successful. You can now log in.', userId: result.insertedId })
      } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'A user with this email already exists.' })
        console.error(error)
        res.status(500).json({ message: 'Registration failed.' })
      }
    })

    app.post('/api/login', async (req, res) => {
      try {
        const email = String(req.body.email || '').trim().toLowerCase()
        const password = String(req.body.password || '')
        if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' })

        const user = await db.collection('users').findOne({ email })
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Invalid email or password.' })

        const token = jwt.sign({ userId: user._id.toString(), name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '2h' })
        res.json({ message: 'Login successful.', token, name: user.name, role: user.role })
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Login failed.' })
      }
    })

    // FORGOT / RESET PASSWORD
    app.post('/api/forgot-password', async (req, res) => {
      try {
        const email = String(req.body.email || '').trim().toLowerCase()
        if (!email) return res.status(400).json({ message: 'Email is required.' })

        const genericMessage = 'If an account exists for this email, password reset instructions have been prepared.'
        const user = await db.collection('users').findOne({ email })
        if (!user) return res.json({ message: genericMessage })

        const rawToken = crypto.randomBytes(32).toString('hex')
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

        await db.collection('passwordResets').deleteMany({ userId: user._id.toString() })
        await db.collection('passwordResets').insertOne({ userId: user._id.toString(), tokenHash, expiresAt, createdAt: new Date() })

        const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}`
        const emailResult = await sendEmail({
          to: email,
          subject: 'Reset your Berlin Event Hub password',
          text: `Reset your password using this link (valid for 15 minutes): ${resetUrl}`,
          html: `<h2>Reset your password</h2><p>This link is valid for 15 minutes.</p><p><a href="${resetUrl}">Reset password</a></p>`,
        })

        const response = { message: genericMessage, deliveryMode: emailResult.mode }
        if (emailResult.mode === 'preview' && process.env.NODE_ENV !== 'production') response.previewResetUrl = resetUrl
        res.json(response)
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not process the password reset request.' })
      }
    })

    app.post('/api/reset-password', async (req, res) => {
      try {
        const email = String(req.body.email || '').trim().toLowerCase()
        const token = String(req.body.token || '')
        const newPassword = String(req.body.newPassword || '')
        if (!email || !token || !newPassword) return res.status(400).json({ message: 'Email, reset token and new password are required.' })

        const passwordError = passwordValidationMessage(newPassword)
        if (passwordError) return res.status(400).json({ message: passwordError })

        const user = await db.collection('users').findOne({ email })
        if (!user) return res.status(400).json({ message: 'Invalid or expired password reset link.' })

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
        const resetRecord = await db.collection('passwordResets').findOne({
          userId: user._id.toString(),
          tokenHash,
          expiresAt: { $gt: new Date() },
        })
        if (!resetRecord) return res.status(400).json({ message: 'Invalid or expired password reset link.' })

        const hashedPassword = await bcrypt.hash(newPassword, 10)
        await db.collection('users').updateOne({ _id: user._id }, { $set: { password: hashedPassword, passwordChangedAt: new Date() } })
        await db.collection('passwordResets').deleteMany({ userId: user._id.toString() })
        res.json({ message: 'Password reset successfully. You can now log in.' })
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not reset password.' })
      }
    })

    // PROFILE
    app.get('/api/profile', authenticateToken, async (req, res) => {
      try {
        if (!ObjectId.isValid(req.user.userId)) return res.status(400).json({ message: 'Invalid user ID.' })
        const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) }, { projection: { password: 0 } })
        if (!user) return res.status(404).json({ message: 'User not found.' })
        res.json({ name: user.name, email: user.email, role: user.role })
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not load profile.' })
      }
    })

    app.put('/api/profile', authenticateToken, async (req, res) => {
      try {
        const name = String(req.body.name || '').trim()
        if (!name) return res.status(400).json({ message: 'Name is required.' })
        if (!ObjectId.isValid(req.user.userId)) return res.status(400).json({ message: 'Invalid user ID.' })

        const result = await db.collection('users').updateOne({ _id: new ObjectId(req.user.userId) }, { $set: { name } })
        if (result.matchedCount === 0) return res.status(404).json({ message: 'User not found.' })
        res.json({ message: 'Profile updated successfully.' })
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not update profile.' })
      }
    })

    app.put('/api/profile/password', authenticateToken, async (req, res) => {
      try {
        const currentPassword = String(req.body.currentPassword || '')
        const newPassword = String(req.body.newPassword || '')
        if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current password and new password are required.' })

        const passwordError = passwordValidationMessage(newPassword)
        if (passwordError) return res.status(400).json({ message: passwordError })
        if (!ObjectId.isValid(req.user.userId)) return res.status(400).json({ message: 'Invalid user ID.' })

        const usersCollection = db.collection('users')
        const user = await usersCollection.findOne({ _id: new ObjectId(req.user.userId) })
        if (!user) return res.status(404).json({ message: 'User not found.' })
        if (!(await bcrypt.compare(currentPassword, user.password))) return res.status(400).json({ message: 'Current password is incorrect.' })

        const hashedPassword = await bcrypt.hash(newPassword, 10)
        await usersCollection.updateOne({ _id: user._id }, { $set: { password: hashedPassword, passwordChangedAt: new Date() } })
        res.json({ message: 'Password changed successfully.' })
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not change password.' })
      }
    })

    // BOOKINGS
    app.post('/api/bookings', authenticateToken, async (req, res) => {
      try {
        const eventId = String(req.body.eventId || '')
        if (!ObjectId.isValid(eventId)) return res.status(400).json({ message: 'Invalid event ID.' })

        const event = await db.collection('events').findOne({ _id: new ObjectId(eventId) })
        if (!event) return res.status(404).json({ message: 'Event not found.' })
        if (event.date < new Date().toISOString().slice(0, 10)) return res.status(400).json({ message: 'This event has already taken place and cannot be booked.' })

        const bookingsCollection = db.collection('bookings')
        if (await bookingsCollection.findOne({ userId: req.user.userId, eventId })) return res.status(400).json({ message: 'You have already booked this event.' })

        const capacity = Number.isInteger(event.capacity) && event.capacity > 0 ? event.capacity : 50
        const bookedCount = await bookingsCollection.countDocuments({ eventId })
        if (bookedCount >= capacity) return res.status(400).json({ message: 'This event is sold out.' })

        const result = await bookingsCollection.insertOne({ userId: req.user.userId, eventId, bookedAt: new Date() })

        const user = ObjectId.isValid(req.user.userId) ? await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) }) : null
        let deliveryMode = 'not-attempted'
        if (user?.email) {
          try {
            const emailResult = await sendEmail({
              to: user.email,
              subject: `Booking confirmed: ${event.title}`,
              text: `Your booking for ${event.title} on ${event.date} at ${event.time || '18:00'} at ${event.location} is confirmed.`,
              html: `<h2>Booking confirmed</h2><p><strong>${event.title}</strong></p><p>Date: ${event.date}<br>Time: ${event.time || '18:00'}<br>Location: ${event.location}</p><p>We look forward to seeing you.</p>`,
            })
            deliveryMode = emailResult.mode
          } catch (emailError) {
            console.error('Booking confirmation email failed:', emailError.message)
            deliveryMode = 'failed'
          }
        }

        res.status(201).json({ message: 'Booking confirmed successfully.', bookingId: result.insertedId, notificationMode: deliveryMode })
      } catch (error) {
        if (error.code === 11000) return res.status(400).json({ message: 'You have already booked this event.' })
        console.error(error)
        res.status(500).json({ message: 'Booking failed.' })
      }
    })

    app.get('/api/bookings', authenticateToken, async (req, res) => {
      try {
        const bookings = await db.collection('bookings').find({ userId: req.user.userId }).sort({ bookedAt: -1 }).toArray()
        const bookingsWithEvents = []
        for (const booking of bookings) {
          if (!ObjectId.isValid(booking.eventId)) continue
          const event = await db.collection('events').findOne({ _id: new ObjectId(booking.eventId) })
          if (event) bookingsWithEvents.push({ ...booking, event: await eventWithAvailability(db, event) })
        }
        res.json(bookingsWithEvents)
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Failed to load bookings.' })
      }
    })

    app.delete('/api/bookings/:id', authenticateToken, async (req, res) => {
      try {
        const { id } = req.params
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid booking ID.' })
        const result = await db.collection('bookings').deleteOne({ _id: new ObjectId(id), userId: req.user.userId })
        if (result.deletedCount === 0) return res.status(404).json({ message: 'Booking not found.' })
        res.json({ message: 'Booking cancelled successfully.' })
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not cancel booking.' })
      }
    })

    // ADMIN ANALYTICS + REMINDERS
    app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
      try {
        const totalUsers = await db.collection('users').countDocuments()
        const totalEvents = await db.collection('events').countDocuments()
        const totalBookings = await db.collection('bookings').countDocuments()
        const events = await db.collection('events').find().sort({ date: 1 }).toArray()
        const bookingsByEvent = []

        for (const event of events) {
          const bookings = await db.collection('bookings').countDocuments({ eventId: event._id.toString() })
          bookingsByEvent.push({
            eventId: event._id,
            title: event.title,
            bookings,
            capacity: Number.isInteger(event.capacity) && event.capacity > 0 ? event.capacity : 50,
          })
        }
        res.json({ totalUsers, totalEvents, totalBookings, bookingsByEvent })
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not load admin statistics.' })
      }
    })

    app.get('/api/admin/bookings', authenticateToken, requireAdmin, async (req, res) => {
      try {
        const bookings = await db.collection('bookings').find().sort({ bookedAt: -1 }).toArray()
        const rows = []
        for (const booking of bookings) {
          const user = ObjectId.isValid(booking.userId)
            ? await db.collection('users').findOne({ _id: new ObjectId(booking.userId) }, { projection: { password: 0 } })
            : null
          const event = ObjectId.isValid(booking.eventId)
            ? await db.collection('events').findOne({ _id: new ObjectId(booking.eventId) })
            : null
          if (user && event) {
            rows.push({
              _id: booking._id,
              bookedAt: booking.bookedAt,
              userName: user.name,
              userEmail: user.email,
              eventTitle: event.title,
              eventDate: event.date,
              eventTime: event.time || '18:00',
            })
          }
        }
        res.json(rows)
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not load booking details.' })
      }
    })

    app.post('/api/admin/events/:id/reminders', authenticateToken, requireAdmin, async (req, res) => {
      try {
        const { id } = req.params
        if (!ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid event ID.' })

        const event = await db.collection('events').findOne({ _id: new ObjectId(id) })
        if (!event) return res.status(404).json({ message: 'Event not found.' })

        const bookings = await db.collection('bookings').find({ eventId: id }).toArray()
        if (bookings.length === 0) return res.json({ message: 'There are no booked users to remind yet.', sent: 0, previewed: 0, failed: 0 })

        let sent = 0
        let previewed = 0
        let failed = 0

        for (const booking of bookings) {
          if (!ObjectId.isValid(booking.userId)) continue
          const user = await db.collection('users').findOne({ _id: new ObjectId(booking.userId) })
          if (!user?.email) continue

          try {
            const result = await sendEmail({
              to: user.email,
              subject: `Reminder: ${event.title}`,
              text: `Reminder: You booked ${event.title} on ${event.date} at ${event.time || '18:00'} at ${event.location}. We look forward to seeing you.`,
              html: `<h2>Event reminder</h2><p>Hello ${user.name || 'there'},</p><p>This is a reminder for your booking:</p><p><strong>${event.title}</strong><br>Date: ${event.date}<br>Time: ${event.time || '18:00'}<br>Location: ${event.location}</p>`,
            })
            if (result.sent) sent += 1
            else previewed += 1
          } catch (emailError) {
            console.error('Reminder email failed:', emailError.message)
            failed += 1
          }
        }

        const modeText = SENDGRID_API_KEY && FROM_EMAIL ? `${sent} email reminder(s) sent.` : `${previewed} reminder preview(s) generated in the backend terminal. Configure SendGrid to send real emails.`
        res.json({ message: modeText, sent, previewed, failed })
      } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Could not send event reminders.' })
      }
    })

    // AUTOMATIC EVENT REMINDERS
    async function sendAutomaticReminders() {
      try {
        const now = new Date()
        const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)

        const events = await db.collection('events').find().toArray()

        for (const event of events) {
          const eventTime = new Date(`${event.date}T${event.time || '18:00'}:00`)

          if (eventTime <= now || eventTime > next24Hours) continue

          const bookings = await db.collection('bookings').find({
            eventId: event._id.toString(),
            reminderSentAt: { $exists: false },
          }).toArray()

          for (const booking of bookings) {
            if (!ObjectId.isValid(booking.userId)) continue

            const user = await db.collection('users').findOne({
              _id: new ObjectId(booking.userId),
            })

            if (!user?.email) continue

            try {
              const result = await sendEmail({
                to: user.email,
                subject: `Reminder: ${event.title}`,
                text: `Reminder: You booked ${event.title} on ${event.date} at ${event.time || '18:00'} at ${event.location}. We look forward to seeing you.`,
                html: `<h2>Event reminder</h2><p>Hello ${user.name || 'there'},</p><p>This is an automatic reminder for your booking:</p><p><strong>${event.title}</strong><br>Date: ${event.date}<br>Time: ${event.time || '18:00'}<br>Location: ${event.location}</p>`,
              })

              if (result.sent) {
                await db.collection('bookings').updateOne(
                  { _id: booking._id },
                  { $set: { reminderSentAt: new Date() } }
                )

                console.log(`Automatic reminder sent to ${user.email} for ${event.title}`)
              }
            } catch (emailError) {
              console.error('Automatic reminder email failed:', emailError.message)
            }
          }
        }
      } catch (error) {
        console.error('Automatic reminder check failed:', error)
      }
    }

    // Check immediately when the backend starts,
    // then check again once every minute.
    sendAutomaticReminders()
    setInterval(sendAutomaticReminders, 60 * 1000)

    // PRODUCTION FRONTEND
    const distPath = path.join(__dirname, '..', 'dist')
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath))
      app.use((req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(distPath, 'index.html'))
        next()
      })
    }

    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
  } catch (error) {
    console.error('Database connection failed:', error)
  }
}

startServer()