import { html } from 'hono/html';

/** The plain, phone-sized layout of the public web pages: invites, manage links and legal. */
export const page = (title: string, body: ReturnType<typeof html>) =>
  html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${title}</title>
        <style>
          /* The app's "Opening Night" look: velvet ground, house-light text, one amber bulb. System
             fonts only, so a friend's browser contacts no third party before they agree to anything. */
          :root {
            color-scheme: dark;
            --velvet: #1a0e16;
            --card: #251520;
            --raised: #33202c;
            --line: #4a3140;
            --cream: #fff3e2;
            --dust: #bba2ab;
            --bulb: #ffb53d;
            --on-bulb: #2a1405;
            --display: 'Avenir Next', system-ui, sans-serif;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font:
              17px/1.5 -apple-system,
              system-ui,
              sans-serif;
            background: var(--velvet);
            color: var(--cream);
            margin: 0 auto;
            max-width: 480px;
            padding: 32px 20px 56px;
          }
          .eyebrow {
            font:
              700 12px/1 ui-monospace,
              monospace;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--bulb);
            margin: 0 0 12px;
          }
          h1 {
            font: 800 34px/1.02 var(--display);
            letter-spacing: -0.03em;
            margin: 0 0 12px;
            text-wrap: balance;
          }
          a {
            color: var(--bulb);
            word-break: break-all;
          }
          label {
            display: block;
            margin: 24px 0 8px;
            font:
              700 12px/1 ui-monospace,
              monospace;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--dust);
          }
          input[type='text'] {
            width: 100%;
            padding: 15px 16px;
            font-size: 17px;
            color: var(--cream);
            background: var(--raised);
            border-radius: 16px;
            border: 1.5px solid transparent;
            outline: none;
          }
          input[type='text']:focus {
            border-color: var(--bulb);
          }
          .visually-hidden {
            position: absolute;
            width: 1px;
            height: 1px;
            opacity: 0;
            overflow: hidden;
          }
          .shot {
            width: 200px;
            height: 200px;
            margin: 8px auto 0;
            border-radius: 50%;
            border: 2px dashed var(--bulb);
            background: var(--card);
            display: grid;
            place-items: center;
            overflow: hidden;
            cursor: pointer;
            font:
              15px/1.3 -apple-system,
              system-ui,
              sans-serif;
            letter-spacing: 0;
            text-transform: none;
            color: var(--dust);
            text-align: center;
          }
          .shot:has(img:not([hidden])) {
            border: 4px solid var(--bulb);
          }
          .shot:focus-within {
            outline: 2px solid var(--cream);
            outline-offset: 4px;
          }
          img.preview {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .check {
            display: flex;
            gap: 12px;
            align-items: flex-start;
            background: var(--card);
            border-radius: 18px;
            padding: 16px;
            margin-top: 12px;
            font:
              15px/1.45 -apple-system,
              system-ui,
              sans-serif;
            letter-spacing: 0;
            text-transform: none;
            color: var(--cream);
          }
          .check input {
            accent-color: var(--bulb);
            width: 20px;
            height: 20px;
            margin: 1px 0 0;
            flex: none;
          }
          .check ul {
            margin: 8px 0 0;
            padding-left: 18px;
            color: var(--dust);
          }
          button {
            width: 100%;
            margin-top: 28px;
            padding: 17px;
            font: 800 17px var(--display);
            color: var(--on-bulb);
            background: var(--bulb);
            border: 0;
            border-radius: 18px;
            box-shadow: 0 10px 30px -10px var(--bulb);
            cursor: pointer;
          }
          button:active {
            transform: scale(0.98);
          }
          button.secondary {
            margin-top: 12px;
            padding: 13px;
            font-size: 15px;
            color: var(--cream);
            background: transparent;
            border: 1px solid var(--line);
            box-shadow: none;
          }
          h2 {
            font: 800 22px/1.1 var(--display);
            letter-spacing: -0.02em;
            margin: 40px 0 8px;
          }
          ul.videos {
            list-style: none;
            padding: 0;
            margin: 16px 0 0;
            display: grid;
            gap: 12px;
          }
          ul.videos li {
            background: var(--card);
            border-radius: 18px;
            padding: 16px;
          }
          button:disabled {
            opacity: 0.5;
          }
          .muted {
            color: var(--dust);
          }
          .card {
            background: var(--card);
            border-radius: 18px;
            padding: 16px;
            margin-top: 16px;
          }
          .error {
            color: #ff6b6b;
          }
          @media (prefers-reduced-motion: reduce) {
            button:active {
              transform: none;
            }
          }
        </style>
      </head>
      <body>
        ${body}
      </body>
    </html>`;
