<svelte:head>
  <title>Privacy · LogOut</title>
  <meta name="description" content="What LogOut keeps, where, and what it sends." />
</svelte:head>

<main class="s-doc">
  <h1>Privacy</h1>
  <p class="s-small">Last updated October 12, 2026</p>

  <p>
    LogOut is a fitness log you type into. This page says what it keeps, where it keeps it, and what it sends anywhere else. The short
    version: your log stays on your device unless you sign in to sync it, and nothing reads your entries but the app on your own device.
  </p>

  <h2>On your device</h2>
  <p>
    What you type (your entries), the names you give items, your profile (goals, sex and height if you add them, units) and your widget
    choices are stored in your browser’s storage on this device. All reading and adding up happens on the device. Without an account, none
    of it leaves the device.
  </p>

  <h2>If you sign in to sync</h2>
  <p>
    Signing in uses your email address: we send a one-time code to it. Once signed in, your entries, item names, profile and widget choices
    are stored on our server so your other devices can get them. The server stores your text as you typed it and does not read, analyse or
    share it. Data is held with our database and authentication provider (Supabase) in South Korea (Seoul).
  </p>
  <p>
    Signing out removes your log from that device; it stays in your account. To delete your account and everything stored with it, use
    Delete account in the profile, or contact us.
  </p>

  <h2>Usage and errors</h2>
  <p>
    To improve the app we may collect anonymous usage events (for example that a screen was opened or an entry was logged, never what it
    said), counted by PostHog, and reports of errors the app runs into, which go to Sentry. Neither includes the text of your entries. If
    you turn on “Help improve reading” in your profile, lines that the app couldn’t read are sent with item names and notes removed, so we
    can teach it to read them.
  </p>

  <h2>Hosting</h2>
  <p>
    The site and the app are served by Cloudflare, and error reports pass through it on their way to Sentry. Like any web host, it sees the
    network address each request comes from. It gets none of your log.
  </p>

  <h2>What we don’t do</h2>
  <p>
    We don’t sell your data, show ads, or share your log with anyone. There are no third-party trackers in the app beyond the ones named
    above.
  </p>

  <h2>Your data</h2>
  <p>
    Export gives you everything as one file at any time, from the profile. Import brings a file back. Clear entries deletes everything
    you’ve logged on the device.
  </p>

  <h2>Changes</h2>
  <p>If this page changes in a way that matters, the app will say so before the change applies.</p>
</main>
