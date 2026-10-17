# App Store submission

Everything App Store Connect asks for, ready to paste. The privacy policy, terms and support pages
are served by the API, so the URLs below use the API's public address (`PUBLIC_URL`).

## Listing

| Field | Value |
| --- | --- |
| Name (30) | Inside Joke: AI Group Videos |
| Subtitle (30) | Funny Video Maker for Friends |
| Primary category | Entertainment |
| Secondary category | Photo & Video |
| Privacy policy URL | `<PUBLIC_URL>/privacy` |
| Support URL | `<PUBLIC_URL>/support` |
| Copyright | 2026 Nadav Galili |

**Promotional text (170)**

> Paste a moment from your group chat, pick a genre, and get a 15-second comedy starring your
> friends. Everyone adds their own selfie. Your first video is on us.

**Keywords (100)**

```
comedy,meme,skit,roast,birthday,prank,sketch,movie,trailer,selfie,cast,starring,group chat,laugh
```

**Description**

> Your group chat already wrote the comedy. Inside Joke turns it into a movie.
>
> Paste the moment everyone is still laughing about, pick a genre, and Inside Joke writes a short
> script and shoots a 15-second video starring your actual friends. Send it back to the chat and
> watch it land.
>
> HOW IT WORKS
> • Start a group and share its invite link in your real chat.
> • Each friend adds their own selfie from the link. Nobody can add someone else's face.
> • Paste a bit of the chat and pick a genre: 80s action trailer, nature documentary, telenovela
>   and more.
> • Read the script, tweak the lines, then roll camera.
> • Your video is ready in minutes, with subtitles in your chat's language.
>
> PRIVATE BY DESIGN
> • The chat text is deleted as soon as you approve the script.
> • Friends can remove their face, or take down any video they're in, at any time.
> • Every video is labelled as AI-generated.
>
> PRICING
> Your first video is free, with a small Inside Joke watermark. After that, each video is a single
> $4.99 purchase with no watermark. No subscription.
>
> Inside Joke is for adults 18 and over.

**What's New (first version)**: leave empty; it isn't shown for a first release.

## In-app purchase

| Field | Value |
| --- | --- |
| Type | Consumable |
| Reference name | One video |
| Product ID | `video_15s` |
| Price | $4.99 (Tier 5) |
| Display name | One Video |
| Description | One 15-second video starring your friends. |
| Review screenshot | The script screen with the "Roll camera" ticket |
| Review notes | Bought on the script screen once the free video is used. |

Submit the purchase together with the first app version, or App Review won't see it.

## Age rating

Answer the questionnaire so it comes out at **18+**: the app itself requires it. Mark
user-generated content as present and AI-generated content as yes, and everything else (violence,
sexual content, gambling, medical, etc.) as none or infrequent/mild. Nothing in the app is
unrestricted web access.

## App Privacy (nutrition labels)

Tracking: **No**. Nothing is used for advertising or shared with data brokers.

| Data type | Collected | Linked to user | Used for |
| --- | --- | --- | --- |
| Contact Info: Email Address | Yes (Clerk sign-in) | Yes | App Functionality |
| User Content: Photos or Videos | Yes (selfies, finished videos) | Yes | App Functionality |
| User Content: Other User Content | Yes (pasted chat text, scripts) | Yes | App Functionality |
| Identifiers: User ID | Yes | Yes | App Functionality, Analytics |
| Purchases: Purchase History | Yes (RevenueCat) | Yes | App Functionality |
| Usage Data: Product Interaction | Yes (PostHog, only after the user opts in) | Yes | Analytics |
| Diagnostics: Crash Data | Yes (Sentry) | No | App Functionality |
| Diagnostics: Performance Data | Yes (Sentry) | No | App Functionality |

Not collected: location, contacts, health, financial info (Apple handles payment), browsing
history, search history, sensitive info, device ID.

If PostHog or Sentry keys are left out of the build, their rows can be dropped.

## App Review notes

Paste into App Review Information → Notes:

> Inside Joke makes a short AI comedy video from a group-chat moment, starring friends who each
> added their own selfie.
>
> Sign in: use the demo account below (email sign-in; the code is 424242), or Sign in with Apple.
>
> The demo account already has a group, "Review Crew": the account's owner and one friend, each
> with their own selfie. A video needs at least two people, so cast both: open the group, tap New
> video, paste any short chat, pick a genre, approve the script. The first video is free and arrives in a few minutes
> with a notification. To test the $4.99 purchase, make a second video and buy it on the script
> screen (sandbox).
>
> Consent and safety:
> • Before any text or photo leaves the device, the consent screen names the AI providers
>   (Anthropic and fal) and what each receives (guideline 5.1.2(i)), and asks the user to confirm
>   they're 18+.
> • A face can only come from that person's own selfie: the app user takes theirs with the front
>   camera, and friends add theirs on the group's invite page, with their own consent.
> • Every finished video is checked for safety before it's delivered and carries an
>   "AI-generated" label.
> • Anyone in a video can take it down at once from their private link, and can remove their
>   face so nobody can cast them again; the creator can delete it from the video screen. Every
>   takedown is logged, and Support (Settings → Support) reaches us.
> • There is no public feed: videos are only seen by the person who made them and whoever they
>   send them to. Scripts are written to tease, never humiliate, and the user can edit them
>   before anything is filmed.
> • Account deletion: Settings → Delete account.

**Demo account (sign-in)**: App Review can't receive an email code, so the demo account uses
Clerk's test mode:

1. Clerk dashboard (production instance) → Instance Settings → turn on test mode.
2. Sign in once in the app with `review+clerk_test@<your domain>` and code `424242`.
3. Add a selfie, create the group "Review Crew", and have one more real person join it from the
   invite link with their own selfie.
4. Put that email and code in App Review Information → Sign-in required.

Only addresses containing `+clerk_test` accept the fixed code, so real accounts are unaffected.
Clerk discourages test mode in production because anyone can sign up a `+clerk_test` address
without a real inbox, so turn it off again once the app is approved (and turn it on for each new
review).

## Before submitting

- Set `SUPPORT_EMAIL` on the API service in Railway so the support and privacy pages show a
  contact address.
- Open `<PUBLIC_URL>/privacy` and `<PUBLIC_URL>/support` once to check they load.
- Screenshots: 6.9" iPhone (1320 × 2868), 3 to 10 of them. The genre picker, the script ticket and
  a finished video playing are the strongest three.

## Final gate: full QA before "Submit for Review"

Submission is the last step, and it happens only after every box below is ticked on the exact
build being submitted. Run it from TestFlight on a real iPhone, against the production API and
worker, signed in with a sandbox Apple account. A failing box blocks submission until it's fixed
and the whole list is run again on the new build.

**Install and sign in**

- [ ] Fresh install from TestFlight opens to the sign-in screen with no error or blank screen.
- [ ] Sign in with Apple works, including "Hide my email".
- [ ] Email code sign-in works for a new address (sign-up) and an existing one.
- [ ] The review demo account signs in with its code.
- [ ] Sign out, then sign back in: the same groups and videos come back.

**Consent and selfie**

- [ ] The consent screen names Anthropic and fal and what each gets, and needs the 18+ box before
      continuing.
- [ ] Denying camera permission shows a way forward, not a dead end; allowing it opens the front
      camera.
- [ ] The selfie uploads and shows in Settings. Retake replaces it; Remove my face removes it.

**Groups and friends**

- [ ] Create a group; the invite link shares through the iOS share sheet.
- [ ] The invite page opens in Safari on another phone: name, selfie (camera and photo library),
      the three consent boxes, Join. The friend then shows in the group with a face.
- [ ] The friend's private link removes their face, and takes down a video they're in.

**Script**

- [ ] New video: paste a short chat (one in Hebrew too), pick each genre once, choose the cast.
- [ ] The script arrives; subtitles are in the chat's language (Hebrew right-to-left).
- [ ] Edit a line and a subtitle, save, reopen: the edit stuck. Regenerate works up to its limit.

**Payment**

- [ ] First video: Roll camera spends the free video with no purchase sheet.
- [ ] Second video: the $4.99 sheet shows the right price; cancelling returns quietly with no error.
- [ ] Buying with the sandbox account adds the video and starts filming within a few seconds.
- [ ] Settings shows credits correctly after a purchase.

**Video**

- [ ] The video finishes, a push notification arrives, and tapping it opens the video.
- [ ] It plays with sound, burned-in subtitles and the "AI-generated" label; the free video also
      has the watermark and the paid one doesn't.
- [ ] Share sends the file to WhatsApp and saves it to Photos.
- [ ] Delete video removes it from the group list.

**Account and legal**

- [ ] Settings → Privacy, Terms and Support open and load.
- [ ] Delete account asks to confirm, signs out, and signing in again starts a fresh account.

**Compliance**

- [ ] The usage-stats box starts unticked. With it off, PostHog's live view shows no events; after
      ticking it in Settings, events appear.
- [ ] The invite page links to the privacy policy and terms next to its consent boxes.
- [ ] The privacy page names the data controller with a postal address and the support email.
- [ ] Delete account removes the user's groups, selfies and videos from R2 and the user from Clerk.
- [ ] Remove my face deletes the selfie, and that person can't be cast in a new video.
- [ ] Report a problem on a finished video creates a report and a Sentry alert.
- [ ] An offensive line typed into the script is blocked before filming, and the free video or
      credit comes back.
- [ ] The $4.99 price shown comes from the App Store, and a cancelled purchase charges nothing.
- [ ] In App Store Connect: the in-app purchase is submitted with the version, the privacy labels
      match this doc with tracking set to No, and the age rating includes AI-generated content.
- [ ] The build upload gets no privacy manifest warning email from Apple (ITMS-91053).

**Everywhere**

- [ ] Airplane mode on any screen shows a friendly error and recovers when back online.
- [ ] No crashes in Sentry and no red errors in the device log during the run.
- [ ] Every screen reads well on the smallest supported iPhone and with large text.

Note the build number and the date the list passed, then submit that build.
