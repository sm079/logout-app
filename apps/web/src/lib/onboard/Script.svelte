<!--
  Script: the setup is typed too. LogOut asks in lines, one thing at a time, and reads each answer as it reads a
  log line: every piece coloured, and what it came to at the end. Suggested answers type themselves when tapped.
  An answer can say anything (units while the goals are asked are taken too), and an email address signs in.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { nf } from '../logic/format.ts';
  import { account, sendCode, verifyCode } from '../sync/account.svelte.ts';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { REDUCE, replay } from '../ui/motion.ts';
  import { placeReadouts } from '../ui/readouts.ts';
  import { answerMarkup, factsText, readAnswer, topicsOf, TOPICS, type Facts, type Mark, type Topic } from './answers.ts';
  import type { FlowProps } from './flows.ts';
  import Logo from './Mark.svelte';
  import { play, run, typeOut, type Run } from './timeline.ts';

  let { values, onfinish, onskip, onsignin }: FlowProps = $props();
  const start = untrack(() => values);

  type Said = { id: number; who: 'lo'; text: string; shown: string; first: boolean };
  type Answered = { id: number; who: 'me'; text: string; marks: Mark[]; result: string; icon: IconName; bad: boolean };
  let rows = $state<(Said | Answered)[]>([]);
  let n = 0;

  type Asked = Topic | 'email' | 'code' | 'end';
  let asked = $state<Asked>('units');
  let done = $state<Record<Topic, boolean>>({ units: false, body: false, goals: false, start: false });
  let facts = $state<Facts>({});
  let replies = $state<string[]>([]);
  let talking = $state(false);

  const units = $derived({ load: facts.load ?? start.units.load, dist: facts.dist ?? start.units.dist });
  const imperial = $derived(units.load === 'lb');
  const goals = $derived.by(() => {
    const g = { ...start.goals };
    for (const k of ['kcal', 'p', 'c', 'f', 'water', 'steps'] as const) if (facts[k] != null) g[k] = facts[k];
    return g;
  });

  /* ---------- What LogOut asks ---------- */
  const ICON: Record<Topic, IconName> = { units: 'weight', body: 'user', goals: 'flame', start: 'calendar' };
  const HINT: Record<Asked, string> = {
    units: 'kg km',
    body: imperialHint('male 5ft 10in', 'male 178cm'),
    goals: '2600kcal 180p 290c 75f',
    start: 'empty, or sample',
    email: 'you@example.com',
    code: '123456',
    end: ''
  };
  function imperialHint(i: string, m: string) {
    return start.units.load === 'lb' ? i : m;
  }
  function question(t: Topic): string {
    if (t === 'units') return 'What do you lift and run in?';
    if (t === 'body') return 'Body fat needs your sex and height. Or say skip.';
    if (t === 'goals') return 'Daily targets? Write them like a meal.';
    return 'Last one: an empty log, or years of sample logs to explore?';
  }
  function suggestions(t: Asked): string[] {
    const g = start.goals;
    if (t === 'units')
      return [...(imperial ? ['lb mi', 'kg km'] : ['kg km', 'lb mi']), 'kg mi', ...(onsignin ? ['I have an account'] : [])];
    if (t === 'body') return imperial ? ['male 5ft 10in', 'female 5ft 5in', 'skip'] : ['male 178cm', 'female 165cm', 'skip'];
    if (t === 'goals') return [`${g.kcal}kcal ${g.p}p ${g.c}c ${g.f}f`, '2000kcal 150p 200c 65f', 'water 3L 10k steps', 'keep defaults'];
    if (t === 'start') return ['empty', 'sample'];
    if (t === 'email' || t === 'code') return ['never mind'];
    return [];
  }
  // What LogOut says back, so each answer shows what it changed
  function reply(t: Topic, f: Facts, passed: boolean): string {
    if (t === 'units') return `Then 100 on its own reads as 100 ${units.load}, and 5 as 5 ${units.dist}.`;
    if (t === 'body') {
      if (facts.sex && facts.heightCm != null)
        return `Log your ${facts.sex === 'female' ? 'waist, neck and hips' : 'waist and neck'} now and then, and body fat follows.`;
      return passed ? 'Fine. It’s in your profile if you change your mind.' : 'Noted. The rest can go in your profile later.';
    }
    if (t === 'goals')
      return f.kcal != null
        ? `Food lines will count down from ${nf(goals.kcal)} kcal.`
        : `Keeping ${nf(goals.kcal)} kcal, ${goals.p}p ${goals.c}c ${goals.f}f.`;
    return facts.sample ? 'Sample on. Your own lines sit alongside it.' : 'An empty log it is.';
  }
  const next = (): Topic | null => TOPICS.find(t => !done[t]) ?? null;
  /** The setup question on screen, if one is */
  const topicOf = (a: Asked): Topic | undefined => (TOPICS.includes(a as Topic) ? (a as Topic) : undefined);

  /* ---------- Talking ---------- */
  let r: Run = run();
  let log = $state<HTMLDivElement>();
  let stick = true;
  function follow() {
    if (log && stick) log.scrollTop = log.scrollHeight;
  }

  async function say(r: Run, lines: string[]) {
    for (const text of lines) {
      const last = rows[rows.length - 1];
      rows.push({ id: ++n, who: 'lo', text, shown: '', first: last?.who !== 'lo' });
      const row = rows[rows.length - 1] as Said;
      await tick();
      await typeOut(r, text, s => ((row.shown = s), follow()), 0, 0.55);
      await r.wait(REDUCE ? 0 : 320);
    }
  }
  /** LogOut says its lines, then offers answers. Anything it hadn't finished saying is shown whole. */
  function talk(lines: string[], then: Asked) {
    hurry();
    replies = [];
    asked = then;
    talking = true;
    r = play(run(), async r => {
      await say(r, lines);
      talking = false;
      replies = suggestions(then);
    });
  }
  function hurry() {
    r.stop();
    for (const row of rows) if (row.who === 'lo') row.shown = row.text;
    talking = false;
  }

  function ask(lead: string[] = []) {
    const t = next();
    if (!t) {
      talk([...lead, 'That’s you, in a few lines. Change any of them in your profile.'], 'end');
      return;
    }
    talk([...lead, question(t)], t);
  }

  /* ---------- Answers ---------- */
  function answered(text: string, marks: Mark[], result: string, icon: IconName, bad = false) {
    rows.push({ id: ++n, who: 'me', text, marks, result, icon, bad });
    stick = true;
    tick().then(follow);
  }

  async function take(raw: string) {
    const text = raw.trim();
    if (!text) {
      replay(composer, 'shake');
      return;
    }
    hurry();
    clearField();

    // Signing in: an email, then the code it was sent
    if (asked === 'code' && /^\d[\d\s]{4,12}\d$/.test(text)) {
      answered(text, [{ s: 0, e: text.length, cls: 'tk-time' }], 'code', 'mail');
      talk(['Checking…'], 'code');
      await verifyCode(text);
      if (!account.user) talk([account.error || 'That didn’t work. Try again.'], 'code');
      else talk(['Signed in. Bringing your log over.'], 'code');
      return;
    }
    const a = readAnswer(text, topicOf(asked));
    if (a.email) {
      answered(text, a.marks, 'sign in', 'mail');
      if (!onsignin) return talk(['Signing in isn’t open here.'], next() ?? 'end');
      talk([`Sending a code to ${a.email}…`], 'email');
      await sendCode(a.email);
      if (account.step === 'code') talk(['Type the code from the email.'], 'code');
      else talk([account.error || 'That didn’t send. Check the address.'], 'email');
      return;
    }
    if ((asked === 'email' || asked === 'code') && /never ?mind|cancel|back/i.test(text)) {
      answered(text, [{ s: 0, e: text.length, cls: 'tk-note' }], '', 'x');
      return ask(['Back to it, then.']);
    }

    const topics = topicsOf(a.facts);
    const current = topicOf(asked) ?? null;
    if (!topics.size && !(a.pass && current)) {
      answered(text, a.marks, 'not read', current ? ICON[current] : 'pencil', true);
      replay(composer, 'shake');
      return talk([`I didn’t catch that. Try something like “${suggestions(current ?? 'units')[0]}”.`], asked);
    }
    Object.assign(facts, a.facts);
    for (const t of topics) done[t] = true;
    if (current && a.pass) done[current] = true;
    const about = current && (topics.has(current) || a.pass) ? current : [...topics][0]!;
    answered(text, a.marks, factsText(a.facts, imperial) || 'as it is', ICON[about]);
    ask([reply(about, a.facts, a.pass && !topics.has(about))]);
  }

  // A suggestion types itself into the field, then goes
  let auto = $state(false);
  function suggest(s: string) {
    if (s === 'I have an account') {
      hurry();
      answered(s, [{ s: 0, e: s.length, cls: 'tk-note' }], '', 'mail');
      return talk(['Type your email, and I’ll send you a code.'], 'email');
    }
    hurry();
    replies = [];
    auto = true;
    r = play(run(), async r => {
      text = '';
      await typeOut(r, s, v => (text = v), 0, 0.45);
      await r.wait(REDUCE ? 0 : 260);
      auto = false;
      void take(s);
    });
  }

  /* ---------- The field ---------- */
  let text = $state('');
  let focused = $state(false),
    clearing = $state(false);
  let composer = $state<HTMLDivElement>(),
    field = $state<HTMLDivElement>(),
    mirror = $state<HTMLDivElement>();
  const reading = $derived(text.trim() ? readAnswer(text, topicOf(asked)) : null);
  const result = $derived.by(() => {
    if (!reading) return '';
    if (reading.email) return 'sign in';
    return factsText(reading.facts, (reading.facts.load ?? units.load) === 'lb') || (reading.pass ? 'skip' : '');
  });
  function draw() {
    if (!mirror || !field) return;
    const ro = result ? `<span class="ro">${result}</span>` : '';
    // eslint-disable-next-line svelte/no-dom-manipulating
    mirror.innerHTML = `${answerMarkup(text, reading?.marks ?? [])}${ro}${auto ? '<span class="ob-caret"></span>' : ''}\u200b`;
    placeReadouts(mirror);
    field.style.height = `${Math.max(42, Math.min(mirror.offsetHeight, 96))}px`;
  }
  $effect(() => {
    void reading;
    void auto;
    void mirror;
    untrack(draw);
  });
  // The answer lifts out of the field; anything typed after it meanwhile stays
  function clearField() {
    const sent = text;
    if (!sent) return;
    clearing = true;
    setTimeout(
      () => {
        if (text === sent) text = '';
        clearing = false;
      },
      REDUCE ? 0 : 200
    );
  }

  onMount(() => {
    const lines = ['Hi. I’m LogOut, a log you type into.', 'Let’s set me up the same way, a line at a time.'];
    talk([...lines, question('units')], 'units');
    const scrolled = () => {
      if (log) stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    };
    log?.addEventListener('scroll', scrolled, { passive: true });
    document.fonts?.ready.then(draw);
    return () => {
      r.stop();
      log?.removeEventListener('scroll', scrolled);
    };
  });

  function finish() {
    onfinish({
      sex: facts.sex ?? start.sex,
      heightCm: facts.heightCm ?? start.heightCm,
      units: { ...units },
      goals,
      sample: facts.sample ?? start.sample
    });
  }
</script>

<div class="sc">
  <header class="ob-top">
    <span class="sc-who"><Logo size={22} still /><b>LogOut</b><small class:on={talking}>{talking ? 'typing…' : 'setup'}</small></span>
    <div class="ob-top-acts">
      <button type="button" class="ob-link press" onclick={onskip}>Skip</button>
    </div>
  </header>

  <div class="sc-log" bind:this={log} aria-live="polite">
    <ol>
      {#each rows as row (row.id)}
        {#if row.who === 'lo'}
          <li class="sc-lo" class:first={row.first}>
            {#if row.first}<span class="sc-av"><Logo size={16} still /></span>{/if}
            <p>
              <span class="vh">LogOut: {row.text}</span><span aria-hidden="true"
                >{row.shown}{#if row.shown.length < row.text.length}<span class="ob-caret"></span>{/if}</span
              >
            </p>
          </li>
        {:else}
          <li class="sc-me" class:bad={row.bad}>
            <span class="thumb" style={row.bad ? '--tc:#441a20;--ti:#ff8a8f' : '--tc:#363d12;--ti:#e3fb5c'}><Icon name={row.icon} /></span>
            <span class="sc-me-text">
              <code>{@html answerMarkup(row.text, row.marks)}</code>
              {#if row.result}<small>{row.result}</small>{/if}
            </span>
          </li>
        {/if}
      {/each}
    </ol>
  </div>

  <footer class="sc-foot">
    {#if asked === 'end'}
      <div class="ob-cta" class:shown={!talking}>
        <button type="button" class="log" aria-label="Start" disabled={talking} onclick={finish}>
          <span class="log-face"
            ><span class="log-title">START</span><span class="log-meta has-sum"
              >{factsText({ ...units, sample: facts.sample ?? start.sample }, imperial)}</span
            ></span
          >
        </button>
      </div>
    {:else}
      <div class="sc-replies scroller" role="group" aria-label="Answers to try">
        {#each replies as s, i (s)}
          <button type="button" class="tool press sc-reply" style="--k:{i}" onclick={() => suggest(s)}>{s}</button>
        {/each}
      </div>
      <div class="composer sc-composer" bind:this={composer}>
        <div class="field" class:has-text={!!text} class:focused class:clearing bind:this={field}>
          <label for="scEntry" class="vh">Your answer</label>
          <div class="ghost" aria-hidden="true"><span>{HINT[asked]}</span><span class="gcaret"></span></div>
          <div class="mirror" bind:this={mirror} aria-hidden="true"></div>
          <textarea
            id="scEntry"
            rows="1"
            spellcheck="false"
            autocomplete={asked === 'email' ? 'email' : asked === 'code' ? 'one-time-code' : 'off'}
            inputmode={asked === 'code' ? 'numeric' : asked === 'email' ? 'email' : 'text'}
            maxlength="200"
            bind:value={text}
            onfocus={() => (focused = true)}
            onblur={() => (focused = false)}
            onkeydown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void take(text);
              }
            }}></textarea>
        </div>
        <button type="button" class="sc-send press" aria-label="Send" disabled={!text.trim()} onclick={() => take(text)}>
          <span class="ic"><Icon name="check" /></span>
        </button>
      </div>
    {/if}
  </footer>
</div>
