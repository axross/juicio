---
status: accepted
---

# Store User Settings in AsyncStorage

Settings' language and theme choices need to persist across app launches, and
this project already has a persistence layer wired: `expo-sqlite` with
Drizzle, carrying an `app_meta` key/value table and a migration path.

User settings are persisted in AsyncStorage instead of that existing store.

Two alternatives were rejected. `expo-sqlite` with Drizzle was rejected
despite costing no new dependency — writing settings into the already-wired
`app_meta` table would have been the cheaper path — because a synchronous
read before first paint is what a theme choice needs to avoid a visible
flash, and reading through Drizzle's async query layer for two small values
does not fit that need well. `react-native-mmkv` was rejected too: its
synchronous reads would remove the startup-ordering problem outright, but it
is a native module, and adding one for two key/value settings was judged
disproportionate.

This adds a new dependency and leaves the app with two persistence stores —
AsyncStorage for settings, SQLite for everything else — rather than one.
Settings must be read before the first paint, or the theme visibly switches
after launch; the app's startup sequence has to account for that ordering.
