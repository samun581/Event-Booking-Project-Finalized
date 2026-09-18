# Berlin Event Hub

Berlin Event Hub is a full-stack event discovery and booking application developed for the **M607 Computer Science Application Lab**.

## Requirements

Install these before the first run:

- **Node.js 22 LTS** (22.18.0 or newer 22.x recommended)
- **npm** (included with Node.js)
- **MongoDB Community Server 8.0**
- **MongoDB Shell (`mongosh`)**
- A modern browser

Check the installations:

```bash
node -v
npm -v
mongosh --version
```

## 1. Start MongoDB

MongoDB must be running before the project starts.

**macOS (Homebrew):**

```bash
brew tap mongodb/brew
brew install mongodb-community@8.0
brew services start mongodb-community@8.0
```

**Windows:** install MongoDB Community Server as a Windows service. If it is stopped, open PowerShell as Administrator and run:

```powershell
Start-Service MongoDB
```

Verify the connection:

```bash
mongosh
```

If the shell opens, type `exit`.

## 2. Install project dependencies

Extract the ZIP completely and open the main **Berlin Event Hub** folder. Do not run the project from inside the ZIP.

From the main folder:

```bash
npm install
cd backend
npm install
cd ..
```

The ZIP intentionally does **not** contain `node_modules`. Never copy `node_modules` from another computer.

## 3. Create `backend/.env`

Copy `backend/.env.example` and rename the copy to `backend/.env`.

Example:

```text
JWT_SECRET=choose-a-private-local-secret
MONGO_URL=mongodb://127.0.0.1:27017
PORT=3000
APP_URL=http://localhost:5173
SENDGRID_API_KEY=
FROM_EMAIL=
```

`SENDGRID_API_KEY` and `FROM_EMAIL` are optional for local testing. Without them, email features use development preview mode in the backend terminal.

## 4. Run the project

Make sure MongoDB is running, then from the main project folder run:

```bash
npm run dev:all
```

Normally:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3000`
- Health check: `http://localhost:3000/api/health`

Open the exact **Local** URL shown by Vite. If Vite uses another port such as 5174, update `APP_URL` in `backend/.env` when testing password-reset links, then restart the project.

Stop the project with **Control + C**.

## 5. First-time database and admin setup

The MongoDB database is created automatically. Register a normal user through the website first.

To promote that user to administrator:

```bash
mongosh
```

Then run:

```javascript
use berlin_event_hub

db.users.updateOne(
  { email: "your-email@example.com" },
  { $set: { role: "admin" } }
)
```

Type `exit`, then log out of the website and log in again.

## 6. Email features

The project supports booking confirmations, password reset, and **manual admin-triggered event reminders**.

Without SendGrid credentials, these are shown as development previews so the project can still be fully tested locally. For real email delivery, add a valid SendGrid API key and verified sender email to `backend/.env`, then restart the project.

## Main features

- Public event browsing
- Search and category/location/date filters
- Event details, date, time, location, price and capacity
- Nominatim/OpenStreetMap maps
- Registration, login, JWT authentication and roles
- Booking, duplicate/sold-out/past-event protection
- Booking cancellation and user dashboard
- Profile, password change and password reset
- Admin create/edit/delete events
- Admin statistics and booking details
- Manual admin-triggered event reminders
- Responsive design

## Troubleshooting

**MongoDB connection error (`ECONNREFUSED 127.0.0.1:27017`)**  
Start MongoDB, then verify with `mongosh`.

**`npm run dev:all` says the script is missing**  
Make sure the terminal is in the main project folder, not `backend`.

**Missing `.env` / `JWT_SECRET` / `MONGO_URL`**  
Confirm the file is exactly `Berlin Event Hub/backend/.env` and contains the required values above.

**Vite / Rolldown native binding error**  
This can happen when dependencies came from another computer. Delete `node_modules` and reinstall:

```bash
rm -rf node_modules
npm install --include=optional
cd backend
rm -rf node_modules
npm install
cd ..
```

On Windows, delete both `node_modules` folders manually or with PowerShell, then run the same `npm install` commands.

**No events on a new database**  
Create an admin account using the steps above, then add events from the Admin Dashboard.

## Production build

```bash
npm run build
npm start
```

A real deployment requires a production-accessible MongoDB database and environment variables supplied by the hosting service. Never upload `backend/.env`.

## Submission links

GitHub Repository: **TO BE ADDED**  
Deployed Application: **TO BE ADDED**


## Live Application

https://berlin-event-hub-final.onrender.com
