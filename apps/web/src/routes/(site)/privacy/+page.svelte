<script lang="ts">
  import { resolve } from '$app/paths';

  // Who handles what, for the table at the end
  const SERVICES: [string, string, string][] = [
    ['Supabase', 'Accounts and sync', 'South Korea'],
    ['Resend', 'Sending sign-in codes', 'United States'],
    ['Cloudflare', 'Serving the site and the app', 'Worldwide'],
    ['PostHog', 'Usage counts', 'United States'],
    ['Sentry', 'Error reports', 'United States']
  ];
</script>

<svelte:head>
  <title>Privacy · LogOut</title>
  <meta name="description" content="What LogOut keeps, where, and what it sends." />
</svelte:head>

<main class="s-doc">
  <h1>Privacy</h1>
  <p class="s-small">Last updated October 14, 2026</p>

  <div class="s-tldr">
    <h2>The short version</h2>
    <ul>
      <li>Your log is yours. Without an account, it never leaves your device.</li>
      <li>If you sign in, we store it so your devices can sync. We don’t read it, sell it or show ads.</li>
      <li>We count how the site and app are used, and collect error reports. Never what you type.</li>
      <li>You can export or delete everything at any time.</li>
    </ul>
  </div>

  <h2>Who we are</h2>
  <p>
    LogOut (“we”) is an independent app. For anything about this page or your data, write to
    <a href="mailto:contact@logout.fit">contact@logout.fit</a>.
  </p>

  <h2>What stays on your device</h2>
  <p>
    What you log, the names you give items, your profile (goals, units, and your sex, height and weight if you add them) and your widget
    choices are kept in your browser’s storage. Reading your lines and adding up your day happen on your device. Without an account, none of
    it leaves the device.
  </p>

  <h2>If you sign in</h2>
  <p>
    Signing in uses your email address: we send a one-time code to it. Once you’re signed in, your log, item names, profile and widget
    choices are stored with your account so your other devices can get them. They’re stored as you typed them, and we don’t read, analyse or
    share them.
  </p>
  <p>
    Signing out removes your log from that device; it stays in your account. Deleting your account (in the profile) removes your log and
    your email address from our database.
  </p>

  <h2>What we collect to run and improve LogOut</h2>
  <p>
    <strong>Usage counts.</strong> We count visits to the site and events in the app, such as a screen being opened or an entry being logged.
    These record what kind of thing happened, never what an entry says. They’re tied to a random ID, and to your account ID once you sign in,
    not to your email. There’s no session recording and no tracking across other sites.
  </p>
  <p>
    <strong>Error reports.</strong> When something breaks, we get a report of what failed, your browser and the app version. Reports don’t include
    what you’ve logged.
  </p>
  <p>
    <strong>Help improve reading.</strong> Off unless you turn it on in your profile. When it’s on, lines the app couldn’t read are sent to us
    with item names and notes removed, so we can teach it to read them.
  </p>
  <p>Like any website, our host sees the network address each request comes from.</p>

  <h2>What we don’t do</h2>
  <p>
    We don’t sell your data, show ads, or share your log with anyone. Your entries are never sent to an AI service. There are no trackers
    beyond the services listed below.
  </p>

  <h2>How long we keep it</h2>
  <p>
    Your account and log are kept until you delete your account. Usage counts are kept for up to a year and error reports for up to 90 days.
  </p>

  <h2>Your choices</h2>
  <p>
    From the profile, Export gives you your whole log as one file at any time, Import brings a file back, and Clear entries deletes
    everything logged on that device. You can use LogOut without an account at all. You can also ask us for a copy of your data, or for it
    to be deleted, at <a href="mailto:contact@logout.fit">contact@logout.fit</a>.
  </p>

  <h2>Children</h2>
  <p>LogOut isn’t for children under 13. If we learn that someone under 13 has an account, we’ll delete it.</p>

  <h2>Services we use</h2>
  <p>These handle data for us, only for the purposes below. Your data may be processed in a country other than your own.</p>
  <div class="s-table">
    <table>
      <thead><tr><th>Service</th><th>What for</th><th>Where</th></tr></thead>
      <tbody>
        {#each SERVICES as [name, what, where] (name)}
          <tr><td>{name}</td><td>{what}</td><td>{where}</td></tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h2>Changes</h2>
  <p>
    If this page changes in a way that matters, the app will say so before the change applies. See also the
    <a href={resolve('/(site)/terms')}>terms</a>.
  </p>
</main>
