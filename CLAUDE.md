# TaskBoard (Whiteboards)

AI-powered personal productivity system with task management, brainstorming, and proactive AI assistance.

## Tech Stack

Vanilla JS, Vite, Supabase (cloud sync + auth), Claude API (AI features).

## Getting Started

```sh
npm install
npm run dev      # local dev server
npm test         # run test suite
npm run build    # production build
```

## Module Architecture

The app is split into ~24 source modules in `src/`:

| Module | Purpose |
|---|---|
| `app.js` | Entry point — wires all modules together, initializes Supabase |
| `constants.js` | Shared constants (storage keys, colors, defaults, `MS_PER_DAY`) |
| `utils.js` | Pure utility functions (escaping, sanitization, string similarity, ID generation) |
| `dates.js` | Pure date utilities (formatting, relative time, natural-language date parsing) |
| `parsers.js` | Pure parsing/transformation functions for AI responses and user input |
| `migrations.js` | Schema versioning and data migration system |
| `data.js` | Data layer — persistence, CRUD, undo system, task queries, archive management |
| `dashboard.js` | Dashboard rendering, sidebar, project view, archive, sorting |
| `events.js` | Event delegation, keyboard shortcuts, modal management |
| `ui-helpers.js` | Toasts, subtask progress, tags, bulk mode, smart date inputs, notifications |
| `task-editor.js` | Task rendering, editing, inline commands, dependencies, CRUD modals |
| `calendar.js` | Week/month calendar views |
| `brainstorm.js` | Brainstorm/dump input, file attachments, AI-powered task extraction |
| `quick-add.js` | Quick capture, slash commands, AI task enhancement, bulk actions |
| `chat.js` | AI chat panel, messaging, history |
| `ai.js` | AI API layer — communication with Claude API |
| `ai-context.js` | AI persona, context building, memory management, action execution |
| `proactive.js` | Proactive AI — daily briefing, day plan, nudges, reflections, stuck detection |
| `focus.js` | Focus mode overlay and timer |
| `weekly-review.js` | Weekly review rendering and AI review generation |
| `command-palette.js` | Search/command palette, shortcut help, AI palette queries |
| `settings.js` | Settings panel, project CRUD, data import/export, AI memory management |
| `auth.js` | Authentication, onboarding, and session management |
| `sync.js` | Cloud sync, conflict detection, sync UI |

## Tests

- Framework: Vitest (with jsdom environment)
- 1200+ tests across 30+ test files in `src/__tests__/`
- Run: `npm test` or `npx vitest run`

## Key Patterns

- **Factory functions with dependency injection**: Most modules export a `create*` factory that receives dependencies as a `deps` object, enabling easy testing and decoupling.
- **Event delegation via `data-action`**: UI events are handled through delegated listeners that match `data-action` attributes on elements.
- **Dual storage: localStorage + Supabase sync**: Data is persisted locally first, then synced to Supabase when the user is authenticated.
