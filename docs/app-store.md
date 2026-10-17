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
> friends. Everyone adds their own selfie. Your first video is free.

**Keywords (100)**

```
comedy,meme,skit,roast,birthday,parody,sketch,movie,trailer,selfie,cast,starring,group chat,laugh
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
> Your first video is free. After that, each video is a single $4.99 purchase. No subscription.
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
user-generated content as present, and everything else (violence, sexual content, gambling,
medical, etc.) as none or infrequent/mild. Nothing in the app is unrestricted web access.

## App Privacy (nutrition labels)

Tracking: **No**. Nothing is used for advertising or shared with data brokers.

| Data type | Collected | Linked to user | Used for |
| --- | --- | --- | --- |
| Contact Info: Email Address | Yes (Clerk sign-in) | Yes | App Functionality |
| User Content: Photos or Videos | Yes (selfies, finished videos) | Yes | App Functionality |
| User Content: Other User Content | Yes (pasted chat text, scripts) | Yes | App Functionality |
| Identifiers: User ID | Yes | Yes | App Functionality, Analytics |
| Purchases: Purchase History | Yes (RevenueCat) | Yes | App Functionality |
| Usage Data: Product Interaction | Yes (PostHog) | Yes | Analytics |
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
> The demo account already has a group, "Review Crew", with two members who added their own
> selfies, so you can make a video right away: open the group, tap New video, paste any short
> chat, pick a genre, approve the script. The first video is free and arrives in a few minutes
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
> • Anyone in a video can take it down at once from their private link; the creator can delete it
>   from the video screen. Takedowns are logged and reviewed.
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
